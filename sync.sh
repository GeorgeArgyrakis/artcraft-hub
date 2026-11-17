#!/usr/bin/env bash
set -Eeuo pipefail

CATALOG_FILE="${CATALOG_FILE:-/config/catalog.json}"
TARGET_DIR="${TARGET_DIR:-/data}"
MAX_RELEASES="${MAX_RELEASES:-3}"
SYNC_LOCK="/tmp/sync.lock"

# Concurrency lock protection (compatible with switch_api.py trigger_sync, CLI, and cron)
acquire_lock() {
  while true; do
    if (set -C; echo "$$" > "${SYNC_LOCK}") 2>/dev/null; then
      return 0
    fi
    local locked_pid
    locked_pid=$(cat "${SYNC_LOCK}" 2>/dev/null || echo "")
    if [ -n "${locked_pid}" ] && kill -0 "${locked_pid}" 2>/dev/null; then
      echo "[WARN] Another sync process (PID ${locked_pid}) is already running. Exiting." >&2
      exit 0
    fi
    # Lock is stale; remove and retry
    rm -f "${SYNC_LOCK}" 2>/dev/null || true
  done
}
acquire_lock

cleanup_on_exit() {
  local exit_code=$?
  rm -f "${SYNC_LOCK}" /tmp/gh_disc_hdr.* /tmp/gh_body.* /tmp/gh_hdr_* /tmp/gh_body_* 2>/dev/null || true
  if [ "${exit_code}" -ne 0 ]; then
    local ts
    ts=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    local existing_err=""
    local existing_rl=false
    if [ -f "${TARGET_DIR}/.sync_status.json" ]; then
      existing_err=$(jq -r '.last_error // empty' "${TARGET_DIR}/.sync_status.json" 2>/dev/null || echo "")
      existing_rl=$(jq -r '.rate_limited // false' "${TARGET_DIR}/.sync_status.json" 2>/dev/null || echo "false")
    fi
    local tmp_status="${TARGET_DIR}/.sync_status.json.tmp.$$"
    jq -n \
      --arg status "idle" \
      --arg last_sync "${ts}" \
      --argjson last_success false \
      --argjson rate_limited "${existing_rl}" \
      --arg last_error "${existing_err}" \
      --argjson exit_code "${exit_code}" \
      '{status: $status, last_sync: $last_sync, last_success: $last_success, rate_limited: $rate_limited, last_error: $last_error, exit_code: $exit_code}' \
      > "${tmp_status}" 2>/dev/null || true
    mv -f "${tmp_status}" "${TARGET_DIR}/.sync_status.json" 2>/dev/null || true
  fi
}
trap cleanup_on_exit EXIT

# GitHub authentication header (top-level scope accessible by all functions)
auth_header=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
  auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

# ---------------------------------------------------------------------------
# Return merged catalog JSON (bundled container defaults + user overrides)
# ---------------------------------------------------------------------------
get_merged_catalog_json() {
  local master_file=""
  for p in "/usr/local/share/artcraft/catalog.json" "./config/catalog.json"; do
    if [ -f "$p" ]; then
      master_file="$p"
      break
    fi
  done

  local user_file="${CATALOG_FILE:-/config/catalog.json}"

  local master_json="{}"
  if [ -n "${master_file}" ] && [ -f "${master_file}" ]; then
    local m_content
    m_content=$(cat "${master_file}" 2>/dev/null || echo "{}")
    if echo "${m_content}" | jq -e 'type == "object"' >/dev/null 2>&1; then
      master_json="${m_content}"
    fi
  fi

  local user_json="{}"
  if [ -f "${user_file}" ]; then
    local u_content
    u_content=$(cat "${user_file}" 2>/dev/null || echo "{}")
    if echo "${u_content}" | jq -e 'type == "object"' >/dev/null 2>&1; then
      user_json="${u_content}"
    fi
  fi

  # Deep merge user overrides on top of master defaults
  jq -n --argjson master "${master_json}" --argjson user "${user_json}" '
    $master * $user
  ' 2>/dev/null || echo "${master_json}"
}

# ---------------------------------------------------------------------------
# Read active app list from merged catalog (excluding visible: false)
# ---------------------------------------------------------------------------
read_apps() {
  local apps=()
  local catalog_json
  catalog_json=$(get_merged_catalog_json)

  # Read repos defined in combined catalog where visible is not false
  while IFS= read -r repo || [ -n "$repo" ]; do
    [[ -z "$repo" ]] && continue
    apps+=("$repo")
  done < <(echo "${catalog_json}" | jq -r 'to_entries[] | select(.value.visible != false) | .value.repo // empty' 2>/dev/null || true)

  if [ ${#apps[@]} -eq 0 ]; then
    echo "[WARN] No active apps found in combined catalog. Nothing to sync." >&2
    return 1
  fi

  printf '%s\n' "${apps[@]}" | sort -u
}

# ---------------------------------------------------------------------------
# Update versions.json for an app
# ---------------------------------------------------------------------------
update_versions_json() {
  local app="$1"
  local releases_dir="${TARGET_DIR}/${app}/releases"
  local versions_file="${TARGET_DIR}/${app}/versions.json"
  local active_file="${TARGET_DIR}/${app}/active.txt"

  local active=""
  [ -f "${active_file}" ] && active=$(cat "${active_file}")

  # Read existing releases array from versions.json to preserve downloaded_at timestamps
  local existing_json="{}"
  [ -f "${versions_file}" ] && existing_json=$(cat "${versions_file}")

  # Build releases array from directories on disk, sorted newest-first (lexicographic desc)
  local releases_json="[]"
  if [ -d "${releases_dir}" ]; then
    local rel_lines=()
    while IFS= read -r d || [ -n "$d" ]; do
      [[ -z "$d" ]] && continue
      # Get downloaded_at from existing json or use current time
      local existing_at
      existing_at=$(echo "${existing_json}" | jq -r --arg t "${d}" '.releases[]? | select(.tag == $t) | .downloaded_at // empty')
      if [ -z "${existing_at}" ]; then
        existing_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
      fi
      rel_lines+=("{\"tag\":\"${d}\",\"downloaded_at\":\"${existing_at}\"}")
    done < <(ls -1 "${releases_dir}" 2>/dev/null | sort -rV)

    if [ ${#rel_lines[@]} -gt 0 ]; then
      releases_json=$(printf '%s\n' "${rel_lines[@]}" | jq -s '.')
    fi
  fi

  local tmp_vf="${versions_file}.tmp.$$"
  jq -n \
    --arg app "${app}" \
    --arg active "${active}" \
    --argjson releases "${releases_json}" \
    '{"app": $app, "active": $active, "releases": $releases}' \
    > "${tmp_vf}"
  mv -f "${tmp_vf}" "${versions_file}"
}

# ---------------------------------------------------------------------------
# Prune old releases beyond MAX_RELEASES, never prune the active one
# ---------------------------------------------------------------------------
prune_releases() {
  local app="$1"
  local releases_dir="${TARGET_DIR}/${app}/releases"
  local active_file="${TARGET_DIR}/${app}/active.txt"

  local active=""
  [ -f "${active_file}" ] && active=$(cat "${active_file}")

  if [ ! -d "${releases_dir}" ]; then return; fi

  # List releases sorted oldest-first; skip the active one
  local all_releases
  mapfile -t all_releases < <(ls -1 "${releases_dir}" 2>/dev/null | sort -V)

  local count=${#all_releases[@]}
  local to_delete=$(( count - MAX_RELEASES ))

  if [ "${to_delete}" -le 0 ]; then return; fi

  local deleted=0
  for tag in "${all_releases[@]}"; do
    [ "${deleted}" -ge "${to_delete}" ] && break
    if [ "${tag}" = "${active}" ]; then
      continue
    fi
    echo "  [PRUNE] Removing old release ${app}@${tag}"
    rm -rf "${releases_dir:?}/${tag:?}"
    deleted=$(( deleted + 1 ))
  done
}

# ---------------------------------------------------------------------------
# Migrate old-style /data/{app}/* layout to new releases layout
# ---------------------------------------------------------------------------
migrate_if_needed() {
  local app="$1"
  local app_dir="${TARGET_DIR}/${app}"

  # If releases/ subdir already exists, no migration needed
  if [ -d "${app_dir}/releases" ]; then return; fi

  # If version.txt exists (old layout), migrate
  if [ -f "${app_dir}/version.txt" ]; then
    local old_tag
    old_tag=$(cat "${app_dir}/version.txt")
    echo "  [MIGRATE] Moving ${app} old layout → releases/${old_tag}/"
    local releases_dir="${app_dir}/releases"
    local tmp_dir="${app_dir}/_migrate_tmp"
    mkdir -p "${tmp_dir}"

    # Move all files except version.txt into tmp, then into releases/{tag}/
    find "${app_dir}" -mindepth 1 -maxdepth 1 \
      ! -name 'releases' ! -name '_migrate_tmp' ! -name 'version.txt' \
      -exec mv {} "${tmp_dir}/" \;

    mkdir -p "${releases_dir}/${old_tag}"
    cp -r "${tmp_dir}"/. "${releases_dir}/${old_tag}/"
    rm -rf "${tmp_dir}" "${app_dir}/version.txt"

    # Write active.txt
    echo "${old_tag}" > "${app_dir}/active.txt"

    # Create symlink
    ln -sfn "releases/${old_tag}" "${app_dir}/current"

    update_versions_json "${app}"
    echo "  [MIGRATE] Done."
  fi
}

# ---------------------------------------------------------------------------
# Download official vector master icon (.svg) from repository
# ---------------------------------------------------------------------------
sync_app_icon() {
  local repo="$1"
  local app="$2"
  local icon_dest="${TARGET_DIR}/icons/${app}.svg"

  mkdir -p "${TARGET_DIR}/icons"

  if [ -s "${icon_dest}" ]; then
    return 0
  fi

  echo "  [ICON] Fetching official vector icon for ${app}..."
  local icon_urls=(
    "https://raw.githubusercontent.com/${repo}/HEAD/assets/app-icon/${app}.svg"
    "https://raw.githubusercontent.com/${repo}/main/assets/app-icon/${app}.svg"
    "https://raw.githubusercontent.com/${repo}/master/assets/app-icon/${app}.svg"
  )

  local fetched=false
  for url in "${icon_urls[@]}"; do
    if curl -sfL --retry 2 "${auth_header[@]}" "${url}" -o "${icon_dest}.tmp.$$" 2>/dev/null; then
      if [ -s "${icon_dest}.tmp.$$" ]; then
        mv -f "${icon_dest}.tmp.$$" "${icon_dest}"
        echo "  [ICON] Saved official icon to ${icon_dest}"
        fetched=true
        break
      fi
    fi
    rm -f "${icon_dest}.tmp.$$" 2>/dev/null || true
  done

  if [ "${fetched}" = false ]; then
    echo "  [ICON] Official icon not found at assets/app-icon/${app}.svg"
  fi
}

# ---------------------------------------------------------------------------
# Fetch and cache raster preview graphic to /data/previews/${app}.webp
# ---------------------------------------------------------------------------
sync_app_preview() {
  local app="$1"
  local preview_file="${TARGET_DIR}/previews/${app}.webp"
  mkdir -p "${TARGET_DIR}/previews"

  if [ -f "${preview_file}" ]; then
    return 0
  fi

  local hero_name="hero"
  [ "${app}" = "filmcraft" ] && hero_name="color"
  local preview_url="https://getartcraft.com/images/apps/${app}/${hero_name}.webp"

  if curl -sfL --retry 2 --max-time 8 "${preview_url}" -o "${preview_file}.tmp.$$" 2>/dev/null; then
    mv -f "${preview_file}.tmp.$$" "${preview_file}"
    echo "  [PREVIEW] Cached offline preview for ${app}"
  else
    rm -f "${preview_file}.tmp.$$" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Curated metadata lookup for discovered ArtCraft apps
# ---------------------------------------------------------------------------
get_app_metadata() {
  local app="$1"
  local clean_title
  clean_title=$(echo "${app}" | sed -E 's/[-_]/ /g' | awk '{for(i=1;i<=NF;i++)$i=toupper(substr($i,1,1)) substr($i,2)}1' 2>/dev/null || echo "${app}")
  if [ -z "${clean_title}" ]; then
    clean_title="${app}"
  fi
  clean_title=$(echo "${clean_title}" | sed 's/craft$/Craft/')

  local category="Graphics & Photo"
  local categoryTag="$(echo "${clean_title}" | tr '[:lower:]' '[:upper:]') STUDIO"
  local accentColor="#4f46e5"
  local tagline="Open-source ${clean_title} creative application."
  local desc="Open-source ${clean_title} creative application built with WebAssembly."
  local webReady=true

  jq -n \
    --arg app "${app}" \
    --arg repo "storytold/${app}" \
    --arg title "${clean_title}" \
    --arg category "${category}" \
    --arg categoryTag "${categoryTag}" \
    --arg accentColor "${accentColor}" \
    --arg tagline "${tagline}" \
    --arg desc "${desc}" \
    --argjson visible true \
    --argjson webReady "${webReady}" \
    '{app: $app, repo: $repo, title: $title, category: $category, categoryTag: $categoryTag, accentColor: $accentColor, tagline: $tagline, desc: $desc, visible: $visible, webReady: $webReady}'
}

# ---------------------------------------------------------------------------
# Check if new ArtCraft apps were published upstream
# ---------------------------------------------------------------------------
discover_new_apps() {
  local discovered_file="${TARGET_DIR}/.discovered_apps.json"
  echo "Checking for newly published ArtCraft apps..."

  local candidates=()

  # 1. Fetch official ArtCraft app lineup from https://getartcraft.com/
  local site_html
  site_html=$(curl -sfL --retry 2 --max-time 10 "https://getartcraft.com/" 2>/dev/null || echo "")
  if [ -n "${site_html}" ]; then
    while IFS= read -r app || [ -n "$app" ]; do
      [[ -z "$app" ]] && continue
      candidates+=("${app}")
    done < <(echo "${site_html}" | grep -oE '/images/apps/[a-z0-9_-]+/icon\.webp' | sed -E 's|/images/apps/||; s|/icon\.webp||' | sort -u || true)
  fi

  # 2. If getartcraft.com returned nothing (offline/blocked), fallback to GitHub organization query
  if [ ${#candidates[@]} -eq 0 ]; then
    local disc_etag_file="${TARGET_DIR}/.discovery_etag"
    local disc_etag_hdr=()
    if [ -s "${disc_etag_file}" ]; then
      local cached_disc_etag
      cached_disc_etag=$(cat "${disc_etag_file}" 2>/dev/null | tr -d '\r\n')
      [ -n "${cached_disc_etag}" ] && disc_etag_hdr=(-H "If-None-Match: ${cached_disc_etag}")
    fi

    local disc_hdr_tmp disc_body_tmp
    disc_hdr_tmp=$(mktemp /tmp/gh_disc_hdr.XXXXXX)
    disc_body_tmp=$(mktemp /tmp/gh_body.XXXXXX)
    local disc_code
    disc_code=$(curl -s --max-time 10 \
      -w "%{http_code}" \
      -D "${disc_hdr_tmp}" \
      -o "${disc_body_tmp}" \
      "${auth_header[@]}" \
      "${disc_etag_hdr[@]}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/orgs/storytold/repos?type=public&per_page=100" 2>/dev/null || echo "000")

    if [ "${disc_code}" = "304" ]; then
      echo "  [DISCOVER] GitHub org repos unmodified (304 Not Modified)"
    elif [ "${disc_code}" = "200" ]; then
      local new_disc_etag
      new_disc_etag=$(grep -i '^etag:' "${disc_hdr_tmp}" 2>/dev/null | tail -n 1 | tr -d '\r\n' | sed -e 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//' || true)
      if [ -n "${new_disc_etag}" ]; then
        echo "${new_disc_etag}" > "${disc_etag_file}.tmp.$$" 2>/dev/null || true
        mv -f "${disc_etag_file}.tmp.$$" "${disc_etag_file}" 2>/dev/null || true
      fi
      local gh_repos
      gh_repos=$(cat "${disc_body_tmp}" 2>/dev/null || echo "[]")
      if [ -n "${gh_repos}" ] && [ "${gh_repos}" != "[]" ]; then
        while IFS= read -r app || [ -n "$app" ]; do
          [[ -z "$app" ]] && continue
          candidates+=("${app}")
        done < <(echo "${gh_repos}" | jq -r '.[]? | select(.name | test("^[a-z]+craft$|^craft-anything$")) | select(.name | test("^(artcraft|crafthub)$") | not) | .name' 2>/dev/null || true)
      fi
    fi
    rm -f "${disc_hdr_tmp}" "${disc_body_tmp}" 2>/dev/null || true
  fi

  # Deduplicate candidate apps
  local unique_candidates=()
  if [ ${#candidates[@]} -gt 0 ]; then
    mapfile -t unique_candidates < <(printf '%s\n' "${candidates[@]}" | tr '[:upper:]' '[:lower:]' | grep -E '^[a-z0-9_-]+$' | sort -u)
  fi

  # Read existing catalog keys from combined catalog to exclude already-registered applications
  local existing_keys=()
  local catalog_json
  catalog_json=$(get_merged_catalog_json)
  mapfile -t existing_keys < <(echo "${catalog_json}" | jq -r 'keys[]' 2>/dev/null || true)

  local new_discovered=()
  for c in "${unique_candidates[@]}"; do
    local is_known=false
    for k in "${existing_keys[@]}"; do
      if [ "$c" = "$k" ]; then
        is_known=true
        break
      fi
    done
    if [ "$is_known" = false ]; then
      new_discovered+=("$c")
    fi
  done

  if [ ${#new_discovered[@]} -gt 0 ]; then
    echo "  [DISCOVER] Found ${#new_discovered[@]} new ArtCraft app(s) not in catalog: ${new_discovered[*]}"
    local discovered_json="[]"
    for app in "${new_discovered[@]}"; do
      sync_app_icon "storytold/${app}" "${app}"
      local meta
      meta=$(get_app_metadata "${app}")

      # Dynamically detect if latest GitHub release has a WebAssembly asset (*web*.zip)
      local is_wr=false
      local rel_json
      rel_json=$(curl -s --max-time 6 "${auth_header[@]}" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/storytold/${app}/releases/latest" 2>/dev/null || echo "{}")
      if echo "${rel_json}" | jq -e '.assets | type == "array" and length > 0' >/dev/null 2>&1; then
        if echo "${rel_json}" | jq -e '.assets[]? | select(.name | ascii_downcase | test("web.*\\.zip$"))' >/dev/null 2>&1; then
          is_wr=true
        else
          is_wr=false
        fi
      else
        is_wr=$(echo "${meta}" | jq -r '.webReady // false')
      fi

      meta=$(echo "${meta}" | jq --argjson wr "${is_wr}" '.webReady = $wr')

      if [ "${is_wr}" = "true" ]; then
        echo "  [DISCOVER] ${app} identified (WebAssembly release available!)"
        discovered_json=$(jq -n --argjson list "${discovered_json}" --argjson item "${meta}" '$list + [$item]')
      else
        echo "  [DISCOVER] ${app} skipped (desktop-only upstream; WebAssembly build in development)"
      fi
    done
    echo "${discovered_json}" > "${discovered_file}" 2>/dev/null || true
  else
    echo "  [DISCOVER] No new ArtCraft apps found."
    echo "[]" > "${discovered_file}" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Build/Update the suite dashboard index.html
# ---------------------------------------------------------------------------
build_dashboard() {
  local index_file="${TARGET_DIR}/index.html"
  echo "Updating suite dashboard at ${index_file}..."

  if [ -f "/config/custom_index.html" ]; then
    cp "/config/custom_index.html" "${index_file}"
    echo "  [INFO] Copied custom dashboard from /config/custom_index.html"
  elif [ -f "/usr/local/share/artcraft/index.html" ]; then
    cp "/usr/local/share/artcraft/index.html" "${index_file}"
    echo "  [INFO] Copied dashboard template from /usr/local/share/artcraft/index.html"
  elif [ -f "./index.html" ]; then
    cp "./index.html" "${index_file}"
    echo "  [INFO] Copied local index.html to ${index_file}"
  fi
}

# ---------------------------------------------------------------------------
# Main sync
# ---------------------------------------------------------------------------
sync_releases() {
  local target_app="${1:-}"
  local status_file="${TARGET_DIR}/.sync_status.json"
  echo "{\"status\":\"syncing\",\"started_at\":\"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"}" > "${status_file}" 2>/dev/null || true

  # Clean up stale temporary archive directories from aborted runs
  rm -rf /tmp/*_extract /tmp/*.zip 2>/dev/null || true

  local APPS=()
  if [ -n "${target_app}" ]; then
    target_app=$(basename "${target_app}" | tr '[:upper:]' '[:lower:]')
    local catalog_json
    catalog_json=$(get_merged_catalog_json)
    local is_visible
    is_visible=$(echo "${catalog_json}" | jq -r --arg a "${target_app}" '.[$a].visible // true')
    if [ "${is_visible}" = "false" ]; then
      echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Skipping '${target_app}': app is marked visible: false in catalog."
      build_dashboard
      return 0
    fi
    local repo_found=""
    while IFS= read -r r || [ -n "$r" ]; do
      [[ -z "$r" ]] && continue
      local r_base
      r_base=$(basename "$r" | tr '[:upper:]' '[:lower:]')
      if [ "${r_base}" = "${target_app}" ]; then
        repo_found="$r"
        break
      fi
    done < <(read_apps 2>/dev/null || true)

    if [ -n "${repo_found}" ]; then
      APPS+=("${repo_found}")
      echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Targeted single-app sync: '${target_app}' (${repo_found})"
    else
      APPS+=("storytold/${target_app}")
      echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Targeted single-app sync using repo 'storytold/${target_app}'"
    fi
  else
    echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Starting ArtCraft release sync..."
    if ! mapfile -t APPS < <(read_apps 2>/dev/null); then
      build_dashboard
      return 0
    fi
  fi

  if [ ${#APPS[@]} -eq 0 ]; then
    echo "[WARN] catalog.json has no applications to sync."
    build_dashboard
    return 0
  fi

  auth_header=()
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi

  local any_updated=false
  local any_error=false
  local rate_limited=false
  local last_error=""

  for repo_path in "${APPS[@]}"; do
    repo_path="${repo_path// /}"
    [ -z "${repo_path}" ] && continue

    local reponame
    reponame=$(basename "${repo_path}")
    local app_dir="${TARGET_DIR}/${reponame}"

    echo "  Checking ${repo_path}..."

    # Fetch official vector master icon and offline preview graphic
    sync_app_icon "${repo_path}" "${reponame}"
    sync_app_preview "${reponame}"

    # Run migration from old layout if needed
    migrate_if_needed "${reponame}"

    mkdir -p "${app_dir}"

    local etag_file="${app_dir}/.etag"
    local etag_header=()
    if [ -s "${etag_file}" ] && [ -e "${app_dir}/current" ] && [ -f "${app_dir}/versions.json" ]; then
      local cached_etag
      cached_etag=$(cat "${etag_file}" 2>/dev/null | tr -d '\r\n')
      if [ -n "${cached_etag}" ]; then
        etag_header=(-H "If-None-Match: ${cached_etag}")
      fi
    fi

    local api_url="https://api.github.com/repos/${repo_path}/releases/latest"
    local hdr_tmp body_tmp
    hdr_tmp=$(mktemp "/tmp/gh_hdr_${reponame}.XXXXXX")
    body_tmp=$(mktemp "/tmp/gh_body_${reponame}.XXXXXX")

    local http_code
    http_code=$(curl -s --max-time 10 \
      -w "%{http_code}" \
      -D "${hdr_tmp}" \
      -o "${body_tmp}" \
      "${auth_header[@]}" \
      "${etag_header[@]}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "${api_url}" 2>/dev/null || echo "000")

    # 304 Not Modified: zero rate-limit consumed, releases are completely up to date
    if [ "${http_code}" = "304" ]; then
      echo "  [UP-TO-DATE] ${reponame} (304 Not Modified)"
      rm -f "${hdr_tmp}" "${body_tmp}" 2>/dev/null || true
      update_versions_json "${reponame}"
      continue
    fi

    local resp
    resp=$(cat "${body_tmp}" 2>/dev/null || echo '{}')

    local new_etag
    new_etag=$(grep -i '^etag:' "${hdr_tmp}" 2>/dev/null | tail -n 1 | tr -d '\r\n' | sed -e 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//' || true)
    rm -f "${hdr_tmp}" "${body_tmp}" 2>/dev/null || true

    local err_msg
    err_msg=$(echo "${resp}" | jq -r '.message // empty' 2>/dev/null || true)
    local is_rl=false
    if [[ "${err_msg}" =~ [Rr]ate\ limit ]] || [ "${http_code}" = "429" ] || { [ "${http_code}" = "403" ] && [[ "${err_msg}" =~ [Aa]PI\ rate\ limit ]]; }; then
      is_rl=true
    fi

    local tag=""
    local download_url=""
    local releases_dir="${app_dir}/releases"

    # If GitHub API is rate-limited, fallback to web HTML release check (zero rate-limit)
    if [ "${is_rl}" = true ]; then
      echo "  [INFO] GitHub API rate-limited for ${repo_path}. Checking web release fallback..."
      local web_loc
      web_loc=$(curl -sI --max-time 10 "https://github.com/${repo_path}/releases/latest" 2>/dev/null | grep -i '^location:' || true)
      local web_tag=""
      if [ -n "${web_loc}" ]; then
        web_tag=$(echo "${web_loc}" | tail -n 1 | sed -nE 's|^[Ll]ocation:.*\/tag\/([^/?#\r\n]+).*|\1|p' | tr -d '\r\n' || true)
      fi

      if [ -n "${web_tag}" ]; then
        local tag_dir="${releases_dir}/${web_tag}"
        if [ -d "${tag_dir}" ]; then
          echo "  [OK] ${reponame} already has ${web_tag} (verified via web fallback)"
          [ -f "${app_dir}/active.txt" ] || echo "${web_tag}" > "${app_dir}/active.txt"
          if [ ! -L "${app_dir}/current" ]; then
            ln -sfn "releases/${web_tag}" "${app_dir}/current"
          fi
          update_versions_json "${reponame}"
          continue
        fi

        # New or missing version: resolve web zip asset URL via expanded_assets HTML
        local assets_html
        assets_html=$(curl -sfL --max-time 15 "https://github.com/${repo_path}/releases/expanded_assets/${web_tag}" 2>/dev/null || true)
        local web_asset_rel=""
        if [ -n "${assets_html}" ]; then
          web_asset_rel=$(echo "${assets_html}" | grep -oiE '/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/releases/download/[^"'\''<>]+web[^"'\''<>]+\.zip' | head -n 1 || true)
        fi
        if [ -n "${web_asset_rel}" ]; then
          tag="${web_tag}"
          download_url="https://github.com${web_asset_rel}"
        else
          echo "  [WARN] Web fallback: no matching web zip asset found in expanded_assets for ${repo_path}@${web_tag}"
        fi
      else
        echo "  [WARN] Web fallback: unable to resolve release tag from redirect for ${repo_path}"
      fi

      if [ -z "${download_url}" ] && [ -z "${tag}" ]; then
        # If uninstalled and cannot resolve download URL, flag rate-limit error
        if [ ! -e "${app_dir}/current" ]; then
          echo "  [ERROR] GitHub API rate limit exceeded for ${repo_path}! Set GITHUB_TOKEN in docker-compose.yml to increase the limit from 60 to 5,000 req/hr." >&2
          any_error=true
          rate_limited=true
          last_error="GitHub API rate limit exceeded (60 req/hr). Set GITHUB_TOKEN in docker-compose.yml to raise limit to 5,000 req/hr."
          continue
        else
          # App is already installed on disk, so keep existing version safely
          echo "  [OK] ${reponame} keeping installed version on disk (API rate limited)"
          update_versions_json "${reponame}"
          continue
        fi
      fi
    fi

    if [ -z "${tag}" ]; then
      tag=$(echo "${resp}" | jq -r '.tag_name // empty' 2>/dev/null || true)
    fi

    if [ -z "${tag}" ]; then
      echo "  [SKIP] No release found for ${repo_path}"
      continue
    fi

    local tag_dir="${releases_dir}/${tag}"

    # Already have this version
    if [ -d "${tag_dir}" ]; then
      echo "  [OK] ${reponame} already has ${tag}"
      # Ensure symlink and metadata are consistent
      [ -f "${app_dir}/active.txt" ] || echo "${tag}" > "${app_dir}/active.txt"
      if [ ! -L "${app_dir}/current" ]; then
        ln -sfn "releases/${tag}" "${app_dir}/current"
      fi
      if [ -n "${new_etag}" ]; then
        echo "${new_etag}" > "${etag_file}.tmp.$$" 2>/dev/null || true
        mv -f "${etag_file}.tmp.$$" "${etag_file}" 2>/dev/null || true
      fi
      update_versions_json "${reponame}"
      continue
    fi

    echo "  [NEW] ${reponame}: new release ${tag}"

    # Find web zip asset
    if [ -z "${download_url}" ]; then
      download_url=$(echo "${resp}" | jq -r '
        .assets[]?
        | select(.name | ascii_downcase | test("web.*\\.zip$"))
        | .browser_download_url' 2>/dev/null | head -n 1)
    fi

    if [ -z "${download_url}" ]; then
      echo "  [WARN] No WebAssembly (*web*.zip) asset found for ${reponame} ${tag}. Skipping."
      update_versions_json "${reponame}"
      continue
    fi

    echo "  Downloading: ${download_url}"
    local tmp_zip tmp_extract
    tmp_zip=$(mktemp "/tmp/${reponame}_zip.XXXXXX")
    tmp_extract=$(mktemp -d "/tmp/${reponame}_extract.XXXXXX")
    rm -rf "${tmp_zip}" "${tmp_extract}"
    mkdir -p "${tmp_extract}" "${releases_dir}"

    if curl -sL --retry 3 --retry-delay 5 -f -o "${tmp_zip}" "${download_url}"; then
      unzip -q -o "${tmp_zip}" -d "${tmp_extract}"

      mkdir -p "${tag_dir}"

      # Handle nested zip folder
      local n_dirs n_files
      n_dirs=$(find "${tmp_extract}" -mindepth 1 -maxdepth 1 -type d | wc -l)
      n_files=$(find "${tmp_extract}" -mindepth 1 -maxdepth 1 -type f | wc -l)
      if [ "${n_dirs}" -eq 1 ] && [ "${n_files}" -eq 0 ]; then
        local subdir
        subdir=$(find "${tmp_extract}" -mindepth 1 -maxdepth 1 -type d | head -n 1)
        cp -r "${subdir}"/. "${tag_dir}/"
      else
        cp -r "${tmp_extract}"/. "${tag_dir}/"
      fi

      rm -rf "${tmp_zip}" "${tmp_extract}"

      # Update active symlink to this new release
      ln -sfn "releases/${tag}" "${app_dir}/current"
      echo "${tag}" > "${app_dir}/active.txt"

      # Save cached ETag now that release is verified on disk
      if [ -n "${new_etag}" ]; then
        echo "${new_etag}" > "${etag_file}.tmp.$$" 2>/dev/null || true
        mv -f "${etag_file}.tmp.$$" "${etag_file}" 2>/dev/null || true
      fi

      # Update metadata
      update_versions_json "${reponame}"

      # Prune old releases
      prune_releases "${reponame}"

      # Re-update after prune (removes pruned entries)
      update_versions_json "${reponame}"

      any_updated=true
      echo "  [DONE] ${reponame} → ${tag} (active)"
    else
      echo "  [ERROR] Failed to download ${download_url}"
      rm -rf "${tmp_zip}" "${tmp_extract}" "${tag_dir}"
      any_error=true
    fi
  done

  # Check for newly published ArtCraft apps upstream (only on full suite sync)
  if [ -z "${target_app}" ]; then
    discover_new_apps
  fi

  build_dashboard

  local ts
  ts=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  local discovered_count=0
  if [ -f "${TARGET_DIR}/.discovered_apps.json" ]; then
    discovered_count=$(jq '. | length' "${TARGET_DIR}/.discovered_apps.json" 2>/dev/null || echo 0)
  fi
  local last_success=true
  if [ "${any_error}" = true ] || [ "${rate_limited}" = true ]; then
    last_success=false
  fi
  local tmp_status="${TARGET_DIR}/.sync_status.json.tmp.$$"
  jq -n \
    --arg status "idle" \
    --arg last_sync "${ts}" \
    --argjson last_success "${last_success}" \
    --argjson rate_limited "${rate_limited}" \
    --arg last_error "${last_error}" \
    --argjson discovered_count "${discovered_count}" \
    '{status: $status, last_sync: $last_sync, last_success: $last_success, rate_limited: $rate_limited, last_error: $last_error, discovered_count: $discovered_count}' \
    > "${tmp_status}" 2>/dev/null || true
  mv -f "${tmp_status}" "${TARGET_DIR}/.sync_status.json" 2>/dev/null || true

  echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Sync complete."
}

sync_releases "$@"
