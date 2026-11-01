#!/usr/bin/env python3
"""
switch_api.py – Version-switch and System Control HTTP API for ArtCraft Hub.

Endpoints:
  GET  /api/manifest           → combined manifest of all apps + system status
  GET  /api/status             → system sync status and stats
  POST /api/sync               → trigger background sync of releases
  GET  /api/{app}/versions     → versions.json for a single app
  POST /api/{app}/switch/{tag} → atomically switch active release
  OPTIONS /api/*               → CORS preflight
"""

import json
import os
import re
import sys
import tempfile
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

TARGET_DIR = os.environ.get("TARGET_DIR", "/data")
SYNC_LOCK_FILE = Path("/tmp/sync.lock")
STATUS_FILE = Path(TARGET_DIR) / ".sync_status.json"
PINNED_FILE = Path(TARGET_DIR) / "pinned.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(method: str, path: str, status: int) -> None:
    print(f"[{utcnow()}] {method} {path} → {status}", flush=True)


def read_json(filepath: Path):
    """Return parsed JSON from *filepath*, or None on any error."""
    try:
        with open(filepath, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def write_json(filepath: Path, data) -> None:
    """Atomically write *data* as JSON to *filepath*."""
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


def sorted_releases_newest_first(releases):
    """Sort release dicts newest-first using semver-aware tuple comparison."""
    def _key(r):
        tag = r.get("tag", "")
        cleaned = re.sub(r"^v", "", tag, flags=re.IGNORECASE)
        parts = re.split(r"[.\-]", cleaned)
        numeric = []
        for p in parts:
            try:
                numeric.append((0, int(p)))
            except ValueError:
                numeric.append((1, p))
        return numeric

    return sorted(releases, key=_key, reverse=True)


def get_status():
    """Return status dictionary describing sync and system stats."""
    status_data = read_json(STATUS_FILE) or {}
    is_syncing = False

    if SYNC_LOCK_FILE.exists():
        try:
            pid = int(SYNC_LOCK_FILE.read_text().strip())
            # Check if process is still active
            os.kill(pid, 0)
            is_syncing = True
        except (ValueError, OSError):
            SYNC_LOCK_FILE.unlink(missing_ok=True)

    if not is_syncing and status_data.get("status") == "syncing":
        status_data["status"] = "idle"

    # Count apps on disk
    apps_list = []
    base = Path(TARGET_DIR)
    if base.is_dir():
        for d in base.iterdir():
            if d.is_dir() and (d / "versions.json").is_file():
                apps_list.append(d.name)

    return {
        "status": "syncing" if is_syncing else status_data.get("status", "idle"),
        "is_syncing": is_syncing,
        "last_sync": status_data.get("last_sync"),
        "last_success": status_data.get("last_success", True),
        "apps_count": len(apps_list),
        "schedule": os.environ.get("SYNC_CRON", "0 0 * * *"),
        "timezone": os.environ.get("TZ", "UTC"),
    }


def trigger_sync():
    """Trigger background sync.sh execution."""
    if SYNC_LOCK_FILE.exists():
        try:
            pid = int(SYNC_LOCK_FILE.read_text().strip())
            os.kill(pid, 0)
            return {"ok": False, "error": "Sync is already in progress"}, 409
        except (ValueError, OSError):
            SYNC_LOCK_FILE.unlink(missing_ok=True)

    sync_script = Path("/usr/local/bin/sync.sh")
    if not sync_script.is_file():
        return {"ok": False, "error": "sync.sh not found in container"}, 500

    try:
        proc = subprocess.Popen(
            ["/usr/local/bin/sync.sh"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        SYNC_LOCK_FILE.write_text(str(proc.pid))
        return {"ok": True, "message": "Sync started in background", "pid": proc.pid}, 200
    except Exception as exc:
        return {"ok": False, "error": f"Failed to execute sync script: {exc}"}, 500


def get_pinned():
    """Return list of pinned app identifiers."""
    data = read_json(PINNED_FILE)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("pinned", [])
    return []


def set_pinned(pinned_list):
    """Atomically write pinned apps list."""
    if not isinstance(pinned_list, list):
        pinned_list = []
    cleaned = [str(x) for x in pinned_list if isinstance(x, (str, int))]
    write_json(PINNED_FILE, {"pinned": cleaned})
    return {"ok": True, "pinned": cleaned}


def get_manifest():
    """Scan TARGET_DIR and return combined manifest dict."""
    base = Path(TARGET_DIR)
    apps = []
    if not base.is_dir():
        return {"apps": apps, "system": get_status(), "pinned": get_pinned()}
    for app_dir in sorted(base.iterdir()):
        if not app_dir.is_dir():
            continue
        versions_file = app_dir / "versions.json"
        data = read_json(versions_file)
        if data is None:
            continue
        releases = data.get("releases", [])
        apps.append({
            "app": data.get("app", app_dir.name),
            "active": data.get("active", ""),
            "releases": sorted_releases_newest_first(releases),
        })
    return {"apps": apps, "system": get_status(), "pinned": get_pinned()}


def get_versions(app: str):
    """Return versions.json dict for *app*, or None if not found."""
    versions_file = Path(TARGET_DIR) / app / "versions.json"
    return read_json(versions_file)


def switch_version(app: str, tag: str):
    """
    Atomically switch the active release for *app* to *tag*.
    Returns (response_dict, http_status).
    """
    app_dir = Path(TARGET_DIR) / app
    tag_dir = app_dir / "releases" / tag

    # Validate tag format to prevent path traversal
    if not re.fullmatch(r"[A-Za-z0-9._\-]+", tag):
        return {"ok": False, "error": "invalid tag format"}, 400

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
    data["active"] = tag
    try:
        write_json(versions_file, data)
    except OSError as exc:
        return {"ok": False, "error": f"versions.json update failed: {exc}"}, 500

    return {"ok": True, "app": app, "active": tag}, 200


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


class SwitchAPIHandler(BaseHTTPRequestHandler):
    server_version = "ArtCraftSwitchAPI/1.1"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def do_OPTIONS(self):
        self._send(200, None)
        log("OPTIONS", self.path, 200)

    def do_GET(self):
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

        # GET /api/pinned
        if path == "/api/pinned":
            body = {"pinned": get_pinned()}
            self._send(200, body)
            log("GET", self.path, 200)
            return

        # GET /api/{app}/versions
        m = re.fullmatch(r"/api/([^/]+)/versions", path)
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

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")

        # POST /api/sync
        if path == "/api/sync":
            body, status = trigger_sync()
            self._send(status, body)
            log("POST", self.path, status)
            return

        # POST /api/pinned
        if path == "/api/pinned":
            content_length = int(self.headers.get("Content-Length", 0))
            payload = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(payload.decode("utf-8"))
                pinned = data.get("pinned", []) if isinstance(data, dict) else data
                body = set_pinned(pinned)
                self._send(200, body)
                log("POST", self.path, 200)
            except Exception as e:
                self._send(400, {"ok": False, "error": str(e)})
                log("POST", self.path, 400)
            return

        # POST /api/{app}/switch/{tag}
        m = re.fullmatch(r"/api/([^/]+)/switch/([^/]+)", path)
        if m:
            app, tag = m.group(1), m.group(2)
            body, status = switch_version(app, tag)
            self._send(status, body)
            log("POST", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("POST", self.path, 404)

    # ------------------------------------------------------------------
    # Response helper
    # ------------------------------------------------------------------

    def _send(self, status: int, body) -> None:
        payload = json.dumps(body).encode("utf-8") if body is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        if payload:
            self.wfile.write(payload)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    host, port = "127.0.0.1", 5000
    server = HTTPServer((host, port), SwitchAPIHandler)
    print(f"[{utcnow()}] ArtCraft Switch API v1.1 listening on {host}:{port}  (TARGET_DIR={TARGET_DIR})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"[{utcnow()}] Shutting down.", flush=True)
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
