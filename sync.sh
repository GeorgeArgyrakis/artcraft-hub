#!/usr/bin/env bash
set -Eeuo pipefail

CONF_FILE="${CONF_FILE:-/config/apps.conf}"
TARGET_DIR="${TARGET_DIR:-/data}"
MAX_RELEASES="${MAX_RELEASES:-3}"

cleanup_on_exit() {
  local exit_code=$?
  rm -f "/tmp/sync.lock" 2>/dev/null || true
  if [ "${exit_code}" -ne 0 ]; then
    local ts
    ts=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    echo "{\"status\":\"idle\",\"last_sync\":\"${ts}\",\"last_success\":false,\"exit_code\":${exit_code}}" > "${TARGET_DIR}/.sync_status.json" 2>/dev/null || true
  fi
}
trap cleanup_on_exit EXIT

# ---------------------------------------------------------------------------
# Read app list from conf file
# ---------------------------------------------------------------------------
read_apps() {
  if [ ! -f "${CONF_FILE}" ]; then
    echo "[WARN] No apps.conf found at ${CONF_FILE}. Nothing to sync." >&2
    return 1
  fi
  grep -v '^\s*#' "${CONF_FILE}" | grep -v '^\s*$' || true
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
    releases_json=$(
      for d in $(ls -1 "${releases_dir}" 2>/dev/null | sort -rV); do
        # Get downloaded_at from existing json or use current time
        local existing_at
        existing_at=$(echo "${existing_json}" | jq -r --arg t "${d}" '.releases[]? | select(.tag == $t) | .downloaded_at // empty')
        if [ -z "${existing_at}" ]; then
          existing_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
        fi
        echo "{\"tag\":\"${d}\",\"downloaded_at\":\"${existing_at}\"}"
      done | jq -s '.'
    )
  fi

  jq -n \
    --arg app "${app}" \
    --arg active "${active}" \
    --argjson releases "${releases_json}" \
    '{"app": $app, "active": $active, "releases": $releases}' \
    > "${versions_file}"
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
    cp -rT "${tmp_dir}" "${releases_dir}/${old_tag}/"
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
    if curl -sfL --retry 2 "${auth_header[@]}" "${url}" -o "${icon_dest}.tmp" 2>/dev/null; then
      if [ -s "${icon_dest}.tmp" ]; then
        mv "${icon_dest}.tmp" "${icon_dest}"
        echo "  [ICON] Saved official icon to ${icon_dest}"
        fetched=true
        break
      fi
    fi
    rm -f "${icon_dest}.tmp"
  done

  if [ "${fetched}" = false ]; then
    echo "  [ICON] Official icon not found at assets/app-icon/${app}.svg"
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
  local status_file="${TARGET_DIR}/.sync_status.json"
  echo "{\"status\":\"syncing\",\"started_at\":\"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"}" > "${status_file}" 2>/dev/null || true

  echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Starting ArtCraft release sync..."

  local APPS=()
  if ! mapfile -t APPS < <(read_apps 2>/dev/null); then
    build_dashboard
    return 0
  fi

  if [ ${#APPS[@]} -eq 0 ]; then
    echo "[WARN] apps.conf is empty or has only comments."
    build_dashboard
    return 0
  fi

  local auth_header=()
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi

  local any_updated=false

  for repo_path in "${APPS[@]}"; do
    repo_path="${repo_path// /}"
    [ -z "${repo_path}" ] && continue

    local reponame
    reponame=$(basename "${repo_path}")
    local app_dir="${TARGET_DIR}/${reponame}"

    echo "  Checking ${repo_path}..."

    # Fetch official vector master icon from repository assets/app-icon/<app>.svg
    sync_app_icon "${repo_path}" "${reponame}"

    # Run migration from old layout if needed
    migrate_if_needed "${reponame}"

    local api_url="https://api.github.com/repos/${repo_path}/releases/latest"
    local resp
    resp=$(curl -sf --retry 3 --retry-delay 5 \
      "${auth_header[@]}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "${api_url}" 2>/dev/null || echo '{}')

    local tag
    tag=$(echo "${resp}" | jq -r '.tag_name // empty')
    if [ -z "${tag}" ]; then
      echo "  [SKIP] No release found for ${repo_path}"
      continue
    fi

    local releases_dir="${app_dir}/releases"
    local tag_dir="${releases_dir}/${tag}"

    # Already have this version
    if [ -d "${tag_dir}" ]; then
      echo "  [OK] ${reponame} already has ${tag}"
      # Ensure symlink and metadata are consistent
      [ -f "${app_dir}/active.txt" ] || echo "${tag}" > "${app_dir}/active.txt"
      if [ ! -L "${app_dir}/current" ]; then
        ln -sfn "releases/${tag}" "${app_dir}/current"
      fi
      update_versions_json "${reponame}"
      continue
    fi

    echo "  [NEW] ${reponame}: new release ${tag}"

    # Find web zip asset
    local download_url
    download_url=$(echo "${resp}" | jq -r '
      .assets[]
      | select(.name | ascii_downcase | test("web.*\\.zip$"))
      | .browser_download_url' | head -n 1)

    if [ -z "${download_url}" ]; then
      echo "  [WARN] No *web*.zip asset found for ${reponame} ${tag}. Skipping."
      continue
    fi

    echo "  Downloading: ${download_url}"
    local tmp_zip="/tmp/${reponame}_$$.zip"
    local tmp_extract="/tmp/${reponame}_$$_extract"
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
        cp -rT "${subdir}" "${tag_dir}/"
      else
        cp -r "${tmp_extract}"/. "${tag_dir}/"
      fi

      rm -rf "${tmp_zip}" "${tmp_extract}"

      # Update active symlink to this new release
      ln -sfn "releases/${tag}" "${app_dir}/current"
      echo "${tag}" > "${app_dir}/active.txt"

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
    fi
  done

  build_dashboard

  local ts
  ts=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  echo "{\"status\":\"idle\",\"last_sync\":\"${ts}\",\"last_success\":true}" > "${TARGET_DIR}/.sync_status.json" 2>/dev/null || true
  rm -f "/tmp/sync.lock" 2>/dev/null || true

  echo "[$(date -u +'%Y-%m-%d %H:%M:%SZ')] Sync complete."
}

sync_releases
