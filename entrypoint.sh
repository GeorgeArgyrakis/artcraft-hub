#!/usr/bin/env bash
set -Eeuo pipefail

CONF_FILE="/config/apps.conf"
CRONTAB_FILE="/etc/supercronic/crontab"
CRON_SCHEDULE="${SYNC_CRON:-0 0 * * *}"

echo "=== ArtCraft Hub starting ==="

# Ensure config directory and default apps.conf
mkdir -p /config /data /data/assets /data/icons /data/previews
if [ ! -f "${CONF_FILE}" ]; then
  if [ -f "/usr/local/share/artcraft/apps.conf" ]; then
    cp /usr/local/share/artcraft/apps.conf "${CONF_FILE}"
    echo "[INFO] Initialized ${CONF_FILE} from bundled template"
  else
    cat > "${CONF_FILE}" <<'EOF'
# ArtCraft apps.conf
# One GitHub org/repo per line. Example:
storytold/photocraft
storytold/vectorcraft
EOF
    echo "[INFO] Created default apps.conf at ${CONF_FILE}"
  fi
fi
# Ensure default catalog.json
if [ ! -f "/config/catalog.json" ] && [ -f "/usr/local/share/artcraft/catalog.json" ]; then
  cp /usr/local/share/artcraft/catalog.json "/config/catalog.json"
  echo "[INFO] Initialized /config/catalog.json from bundled template"
fi

# Deploy or refresh hub dashboard to /data/index.html
if [ -f "/config/custom_index.html" ]; then
  cp "/config/custom_index.html" /data/index.html
  echo "[INFO] Using custom dashboard from /config/custom_index.html"
elif [ -f "/usr/local/share/artcraft/index.html" ]; then
  cp /usr/local/share/artcraft/index.html /data/index.html
  echo "[INFO] Deployed ArtCraft Hub dashboard to /data/index.html"
fi

# Deploy bundled assets, stylesheets and scripts
mkdir -p /data/assets
if [ -d "/usr/local/share/artcraft/assets" ]; then
  cp -r /usr/local/share/artcraft/assets/* /data/assets/ 2>/dev/null || true
  # Backwards compatibility copies for /data/styles.css and /data/app.js
  cp /usr/local/share/artcraft/assets/styles.css /data/styles.css 2>/dev/null || true
  cp /usr/local/share/artcraft/assets/app.js /data/app.js 2>/dev/null || true
fi

# Deploy default favicon if not present
if [ ! -f "/data/favicon.ico" ] && [ -f "/usr/local/share/artcraft/favicon.ico" ]; then
  cp /usr/local/share/artcraft/favicon.ico /data/favicon.ico
  echo "[INFO] Deployed default favicon.ico to /data/favicon.ico"
fi

# Deploy logo assets if present (ensures /data/logo.* backwards compatibility)
if [ -f "/usr/local/share/artcraft/assets/logo.svg" ]; then
  cp /usr/local/share/artcraft/assets/logo.svg /data/logo.svg 2>/dev/null || true
  echo "[INFO] Deployed logo.svg to /data and /data/assets"
fi
if [ -f "/usr/local/share/artcraft/assets/logo.png" ]; then
  cp /usr/local/share/artcraft/assets/logo.png /data/logo.png 2>/dev/null || true
  echo "[INFO] Deployed logo.png to /data and /data/assets"
fi

# Deploy preview graphics if bundled
if [ -d "/usr/local/share/artcraft/previews" ]; then
  mkdir -p /data/previews
  cp -r /usr/local/share/artcraft/previews/* /data/previews/ 2>/dev/null || true
  echo "[INFO] Deployed bundled preview graphics to /data/previews"
fi

# Deploy bundled application icons if present
if [ -d "/usr/local/share/artcraft/icons" ]; then
  mkdir -p /data/icons
  cp -r /usr/local/share/artcraft/icons/* /data/icons/ 2>/dev/null || true
  echo "[INFO] Deployed bundled application icons to /data/icons"
fi

# Write supercronic crontab from env
mkdir -p /etc/supercronic
echo "${CRON_SCHEDULE} /usr/local/bin/sync.sh >> /proc/1/fd/1 2>&1" > "${CRONTAB_FILE}"
echo "[INFO] Cron schedule: ${CRON_SCHEDULE}"

# Start version-switch API in background
echo "[INFO] Starting switch API on :5000..."
python3 /usr/local/bin/switch_api.py &

# Fetch official vector master icons in background
if [ -f "/usr/local/bin/fetch-icons.sh" ]; then
  echo "[INFO] Synchronizing official vector icons in background..."
  /usr/local/bin/fetch-icons.sh &
fi

# Run initial sync in the background so Caddy starts immediately
echo "[INFO] Running initial sync in background..."
/usr/local/bin/sync.sh &

# Start supercronic in background
echo "[INFO] Starting supercronic..."
supercronic "${CRONTAB_FILE}" &

# Foreground: Caddy
echo "[INFO] Starting Caddy..."
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
