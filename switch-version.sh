#!/usr/bin/env bash
# switch-version.sh — Atomically switch the active version of an ArtCraft application
# Usage: switch-version.sh <app-name> <tag>
# Example: switch-version.sh photocraft v0.17.0

set -Eeuo pipefail

APP="${1:?Usage: switch-version.sh <app-name> <tag>}"
TAG="${2:?Usage: switch-version.sh <app-name> <tag>}"

# Normalize app name if passed as org/repo
APP="$(basename "${APP}")"

# Try via the switch API first
if curl -sf -X POST "http://127.0.0.1:5000/api/${APP}/switch/${TAG}" -H "Content-Type: application/json" >/dev/null 2>&1; then
  echo "[OK] Switched ${APP} to ${TAG} via switch API"
  exit 0
fi

# Fallback: invoke python logic directly if API is not responding or during offline maintenance
python3 -c "
import sys
from switch_api import switch_version
res, code = switch_version(sys.argv[1], sys.argv[2])
if code == 200:
    print(f\"[OK] Switched {sys.argv[1]} to {sys.argv[2]}\")
    sys.exit(0)
else:
    print(f\"[ERROR] Failed to switch: {res.get('error', 'unknown error')}\", file=sys.stderr)
    sys.exit(1)
" "${APP}" "${TAG}"
