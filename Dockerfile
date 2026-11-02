# syntax=docker/dockerfile:1.6
FROM curlimages/curl:8.7.1 AS downloader

ARG TARGETARCH
ARG SUPERCRONIC_VERSION=0.2.33

RUN set -ex; \
    case "${TARGETARCH:-amd64}" in \
        amd64|x86_64) \
            SUPERCRONIC_BIN="supercronic-linux-amd64"; \
            SUPERCRONIC_SHA1="71b0d58cc53f6bd72cf2f293e09e294b79c666d8" ;; \
        arm64|aarch64) \
            SUPERCRONIC_BIN="supercronic-linux-arm64"; \
            SUPERCRONIC_SHA1="e0f0c06ebc5627e43b25475711e694450489ab00" ;; \
        *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/supercronic "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/${SUPERCRONIC_BIN}" \
    && echo "${SUPERCRONIC_SHA1}  /tmp/supercronic" | sha1sum -c - \
    && chmod +x /tmp/supercronic

# ---- Final image ----
FROM caddy:2-alpine

# Install runtime dependencies
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
COPY             index.html          /usr/local/share/artcraft/index.html
COPY             favicon.ico         /usr/local/share/artcraft/favicon.ico
COPY             config/apps.conf    /usr/local/share/artcraft/apps.conf
COPY             config/catalog.json /usr/local/share/artcraft/catalog.json
COPY             icons               /usr/local/share/artcraft/icons
COPY             previews            /usr/local/share/artcraft/previews
COPY             assets              /usr/local/share/artcraft/assets
COPY --chmod=755 sync.sh             /usr/local/bin/sync.sh
COPY --chmod=755 entrypoint.sh       /usr/local/bin/entrypoint.sh
COPY --chmod=755 switch_api.py       /usr/local/bin/switch_api.py
COPY --chmod=755 switch-version.sh   /usr/local/bin/switch-version.sh
COPY --chmod=755 fetch-release.sh    /usr/local/bin/fetch-release.sh
COPY --chmod=755 fetch-icons.sh      /usr/local/bin/fetch-icons.sh
COPY             Caddyfile           /etc/caddy/Caddyfile

# Persistent volumes
VOLUME ["/data", "/config"]

# Environment defaults (sensitive tokens like GITHUB_TOKEN passed at runtime via compose / secrets)
ENV SYNC_CRON="0 0 * * *" \
    CONF_FILE="/config/apps.conf" \
    TARGET_DIR="/data" \
    MAX_RELEASES="3" \
    TZ=UTC

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
