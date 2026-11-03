#!/usr/bin/env bash
# fetch-icons.sh — Download official vector master icons (.svg) from storytold repositories.
# Canonical Vector Masters are located at assets/app-icon/<app>.svg inside each repo root.
#
# Usage: fetch-icons.sh [optional-repo-or-app]
# Example: fetch-icons.sh storytold/photocraft
# Or run with no arguments to fetch icons for all apps in catalog.json:
# Example: fetch-icons.sh

set -Eeuo pipefail

CATALOG_FILE="${CATALOG_FILE:-/config/catalog.json}"
TARGET_DIR="${TARGET_DIR:-/data}"
ICONS_DIR="${TARGET_DIR}/icons"

mkdir -p "${ICONS_DIR}"

# Auth header if token set
auth_header=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
  auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

fetch_single_icon() {
  local repo_path="$1"
  local app
  app=$(basename "${repo_path}")
  local dest="${ICONS_DIR}/${app}.svg"

  echo "Fetching official icon for ${app} from ${repo_path}..."

  # Candidate URLs on GitHub: master SVG and Linux desktop icon themes
  local urls=(
    "https://raw.githubusercontent.com/${repo_path}/HEAD/assets/app-icon/${app}.svg"
    "https://raw.githubusercontent.com/${repo_path}/main/assets/app-icon/${app}.svg"
    "https://raw.githubusercontent.com/${repo_path}/master/assets/app-icon/${app}.svg"
    "https://raw.githubusercontent.com/${repo_path}/HEAD/assets/app-icon/hicolor/scalable/apps/ai.storyteller.${app}.svg"
    "https://raw.githubusercontent.com/${repo_path}/main/assets/app-icon/hicolor/scalable/apps/ai.storyteller.${app}.svg"
    "https://raw.githubusercontent.com/${repo_path}/HEAD/assets/app-icon/hicolor/scalable/apps/${app}.svg"
    "https://raw.githubusercontent.com/${repo_path}/main/assets/app-icon/hicolor/scalable/apps/${app}.svg"
  )

  local success=false
  for url in "${urls[@]}"; do
    if curl -sfL --retry 2 "${auth_header[@]}" "${url}" -o "${dest}.tmp" 2>/dev/null; then
      if [ -s "${dest}.tmp" ]; then
        mv "${dest}.tmp" "${dest}"
        echo "  ✓ Saved ${app}.svg (${url})"
        success=true
        break
      fi
    fi
    rm -f "${dest}.tmp"
  done

  if [ "${success}" = false ]; then
    echo "  ⚠ Official icon not found at assets/app-icon/${app}.svg (will use stylized fallback)."
  fi
}

if [ "$#" -ge 1 ]; then
  # Fetch for specified repo
  repo_arg="$1"
  if [[ "${repo_arg}" != *"/"* ]]; then
    repo_arg="storytold/${repo_arg}"
  fi
  fetch_single_icon "${repo_arg}"
else
  # Fetch for all apps in catalog.json
  all_repos=()

  if [ -f "${CATALOG_FILE}" ]; then
    while IFS= read -r r || [ -n "$r" ]; do
      [[ -z "$r" ]] && continue
      all_repos+=("$r")
    done < <(jq -r 'to_entries[] | .value.repo // empty' "${CATALOG_FILE}" 2>/dev/null || true)
  fi

  echo "=== Synchronizing official vector icons from GitHub ==="
  for repo in $(printf '%s\n' "${all_repos[@]}" 2>/dev/null | sort -u); do
    fetch_single_icon "${repo}"
  done
  echo "=== Icon synchronization complete ==="
fi
