#!/usr/bin/env python3
"""
switch_api.py – Version-switch, Catalog Management, and System Control HTTP API for ArtCraft Hub.

Endpoints:
  GET    /api/manifest                   → combined manifest of all apps + system status + catalog
  GET    /api/status                     → system sync status, stats, and auth requirement
  GET    /api/catalog                    → applications catalog metadata
  POST   /api/verify-auth                → verify admin password (returns 200 or 401)
  POST   /api/catalog                    → add new application to catalog.json (optional sync_now)
  PUT    /api/catalog/{app}              → update existing application in catalog.json
  PATCH  /api/catalog/{app}/visibility   → toggle visibility (visible: true/false)
  DELETE /api/catalog/{app}              → delete app from catalog and purge /data/{app}
  POST   /api/sync                       → trigger background sync of releases
  GET    /api/{app}/versions             → versions.json for a single app
  POST   /api/{app}/switch/{tag}         → atomically switch active release
  OPTIONS /api/*                         → CORS preflight
"""

import hmac
import json
import os
import re
import shutil
import sys
import tempfile
import time
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

TARGET_DIR: str = os.environ.get("TARGET_DIR", "/data")
SYNC_LOCK_FILE: Path = Path(os.environ.get("SYNC_LOCK_PATH", "/tmp/sync.lock"))
STATUS_FILE: Path = Path(TARGET_DIR) / ".sync_status.json"
CATALOG_FILE: Path = Path(os.environ.get("CATALOG_FILE", "/config/catalog.json"))
BUNDLED_CATALOG_FILE: Path = Path("/usr/local/share/artcraft/catalog.json")
LOCAL_CATALOG_FILE: Path = Path(__file__).resolve().parent / "config" / "catalog.json"
SYNC_SCRIPT_PATH: Path = Path(os.environ.get("SYNC_SCRIPT_PATH", "/usr/local/bin/sync.sh"))

APP_NAME_RE: re.Pattern = re.compile(r"^[A-Za-z0-9_\-]+$")
TAG_NAME_RE: re.Pattern = re.compile(r"^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._\-]*$")
REPO_RE: re.Pattern = re.compile(r"^[\w.-]+/[\w.-]+$")
HEX_COLOR_RE: re.Pattern = re.compile(r"^#[0-9a-fA-F]{6}$")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utcnow() -> str:
    """Return ISO 8601 UTC timestamp string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(method: str, path: str, status: int) -> None:
    """Standardized request logger."""
    print(f"[{utcnow()}] {method} {path} → {status}", flush=True)


def read_json(filepath: Path) -> Optional[Any]:
    """Return parsed JSON from *filepath*, or None on any error."""
    try:
        with open(filepath, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def write_json(filepath: Path, data: Any) -> None:
    """Atomically write *data* as JSON to *filepath*."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=filepath.parent, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def write_json_atomic_text(filepath: Path, text: str) -> None:
    """Atomically write plain text to *filepath*."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=filepath.parent, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def sorted_releases_newest_first(releases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort release dicts newest-first using semver-aware tuple comparison."""
    def _key(r: Dict[str, Any]) -> List[Tuple[int, Union[int, str]]]:
        tag = r.get("tag", "")
        cleaned = re.sub(r"^v", "", tag, flags=re.IGNORECASE)
        parts = re.split(r"[.\-]", cleaned)
        numeric: List[Tuple[int, Union[int, str]]] = []
        for p in parts:
            try:
                numeric.append((0, int(p)))
            except ValueError:
                numeric.append((1, p))
        return numeric

    return sorted(releases, key=_key, reverse=True)


def get_status() -> Dict[str, Any]:
    """Return status dictionary describing sync and system stats."""
    status_data: Dict[str, Any] = read_json(STATUS_FILE) or {}
    is_syncing = False

    if SYNC_LOCK_FILE.exists():
        try:
            pid = int(SYNC_LOCK_FILE.read_text().strip())
            # Check if process is still active (POSIX os.kill(pid, 0))
            if hasattr(os, "kill"):
                os.kill(pid, 0)
                is_syncing = True
        except (ValueError, OSError):
            SYNC_LOCK_FILE.unlink(missing_ok=True)

    if not is_syncing and status_data.get("status") == "syncing":
        status_data["status"] = "idle"

    # Count apps on disk
    apps_list: List[str] = []
    base = Path(TARGET_DIR)
    if base.is_dir():
        for d in base.iterdir():
            if d.is_dir() and APP_NAME_RE.fullmatch(d.name) and (d / "versions.json").is_file():
                apps_list.append(d.name)

    return {
        "status": "syncing" if is_syncing else status_data.get("status", "idle"),
        "is_syncing": is_syncing,
        "last_sync": status_data.get("last_sync"),
        "last_success": status_data.get("last_success", True),
        "apps_count": len(apps_list),
        "schedule": os.environ.get("SYNC_CRON", "0 0 * * *"),
        "timezone": os.environ.get("TZ", "UTC"),
        "auth_required": is_auth_required(),
    }


def get_admin_password() -> str:
    """Return configured admin password, or empty string if disabled."""
    return os.environ.get("ADMIN_PASSWORD", "").strip()


def is_auth_required() -> bool:
    """Return True if admin password protection is enabled."""
    return bool(get_admin_password())


def verify_admin_request(headers: Any) -> bool:
    """Verify request headers against ADMIN_PASSWORD using constant-time comparison."""
    expected = get_admin_password()
    if not expected:
        return True

    provided = ""
    if hasattr(headers, "get"):
        provided = headers.get("X-Admin-Password", "") or ""
        if not provided:
            auth_hdr = headers.get("Authorization", "") or ""
            if auth_hdr.startswith("Bearer "):
                provided = auth_hdr[7:].strip()

    if provided and hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        return True

    time.sleep(1)  # Throttle brute-force attempts
    return False


def trigger_sync() -> Tuple[Dict[str, Any], int]:
    """Trigger background sync.sh execution."""
    if SYNC_LOCK_FILE.exists():
        try:
            pid = int(SYNC_LOCK_FILE.read_text().strip())
            if hasattr(os, "kill"):
                os.kill(pid, 0)
                return {"ok": False, "error": "Sync is already in progress"}, 409
        except (ValueError, OSError):
            SYNC_LOCK_FILE.unlink(missing_ok=True)

    if not SYNC_SCRIPT_PATH.is_file():
        return {"ok": False, "error": f"sync script not found at {SYNC_SCRIPT_PATH}"}, 500

    try:
        proc = subprocess.Popen(
            [str(SYNC_SCRIPT_PATH)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        SYNC_LOCK_FILE.write_text(str(proc.pid))
        return {"ok": True, "message": "Sync started in background", "pid": proc.pid}, 200
    except Exception as exc:
        return {"ok": False, "error": f"Failed to execute sync script: {exc}"}, 500


def get_catalog() -> Dict[str, Any]:
    """Return catalog dictionary from user config, bundled share, or local repository."""
    for path in (CATALOG_FILE, BUNDLED_CATALOG_FILE, LOCAL_CATALOG_FILE):
        if path.is_file():
            data = read_json(path)
            if isinstance(data, dict):
                return data
    return {}


def get_catalog_write_path() -> Path:
    """Determine the file path to write catalog.json updates."""
    if CATALOG_FILE.is_file() or CATALOG_FILE.parent.is_dir():
        return CATALOG_FILE
    if LOCAL_CATALOG_FILE.is_file() or LOCAL_CATALOG_FILE.parent.is_dir():
        return LOCAL_CATALOG_FILE
    CATALOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    return CATALOG_FILE


def save_catalog(catalog: Dict[str, Any]) -> bool:
    """Save catalog dictionary to disk atomically."""
    target_path = get_catalog_write_path()
    try:
        write_json(target_path, catalog)
        return True
    except Exception as exc:
        print(f"[{utcnow()}] Error saving catalog to {target_path}: {exc}", file=sys.stderr, flush=True)
        return False


def add_or_update_catalog_app(app_key: str, meta: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """Add or update an application record in catalog.json."""
    if not APP_NAME_RE.fullmatch(app_key):
        return {"ok": False, "error": f"Invalid app name '{app_key}'"}, 400

    repo = (meta.get("repo") or "").strip()
    if not repo or not REPO_RE.fullmatch(repo):
        return {"ok": False, "error": f"Invalid or missing GitHub repo '{repo}' (expected 'owner/repo')"}, 400

    title = (meta.get("title") or app_key).strip()
    category = (meta.get("category") or "Graphics & Photo").strip()
    category_tag = (meta.get("categoryTag") or category.upper()).strip()
    accent_color = (meta.get("accentColor") or "#2563eb").strip()
    if not HEX_COLOR_RE.fullmatch(accent_color):
        accent_color = "#2563eb"
    tagline = (meta.get("tagline") or f"{title} Creative App").strip()
    desc = (meta.get("desc") or f"Open-source {title} creative application.").strip()
    visible = bool(meta.get("visible", True))

    catalog = get_catalog()
    existing = catalog.get(app_key, {})
    num = str(meta.get("num") or existing.get("num") or f"{len(catalog) + 1:02d}")

    entry = {
        "repo": repo,
        "num": num,
        "title": title,
        "category": category,
        "categoryTag": category_tag,
        "accentColor": accent_color,
        "tagline": tagline,
        "desc": desc,
        "visible": visible,
    }

    catalog[app_key] = entry
    if not save_catalog(catalog):
        return {"ok": False, "error": "Failed to save catalog.json"}, 500

    return {"ok": True, "app": app_key, "entry": entry}, 200


def set_app_visibility(app_key: str, visible: bool) -> Tuple[Dict[str, Any], int]:
    """Update visibility flag for an application in catalog.json."""
    if not APP_NAME_RE.fullmatch(app_key):
        return {"ok": False, "error": f"Invalid app name '{app_key}'"}, 400

    catalog = get_catalog()
    if app_key not in catalog:
        return {"ok": False, "error": f"App '{app_key}' not found in catalog"}, 404

    catalog[app_key]["visible"] = bool(visible)
    if not save_catalog(catalog):
        return {"ok": False, "error": "Failed to save catalog.json"}, 500

    return {"ok": True, "app": app_key, "visible": catalog[app_key]["visible"]}, 200


def delete_catalog_app(app_key: str) -> Tuple[Dict[str, Any], int]:
    """Delete an app from catalog.json and purge its files from disk."""
    if not APP_NAME_RE.fullmatch(app_key):
        return {"ok": False, "error": f"Invalid app name '{app_key}'"}, 400

    catalog = get_catalog()
    if app_key in catalog:
        del catalog[app_key]
        if not save_catalog(catalog):
            return {"ok": False, "error": "Failed to save catalog.json"}, 500

    # Purge application directory in TARGET_DIR (/data/{app})
    app_dir = Path(TARGET_DIR) / app_key
    if app_dir.is_dir():
        shutil.rmtree(app_dir, ignore_errors=True)

    # Purge downloaded vector master icon if present (/data/icons/{app}.svg)
    icon_svg = Path(TARGET_DIR) / "icons" / f"{app_key}.svg"
    if icon_svg.is_file():
        try:
            icon_svg.unlink()
        except OSError:
            pass

    return {"ok": True, "app": app_key, "deleted": True}, 200


def get_manifest() -> Dict[str, Any]:
    """Scan TARGET_DIR and return combined manifest dict, including registered catalog apps."""
    base = Path(TARGET_DIR)
    apps: List[Dict[str, Any]] = []
    found_apps = set()

    if base.is_dir():
        for app_dir in sorted(base.iterdir()):
            if not app_dir.is_dir() or not APP_NAME_RE.fullmatch(app_dir.name):
                continue
            versions_file = app_dir / "versions.json"
            data = read_json(versions_file)
            if data is None or not isinstance(data, dict):
                continue
            releases = data.get("releases", [])
            if not isinstance(releases, list):
                releases = []
            app_name = data.get("app", app_dir.name)
            found_apps.add(app_name)
            apps.append({
                "app": app_name,
                "active": data.get("active", ""),
                "releases": sorted_releases_newest_first(releases),
            })

    catalog = get_catalog()
    for cat_app in catalog:
        if cat_app not in found_apps:
            apps.append({
                "app": cat_app,
                "active": "",
                "releases": [],
            })

    return {
        "apps": apps,
        "system": get_status(),
        "catalog": catalog,
        "auth_required": is_auth_required(),
    }


def get_versions(app: str) -> Optional[Dict[str, Any]]:
    """Return versions.json dict for *app*, or None if not found or invalid."""
    if not APP_NAME_RE.fullmatch(app):
        return None
    versions_file = Path(TARGET_DIR) / app / "versions.json"
    data = read_json(versions_file)
    return data if isinstance(data, dict) else None


def switch_version(app: str, tag: str) -> Tuple[Dict[str, Any], int]:
    """
    Atomically switch the active release for *app* to *tag*.
    Enforces strict path sanitization to prevent path traversal vulnerabilities.
    Returns (response_dict, http_status).
    """
    # Strict validation of app and tag format
    if not APP_NAME_RE.fullmatch(app):
        return {"ok": False, "error": "invalid app identifier format"}, 400

    if not TAG_NAME_RE.fullmatch(tag):
        return {"ok": False, "error": "invalid tag format"}, 400

    app_dir = Path(TARGET_DIR) / app
    tag_dir = app_dir / "releases" / tag

    if not tag_dir.is_dir():
        return {"ok": False, "error": f"release {tag!r} not found"}, 404

    # Atomic symlink update
    current_link = app_dir / "current"
    tmp_link = app_dir / f"current.tmp.{os.getpid()}"

    try:
        if tmp_link.exists() or tmp_link.is_symlink():
            tmp_link.unlink()

        os.symlink(f"releases/{tag}", tmp_link)
        os.replace(tmp_link, current_link)
    except OSError as exc:
        return {"ok": False, "error": f"symlink update failed: {exc}"}, 500

    # Update active.txt
    active_file = app_dir / "active.txt"
    try:
        write_json_atomic_text(active_file, tag)
    except OSError as exc:
        return {"ok": False, "error": f"active.txt write failed: {exc}"}, 500

    # Update versions.json
    versions_file = app_dir / "versions.json"
    data = read_json(versions_file) or {}
    if not isinstance(data, dict):
        data = {}
    data["app"] = data.get("app", app)
    data["active"] = tag
    try:
        write_json(versions_file, data)
    except OSError as exc:
        return {"ok": False, "error": f"versions.json update failed: {exc}"}, 500

    return {"ok": True, "app": app, "active": tag}, 200


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------

CORS_HEADERS: Dict[str, str] = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Password",
    "Access-Control-Expose-Headers": "X-Auth-Required",
}


class SwitchAPIHandler(BaseHTTPRequestHandler):
    server_version = "ArtCraftSwitchAPI/2.0"
    sys_version = ""

    def log_message(self, fmt: str, *args: Any) -> None:
        """Suppress default stderr request logging in favor of structured log()."""
        pass

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def do_OPTIONS(self) -> None:
        self._send(200, None)
        log("OPTIONS", self.path, 200)

    def do_GET(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        # GET /api/manifest
        if path == "/api/manifest":
            body = get_manifest()
            self._send(200, body)
            log("GET", self.path, 200)
            return

        # GET /api/status
        if path == "/api/status":
            body = get_status()
            self._send(200, body)
            log("GET", self.path, 200)
            return

        # GET /api/catalog
        if path == "/api/catalog":
            body = get_catalog()
            self._send(200, body)
            log("GET", self.path, 200)
            return

        # GET /api/{app}/versions
        m = re.fullmatch(r"/api/([A-Za-z0-9_\-]+)/versions", path)
        if m:
            app = m.group(1)
            data = get_versions(app)
            if data is None:
                self._send(404, {"error": f"versions.json not found for app '{app}'"})
                log("GET", self.path, 404)
            else:
                self._send(200, data)
                log("GET", self.path, 200)
            return

        self._send(404, {"error": "not found"})
        log("GET", self.path, 404)

    def do_POST(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        # POST /api/verify-auth
        if path == "/api/verify-auth":
            if verify_admin_request(self.headers):
                self._send(200, {"ok": True, "auth_required": is_auth_required()})
                log("POST", self.path, 200)
            else:
                self._send(401, {"ok": False, "error": "Unauthorized: Invalid admin password"})
                log("POST", self.path, 401)
            return

        # Enforce admin authentication on all mutating POST routes
        if not verify_admin_request(self.headers):
            self._send(401, {"ok": False, "error": "Unauthorized: Invalid or missing admin password"})
            log("POST", self.path, 401)
            return

        # POST /api/sync
        if path == "/api/sync":
            body, status = trigger_sync()
            self._send(status, body)
            log("POST", self.path, status)
            return

        # POST /api/catalog
        if path == "/api/catalog":
            content_length = int(self.headers.get("Content-Length", 0))
            payload = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(payload.decode("utf-8"))
            except Exception as e:
                self._send(400, {"ok": False, "error": f"Invalid JSON payload: {e}"})
                log("POST", self.path, 400)
                return

            if not isinstance(data, dict):
                self._send(400, {"ok": False, "error": "JSON payload must be an object"})
                log("POST", self.path, 400)
                return

            app_key = (data.get("app") or "").strip().lower()
            if not app_key and data.get("repo"):
                app_key = data["repo"].split("/")[-1].strip().lower()

            body, status = add_or_update_catalog_app(app_key, data)
            if status == 200 and data.get("sync_now"):
                trigger_sync()
            self._send(status, body)
            log("POST", self.path, status)
            return

        # POST /api/{app}/switch/{tag}
        m = re.fullmatch(r"/api/([A-Za-z0-9_\-]+)/switch/([^/]+)", path)
        if m:
            app, tag = m.group(1), m.group(2)
            body, status = switch_version(app, tag)
            self._send(status, body)
            log("POST", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("POST", self.path, 404)

    def do_PUT(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        if not verify_admin_request(self.headers):
            self._send(401, {"ok": False, "error": "Unauthorized: Invalid or missing admin password"})
            log("PUT", self.path, 401)
            return

        # PUT /api/catalog/{app}
        m = re.fullmatch(r"/api/catalog/([A-Za-z0-9_\-]+)", path)
        if m:
            app_key = m.group(1)
            content_length = int(self.headers.get("Content-Length", 0))
            payload = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(payload.decode("utf-8"))
            except Exception as e:
                self._send(400, {"ok": False, "error": f"Invalid JSON payload: {e}"})
                log("PUT", self.path, 400)
                return

            if not isinstance(data, dict):
                self._send(400, {"ok": False, "error": "JSON payload must be an object"})
                log("PUT", self.path, 400)
                return

            body, status = add_or_update_catalog_app(app_key, data)
            if status == 200 and data.get("sync_now"):
                trigger_sync()
            self._send(status, body)
            log("PUT", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("PUT", self.path, 404)

    def do_PATCH(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        if not verify_admin_request(self.headers):
            self._send(401, {"ok": False, "error": "Unauthorized: Invalid or missing admin password"})
            log("PATCH", self.path, 401)
            return

        # PATCH /api/catalog/{app}/visibility
        m = re.fullmatch(r"/api/catalog/([A-Za-z0-9_\-]+)/visibility", path)
        if m:
            app_key = m.group(1)
            content_length = int(self.headers.get("Content-Length", 0))
            payload = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(payload.decode("utf-8"))
            except Exception as e:
                self._send(400, {"ok": False, "error": f"Invalid JSON payload: {e}"})
                log("PATCH", self.path, 400)
                return

            visible = data.get("visible", True) if isinstance(data, dict) else True
            body, status = set_app_visibility(app_key, visible)
            self._send(status, body)
            log("PATCH", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("PATCH", self.path, 404)

    def do_DELETE(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        if not verify_admin_request(self.headers):
            self._send(401, {"ok": False, "error": "Unauthorized: Invalid or missing admin password"})
            log("DELETE", self.path, 401)
            return

        # DELETE /api/catalog/{app}
        m = re.fullmatch(r"/api/catalog/([A-Za-z0-9_\-]+)", path)
        if m:
            app_key = m.group(1)
            body, status = delete_catalog_app(app_key)
            self._send(status, body)
            log("DELETE", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("DELETE", self.path, 404)

    # ------------------------------------------------------------------
    # Response helper
    # ------------------------------------------------------------------

    def _send(self, status: int, body: Any) -> None:
        payload = json.dumps(body).encode("utf-8") if body is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Auth-Required", "true" if is_auth_required() else "false")
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        if payload:
            self.wfile.write(payload)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    host, port = "127.0.0.1", 5000
    server = ThreadingHTTPServer((host, port), SwitchAPIHandler)
    server.daemon_threads = True
    print(f"[{utcnow()}] ArtCraft Switch API v2.0 listening on {host}:{port}  (TARGET_DIR={TARGET_DIR})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"[{utcnow()}] Shutting down.", flush=True)
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
