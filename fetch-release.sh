#!/usr/bin/env bash
# fetch-release.sh — Download a specific GitHub release tag for an ArtCraft app.
# The release is added alongside existing ones but does NOT change the active version.
#
# Usage:   fetch-release.sh <org/repo> <tag>
# Example: fetch-release.sh storytold/photocraft v0.17.0

set -Eeuo pipefail

REPO="${1:?Usage: fetch-release.sh org/repo tag  (e.g. storytold/photocraft v0.17.0)}"
TAG="${2:?Usage: fetch-release.sh org/repo tag  (e.g. storytold/photocraft v0.17.0)}"
TARGET_DIR="${TARGET_DIR:-/data}"
REPONAME=$(basename "${REPO}")
TAG_DIR="${TARGET_DIR}/${REPONAME}/releases/${TAG}"

echo "=== fetch-release: ${REPO}@${TAG} ==="

# ── Auth ──────────────────────────────────────────────────────────────────────
auth_header=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
  auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

# ── Fetch official icon if missing ───────────────────────────────────────────
ICON_DEST="${TARGET_DIR}/icons/${REPONAME}.svg"
if [ ! -s "${ICON_DEST}" ]; then
  mkdir -p "${TARGET_DIR}/icons"
  curl -sfL "${auth_header[@]}" "https://raw.githubusercontent.com/${REPO}/HEAD/assets/app-icon/${REPONAME}.svg" -o "${ICON_DEST}" 2>/dev/null || true
fi

# ── Already downloaded? ───────────────────────────────────────────────────────
if [ -d "${TAG_DIR}" ]; then
  echo "[OK] Already on disk: ${TAG_DIR}"
  echo "     To activate: POST /api/${REPONAME}/switch/${TAG}"
  exit 0
fi

# ── Fetch release metadata ────────────────────────────────────────────────────
echo "Fetching release metadata from GitHub..."
HDR_TMP="/tmp/${REPONAME}_hdr_$$.tmp"
BODY_TMP="/tmp/${REPONAME}_body_$$.tmp"

HTTP_CODE=$(curl -s --max-time 10 \
  -w "%{http_code}" \
  -D "${HDR_TMP}" \
  -o "${BODY_TMP}" \
  "${auth_header[@]}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" 2>/dev/null || echo "000")

RESP=$(cat "${BODY_TMP}" 2>/dev/null || echo '{}')
rm -f "${HDR_TMP}" "${BODY_TMP}" 2>/dev/null || true

ERR_MSG=$(echo "${RESP}" | jq -r '.message // empty' 2>/dev/null || echo "")
IS_RL=false
if [[ "${ERR_MSG}" =~ [Rr]ate\ limit ]] || [ "${HTTP_CODE}" = "429" ] || { [ "${HTTP_CODE}" = "403" ] && [[ "${ERR_MSG}" =~ [Aa]PI\ rate\ limit ]]; }; then
  IS_RL=true
fi

DOWNLOAD_URL=""

# ── Web fallback if GitHub API is rate-limited ────────────────────────────────
if [ "${IS_RL}" = true ]; then
  echo "[INFO] GitHub API rate-limited. Resolving assets via web fallback..."
  WEB_ASSET_REL=$(curl -sfL --max-time 15 "https://github.com/${REPO}/releases/expanded_assets/${TAG}" 2>/dev/null | grep -oiE '/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/releases/download/[^"'\''<>]+web[^"'\''<>]+\.zip' | head -n 1 || true)
  if [ -n "${WEB_ASSET_REL}" ]; then
    DOWNLOAD_URL="https://github.com${WEB_ASSET_REL}"
  else
    echo "[ERROR] GitHub API rate limit exceeded and web fallback could not locate release '${TAG}'! Set GITHUB_TOKEN to raise your limit to 5,000 req/hr." >&2
    exit 1
  fi
fi

if [ -z "${DOWNLOAD_URL}" ]; then
  ACTUAL_TAG=$(echo "${RESP}" | jq -r '.tag_name // empty' 2>/dev/null || true)
  if [ -z "${ACTUAL_TAG}" ]; then
    echo "[ERROR] Release '${TAG}' not found for ${REPO}."
    echo "        Check available releases at: https://github.com/${REPO}/releases"
    exit 1
  fi

  # ── Find asset ────────────────────────────────────────────────────────────────
  DOWNLOAD_URL=$(echo "${RESP}" | jq -r '
    .assets[]?
    | select(.name | ascii_downcase | test("web.*\\.zip$"))
    | .browser_download_url' 2>/dev/null | head -n 1)

  if [ -z "${DOWNLOAD_URL}" ]; then
    echo "[ERROR] No *web*.zip asset found for ${REPO}@${TAG}."
    echo "        Available assets:"
    echo "${RESP}" | jq -r '  .assets[]?.name' 2>/dev/null || echo "  (none)"
    exit 1
  fi
fi

# ── Download & extract ────────────────────────────────────────────────────────
echo "Downloading: ${DOWNLOAD_URL}"
TMP_ZIP="/tmp/${REPONAME}_fetch_$$.zip"
TMP_EXTRACT="/tmp/${REPONAME}_fetch_$$_extract"
rm -rf "${TMP_ZIP}" "${TMP_EXTRACT}"
mkdir -p "${TMP_EXTRACT}" "${TARGET_DIR}/${REPONAME}/releases"

if ! curl -L --retry 3 --retry-delay 5 -f --progress-bar \
    -o "${TMP_ZIP}" "${DOWNLOAD_URL}"; then
  rm -rf "${TMP_ZIP}" "${TMP_EXTRACT}"
  echo "[ERROR] Download failed."
  exit 1
fi

unzip -q -o "${TMP_ZIP}" -d "${TMP_EXTRACT}"
mkdir -p "${TAG_DIR}"

# Handle nested zip folder (zip contains a single top-level subdirectory)
N_DIRS=$(find "${TMP_EXTRACT}" -mindepth 1 -maxdepth 1 -type d | wc -l)
N_FILES=$(find "${TMP_EXTRACT}" -mindepth 1 -maxdepth 1 -type f | wc -l)
if [ "${N_DIRS}" -eq 1 ] && [ "${N_FILES}" -eq 0 ]; then
  SUBDIR=$(find "${TMP_EXTRACT}" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  cp -rT "${SUBDIR}" "${TAG_DIR}/"
else
  cp -r "${TMP_EXTRACT}"/. "${TAG_DIR}/"
fi

rm -rf "${TMP_ZIP}" "${TMP_EXTRACT}"
echo "[DONE] Extracted to ${TAG_DIR}"

# ── Update versions.json ─────────────────────────────────────────────────────
VERSIONS_FILE="${TARGET_DIR}/${REPONAME}/versions.json"
EXISTING_JSON="{}"
[ -f "${VERSIONS_FILE}" ] && EXISTING_JSON=$(cat "${VERSIONS_FILE}")
ACTIVE=$(cat "${TARGET_DIR}/${REPONAME}/active.txt" 2>/dev/null || echo "")

RELEASES_JSON="[]"
if [ -d "${TARGET_DIR}/${REPONAME}/releases" ]; then
  rel_lines=()
  while IFS= read -r d || [ -n "$d" ]; do
    [[ -z "$d" ]] && continue
    existing_at=$(echo "${EXISTING_JSON}" | \
      jq -r --arg t "${d}" '.releases[]? | select(.tag == $t) | .downloaded_at // empty')
    [ -z "${existing_at}" ] && existing_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    rel_lines+=("{\"tag\":\"${d}\",\"downloaded_at\":\"${existing_at}\"}")
  done < <(ls -1 "${TARGET_DIR}/${REPONAME}/releases" 2>/dev/null | sort -rV)

  if [ ${#rel_lines[@]} -gt 0 ]; then
    RELEASES_JSON=$(printf '%s\n' "${rel_lines[@]}" | jq -s '.')
  fi
fi

TMP_VF="${VERSIONS_FILE}.tmp.$$"
jq -n \
  --arg app  "${REPONAME}" \
  --arg active "${ACTIVE}" \
  --argjson releases "${RELEASES_JSON}" \
  '{"app":$app,"active":$active,"releases":$releases}' \
  > "${TMP_VF}"
mv -f "${TMP_VF}" "${VERSIONS_FILE}"

echo ""
echo "✓ ${REPONAME}@${TAG} is now available."
echo "  Active version is still: ${ACTIVE:-<none>}"
echo "  To switch to it from the hub page: use the version dropdown."
echo "  To switch via CLI:  docker exec artcraft-hub switch-version.sh ${REPONAME} ${TAG}"
