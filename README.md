# 🎨 ArtCraft WebAssembly Suite — Home Lab Hub

A self-hosted Docker container that automatically fetches the latest WebAssembly releases of ArtCraft apps from GitHub, serves them via **Caddy** with all headers required for WASM threads (`SharedArrayBuffer`), and presents them through a dark-themed dashboard.

---

## Overview

| Component | Role |
|-----------|------|
| **Caddy 2** | High-performance web server — serves static WASM apps from `/data` with correct COOP/COEP headers and MIME types |
| **Supercronic** | Lightweight cron daemon for containers — triggers `sync.sh` on a configurable schedule |
| **sync.sh** | Bash script that polls GitHub Releases API, downloads `*web*.zip` assets, and rebuilds the dashboard |

The setup uses **two named Docker volumes** so your downloaded apps and configuration survive image rebuilds:

- `artcraft-data` → `/data` — WASM app files + generated `index.html`
- `artcraft-config` → `/config` — `apps.conf` (your app list)

---

## Quick Start

```bash
# 1. Clone or download this repository
git clone <your-repo-url> artcraft-hub
cd artcraft-hub

# 2. Edit the app list (one GitHub org/repo per line)
#    The config/ directory is volume-mounted; no rebuild needed after editing.
nano config/apps.conf

# 3. (Optional) Set your GitHub token for higher API rate limits
cp .env.example .env
nano .env   # fill in GITHUB_TOKEN, adjust TZ if needed

# 4. Build and start
docker compose --env-file .env up -d --build

# 5. Open your browser
open http://localhost:8080
```

The first sync runs immediately in the background; Caddy starts serving right away. The dashboard at `/` will populate once the first sync completes.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | *(empty)* | Personal access token for GitHub API. Without it you're limited to 60 unauthenticated requests/hour. With it: 5,000/hour. Create one at **Settings → Developer settings → Personal access tokens** (no scopes needed for public repos). |
| `SYNC_CRON` | `0 0 * * *` | Cron expression for release checks. Uses standard 5-field cron syntax. Examples: `*/30 * * * *` (every 30 min), `0 */6 * * *` (every 6 hours). |
| `TZ` | `UTC` | Timezone for the cron schedule (e.g. `Europe/Athens`, `America/New_York`). |
| `CONF_FILE` | `/config/apps.conf` | Path to the app list inside the container. Override only if you have a custom volume layout. |
| `TARGET_DIR` | `/data` | Root directory where apps are downloaded and served from. |

### Adding or Removing Apps

Edit `config/apps.conf` on the **host** (it's volume-mounted, no rebuild required):

```
# config/apps.conf
storytold/photocraft
storytold/vectorcraft
storytold/pdfcraft
```

- One `org/repo` per line.
- Lines starting with `#` are comments and are ignored.
- Blank lines are ignored.

Changes take effect at the **next scheduled sync** (default: midnight). To apply immediately:

```bash
docker exec artcraft-hub sync.sh
```

To remove an app, delete or comment out its line **and** manually remove its directory from the volume if you want to reclaim space:

```bash
docker exec artcraft-hub rm -rf /data/photocraft
```

---

## Volumes

| Volume | Mount | Contents |
|--------|-------|----------|
| `artcraft-data` | `/data` | Downloaded WASM apps (one subdirectory per repo) + `index.html` dashboard |
| `artcraft-config` | `/config` | `apps.conf` — your app list |

Both volumes are created automatically by `docker compose up`. They persist across container restarts and image upgrades.

---

## Manual Sync

Force an immediate sync (runs `sync.sh` inside the running container):

```bash
docker exec artcraft-hub sync.sh
```

---

## Viewing Logs

Stream all container logs (Caddy access + sync output):

```bash
docker compose logs -f
```

Filter to sync output only:

```bash
docker compose logs -f | grep -v '"GET'
```

---

## Why COOP / COEP Headers?

WebAssembly apps that use **threads** (via `SharedArrayBuffer`) require a [cross-origin isolated](https://developer.chrome.com/blog/enabling-shared-array-buffer/) browsing context. Browsers enforce this via two HTTP response headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the browsing context from other origins |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Requires all sub-resources to opt in to being embedded |

Without these headers, `SharedArrayBuffer` is unavailable and multi-threaded WASM modules will fail at startup. Caddy applies them to **every response** served from `/data`.

The `.wasm` MIME type (`application/wasm`) is also set explicitly — some default server configurations serve `.wasm` files as `application/octet-stream`, which causes browsers to refuse execution.

---

## Upgrading the Image

```bash
# Pull latest base images and rebuild
docker compose pull
docker compose up -d --build

# Your data volumes are untouched — apps remain installed
```

To update Supercronic, change `SUPERCRONIC_VERSION` and `SUPERCRONIC_SHA1SUM` in the `Dockerfile` and rebuild.

---

## Project Structure

```
artcraft-hub/
├── Dockerfile          # Multi-stage build (caddy:2-alpine + python3 + supercronic)
├── docker-compose.yml  # Service definition with named volumes & Traefik labels
├── Caddyfile           # Caddy config: WASM headers, MIME types, transparent app rewrites
├── index.html          # Polished dark-mode glassmorphism dashboard UI
├── switch_api.py       # Python sidecar API for atomic release switching & sync control
├── sync.sh             # GitHub release sync & automated release pruning
├── fetch-icons.sh      # CLI helper to fetch official vector master icons from GitHub
├── fetch-release.sh    # CLI helper to download specific historical release tags
├── entrypoint.sh       # Container startup: init config, deploy UI, start API + cron + Caddy
├── config/
│   └── apps.conf       # App list (volume-mounted at /config/apps.conf)
├── .env.example        # Environment variable template
└── .dockerignore
```

---

## Official App Icons & Customization

- **Automatic Official Icons**: On startup and during release synchronization, the container automatically downloads the official Canonical Vector Master SVG icons from each application's repository (`assets/app-icon/<app>.svg`) into `/data/icons/<app>.svg`.
- **Manual Icon Fetch**: To immediately download or update all official icons in a few seconds:
  ```bash
  docker exec -it artcraft-hub fetch-icons.sh
  ```
- **Custom Suite Logo**: Place your custom SVG or PNG logo at `/data/assets/logo.svg` (or `logo.png`).
- **Custom Icons Override**: Place any custom icon at `/data/icons/{app}.svg` to override the official vector icon.

---

## Pinning & Favorites

- Click the pushpin icon (`📌`) on any app card to pin it.
- **Pinned apps always float to the top of the dashboard** across all category views.
- A dedicated **"📌 Pinned"** tab in the toolbar lets you view only your favorite applications.
- Pin preferences are saved locally in browser storage and synchronized server-wide via `/api/pinned`.

---

## Release Switching & History

- The Hub dashboard lets you switch any app between downloaded releases on-the-fly without restarting the container.
- Each switch updates the atomic symlink `/data/{app}/current` pointing to the selected release.
- To download an older release tag:
  ```bash
  docker exec -it artcraft-hub fetch-release.sh storytold/photocraft v0.17.0
  ```
- To configure how many versions are kept on disk, adjust `MAX_RELEASES` in `docker-compose.yml` (default: 3). Old inactive releases are pruned automatically.

---

## License

MIT
