# syntax=docker/dockerfile:1.6
FROM curlimages/curl:8.7.1 AS downloader

ARG SUPERCRONIC_VERSION=0.2.33
ARG SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-amd64
ARG SUPERCRONIC_SHA1SUM=71b0d58cc53f6bd72cf2f293e09e294b79c666d8

RUN curl -fsSL -o /tmp/supercronic "${SUPERCRONIC_URL}" \
    && echo "${SUPERCRONIC_SHA1SUM}  /tmp/supercronic" | sha1sum -c - \
    && chmod +x /tmp/supercronic

# ---- Final image ----
FROM caddy:2-alpine

# Install runtime deps
RUN apk add --no-cache \
      bash \
      curl \
      jq \
      unzip \
      python3 \
      tzdata

# Supercronic
COPY --from=downloader --chmod=755 /tmp/supercronic /usr/local/bin/supercronic

# Dashboard template, assets, and scripts
COPY             index.html       /usr/local/share/artcraft/index.html
COPY             styles.css       /usr/local/share/artcraft/styles.css
COPY             app.js           /usr/local/share/artcraft/app.js
COPY             logo.svg         /usr/local/share/artcraft/logo.svg
COPY             logo.png         /usr/local/share/artcraft/logo.png
COPY             favicon.ico      /usr/local/share/artcraft/favicon.ico
COPY             config/apps.conf /usr/local/share/artcraft/apps.conf
COPY             icons            /usr/local/share/artcraft/icons
COPY             previews         /usr/local/share/artcraft/previews
COPY             assets           /usr/local/share/artcraft/assets
COPY --chmod=755 sync.sh          /usr/local/bin/sync.sh
COPY --chmod=755 entrypoint.sh    /usr/local/bin/entrypoint.sh
COPY --chmod=755 switch_api.py    /usr/local/bin/switch_api.py
COPY --chmod=755 fetch-release.sh /usr/local/bin/fetch-release.sh
COPY --chmod=755 fetch-icons.sh   /usr/local/bin/fetch-icons.sh
COPY             Caddyfile        /etc/caddy/Caddyfile

# Volumes
VOLUME ["/data", "/config"]

# Env defaults
ENV SYNC_CRON="0 0 * * *" \
    GITHUB_TOKEN="" \
    CONF_FILE="/config/apps.conf" \
    TARGET_DIR="/data" \
    MAX_RELEASES="3" \
    TZ=UTC

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
