# 🎨 ArtCraft WebAssembly Suite — Home Lab Hub

A self-hosted Docker container that automatically fetches the latest WebAssembly releases of ArtCraft apps from GitHub, serves them via **Caddy** with all headers required for WASM threads (`SharedArrayBuffer`), and presents them through a dark-themed dashboard.

> [!NOTE]
> **⚡ Vibe-Coded Project**: This repository was vibe-coded with AI. Built through rapid conversational prompting, iteration, and pure vibes. It runs like a charm in a self-hosted home lab setup, but please review scripts and configurations before deploying to critical production systems. Feedback, PRs, and good vibes are welcome!

---

## 📸 Screenshots

### Glass Theme (Modern Card View)
![ArtCraft Hub - Glass Theme](screenshots/dashboard-glass-theme.jpg)

### ArtCraft Theme (Lineup & Showcase View)
![ArtCraft Hub - ArtCraft Theme](screenshots/dashboard-artcraft-theme.jpg)

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

## Quick Start (Pre-built Image)

You can run ArtCraft Hub immediately using the pre-built Docker image from the GitHub Container Registry without needing to clone or build the source code.

### 1. Create a `docker-compose.yml`

Create a `docker-compose.yml` file in your preferred directory:

```yaml
services:
  artcraft-hub:
    image: ghcr.io/georgeargyrakis/artcraft-hub:latest
    container_name: artcraft-hub
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - artcraft-data:/data
      - artcraft-config:/config
    environment:
      # Optional: GitHub token for higher API rate limits (5,000/hr vs 60/hr)
      - GITHUB_TOKEN=
      # Cron schedule for release checks (default: daily at midnight)
      - SYNC_CRON=0 0 * * *
      # Timezone for the cron schedule
      - TZ=UTC
      # Maximum number of release versions to retain per app
      - MAX_RELEASES=3

volumes:
  artcraft-data:
  artcraft-config:
```

### 2. Start the Hub

```bash
docker compose up -d
```

### 3. Open in Browser

Open **http://localhost:8080** (or your server's IP / reverse proxy domain).

The first synchronization runs automatically in the background to fetch and unpack the WebAssembly applications; Caddy starts serving immediately, and apps will appear on the dashboard as they finish downloading.

---

## Building From Source

If you want to modify dashboard templates, themes, or scripts locally, you can clone the repository and build the container yourself:

```bash
# 1. Clone this repository
git clone https://github.com/GeorgeArgyrakis/artcraft-hub.git
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
├── docker-compose.yml  # Service definition with named volumes & ports
├── Caddyfile           # Caddy config: WASM headers, MIME types, transparent app rewrites
├── index.html          # Semantic, accessible HTML dashboard shell (~200 lines)
├── styles.css          # Decoupled stylesheet covering ArtCraft Theme and Glass Theme
├── app.js              # Decoupled client logic, DOM batching, and dynamic metadata
├── switch_api.py       # Python sidecar API for atomic release switching & sync control
├── sync.sh             # GitHub release sync & automated release pruning
├── fetch-icons.sh      # CLI helper to fetch official vector master icons from GitHub
├── fetch-release.sh    # CLI helper to download specific historical release tags
├── entrypoint.sh       # Container startup: init config, deploy UI, start API + cron + Caddy
├── config/
│   ├── apps.conf       # App list (volume-mounted at /config/apps.conf)
│   └── catalog.json    # App metadata catalog (volume-mounted at /config/catalog.json)
├── previews/           # Bundled UI interface preview graphics (.webp)
├── icons/              # Bundled app mascot icons (.webp)
├── screenshots/        # Dashboard theme screenshots
├── .env.example        # Environment variable template
└── .dockerignore
```

---

## 🧩 Dynamic App Architecture & Extensibility

The hub is designed without hardcoded app counts or fixed 13-app constraints:

### Adding New Applications

You have two flexible ways to add or customize applications:

1. **Simple List (`config/apps.conf`)**:
   Add any GitHub repository to `config/apps.conf` (e.g. `storytold/audiocraft` or `myorg/customcraft`):
   ```bash
   echo "myorg/customcraft" >> config/apps.conf
   docker exec artcraft-hub sync.sh
   ```
2. **Metadata Catalog (`config/catalog.json`)**:
   For granular control over presentation metadata (custom title, category, accent color, tagline, and description), define entries in `config/catalog.json`:
   ```json
   {
     "customcraft": {
       "repo": "myorg/customcraft",
       "num": "16",
       "title": "CustomCraft",
       "category": "cad",
       "categoryTag": "PROCEDURAL MODELING",
       "accentColor": "#06b6d4",
       "tagline": "Procedural 3D Modeling Studio",
       "desc": "Next-generation procedural mesh authoring in WebAssembly."
     }
   }
   ```
The sync script automatically polls the latest release, downloads the WebAssembly archive (`*web*.zip`), symlinks `/data/{app}/current`, and regenerates `/data/manifest.json`. Repositories defined across `apps.conf` and `catalog.json` are seamlessly deduplicated and synchronized.

### Automatic Metadata & Category Inference
For apps not pre-registered in the built-in catalog, the hub dynamically generates complete presentation metadata:
- **Title Formatting**: Automatically formats slugs into title case (e.g. `audio-craft` → `AudioCraft`).
- **Sequential Lineup Number (`num`)**: Dynamic numbering automatically continues after built-in apps (`14`, `15`, `16`...) so that badge numbers `[14]` and grid ordering stay in sequence.
- **Intelligent Categorization**: Detects categories based on keywords in the app slug:
  - `audio`, `sound`, `music`, `synth` → **Audio** tab (`AUDIO WORKBENCH`)
  - `cad`, `3d`, `mesh`, `model` → **3D & CAD** tab (`3D WORKBENCH`)
  - `doc`, `pdf`, `text`, `sheet`, `page` → **Documents** tab (`DOCUMENT STUDIO`)
  - `vector`, `svg`, `draw`, `fig`, `ui` → **Vector & Design** tab (`VECTOR & DESIGN`)
  - All others default to **Graphics & Photo**
- **Accent Color & Gradient**: Deterministically selected from a vibrant color palette based on a hash of the app name, ensuring every newly added app has a consistent, distinctive accent color.

### Icon Fallback System (3-Tier)
1. **Local WebP Icon**: Checks `/icons/{app}.webp`.
2. **Downloaded Vector Master SVG**: `fetch-icons.sh` automatically attempts to download `assets/app-icon/{app}.svg` from the repository root into `/data/icons/{app}.svg`.
3. **Monogram / Mascot Fallback**: If no image file is found, displays a clean 2-letter uppercase monogram (e.g. `Au` for `AudioCraft`) or suite mascot inside a rounded gradient container matching the app's accent color. Broken image icons are never shown.

### Preview Graphic Fallback System (3-Tier)
1. **Local WebP Screenshot**: Checks `/previews/{app}.webp`. You can place your own high-resolution screenshots into `/data/previews/{app}.webp` at any time.
2. **Official CDN Graphic**: Attempts to fetch the preview from the official CDN.
3. **Vector Blueprint Fallback**: Renders an inline vector CAD workspace blueprint featuring window controls, geometric wireframes, and `<APP> WORKSPACE` labeled in the app's accent color.

---

## 🎨 Dual Theme Engine

The hub features two fully decoupled themes switchable on-the-fly via the top navigation toggle:

### 1. ArtCraft Studio Theme (`[data-theme="artcraft"]`)
Inspired directly by [getartcraft.com/apps](https://getartcraft.com/apps):
- **Continuous Architectural Grid**: 4-column matrix grid separated by fine 1px borders.
- **Top Bar**: Numbered accent badge (`01`, `02`, `14`...) on the left, with uppercase category tag on the right.
- **Overlapping Mascot Icon**: 52×52px rounded-square app icon overlapping the bottom seam of the preview image.
- **Vertical Hierarchy**: Prominent bold white title directly beneath the mascot icon, subtle favorites pin on the right, description, and release pill row.
- **Single-Version vs. Multi-Version Pills**:
  - Single version installed: Subtle pill showing the active release tag with no chevron arrow that does not expand on click.
  - Multiple versions installed: Expands into a dropdown menu to choose and switch installed versions.
  - `UPDATED <DATE>` is displayed immediately to the right of the version pill.
- **Explore Button**: Full-width bottom bar with `EXPLORE <APP> ↗` and interactive hover animation.
- **Technical Section Headers**:
  - Pinned Section: Uses `01 / PINNED APPS` with a dynamic count of pinned favorites.
  - Main Section: Uses `02 / THE LINEUP` (or `01 / THE LINEUP` if no apps are pinned).
- **Controls Toolbar**: Category filter pills and instant search placed directly below the header.

### 2. Glass Theme (Classic Glassmorphism)
- Frosted glass cards with ambient background lighting and glow effects.
- **Proportional Badge Actions**: Category pill and favorites pin button share uniform **22px height**, fully rounded pill curvature (`var(--radius-full)`), and subtle translucent borders.

---

## 🚀 Live Container Deployment

To update a running container with new dashboard code or preview assets without restarting:

```bash
docker cp index.html artcraft-hub:/data/index.html
docker cp styles.css artcraft-hub:/data/styles.css
docker cp app.js artcraft-hub:/data/app.js
docker cp previews artcraft-hub:/data/previews
docker cp Caddyfile artcraft-hub:/etc/caddy/Caddyfile
docker exec artcraft-hub caddy reload --config /etc/caddy/Caddyfile
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

## ⚡ Vibe-Coded Disclaimer

> **Built with vibes & AI.**
>
> This project was developed through **vibe coding** with AI assistants—conceived, scaffolded, refined, and styled through conversational iteration and iterative experimentation.
>
> - **Tested & Functional**: Runs reliably in real-world self-hosted home lab environments (Docker, Traefik, Caddy reverse proxy, WASM multi-threading).
> - **Pragmatic & Experimental**: Architectural patterns prioritize speed, elegance, and immediate practicality over corporate boilerplate.
> - **Provided As-Is**: Provided without warranty of any kind. Always inspect the shell scripts, Dockerfiles, and environment files before running in production.
> - **Contributions**: Issues, pull requests, suggestions, and good vibes are always welcome!

---

## License

MIT
