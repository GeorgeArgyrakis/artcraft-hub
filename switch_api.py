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

import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import signal
import sys
import tempfile
import threading
import time
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

TARGET_DIR: str = os.environ.get("TARGET_DIR", "/data")
DEFAULT_LOCK_DIR: str = "/tmp" if os.path.isdir("/tmp") else tempfile.gettempdir()
SYNC_LOCK_FILE: Path = Path(os.environ.get("SYNC_LOCK_PATH", Path(DEFAULT_LOCK_DIR) / "sync.lock"))
STATUS_FILE: Path = Path(TARGET_DIR) / ".sync_status.json"
CATALOG_FILE: Path = Path(os.environ.get("CATALOG_FILE", "/config/catalog.json"))
BUNDLED_CATALOG_FILE: Path = Path("/usr/local/share/artcraft/catalog.json")
LOCAL_CATALOG_FILE: Path = Path(__file__).resolve().parent / "config" / "catalog.json"
SYNC_SCRIPT_PATH: Path = Path(os.environ.get("SYNC_SCRIPT_PATH", "/usr/local/bin/sync.sh"))
DISCOVERED_APPS_FILE: Path = Path(TARGET_DIR) / ".discovered_apps.json"

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
    """
    Sort release dicts newest-first using semver-aware tuple comparison.
    Ensures final releases sort higher than pre-releases (e.g. 1.0.0 > 1.0.0-rc1 > 1.0.0-alpha).
    """
    def _key(r: Dict[str, Any]) -> Tuple[Any, ...]:
        tag = (r.get("tag") or "").strip()
        cleaned = re.sub(r"^v", "", tag, flags=re.IGNORECASE)
        # Split off build metadata (+)
        version_part = cleaned.split("+", 1)[0]

        # Separate core version from pre-release (-alpha, -rc1, etc.)
        if "-" in version_part:
            core_part, prerelease_part = version_part.split("-", 1)
            is_final = 0  # Pre-releases sort lower than final releases
        else:
            match = re.match(r"^(\d+(?:\.\d+)*)(.*)$", version_part)
            if match and match.group(2):
                core_part = match.group(1)
                prerelease_part = match.group(2).lstrip("-.")
                is_final = 0
            else:
                core_part = version_part
                prerelease_part = ""
                is_final = 1  # Final releases sort higher

        # Parse numeric core components (e.g. 1.0.0)
        core_tokens: List[int] = []
        is_numeric_core = True
        for part in core_part.split("."):
            if part.isdigit():
                core_tokens.append(int(part))
            else:
                is_numeric_core = False
                break

        if is_numeric_core and len(core_tokens) > 0:
            while len(core_tokens) < 3:
                core_tokens.append(0)
            core_tuple = tuple(core_tokens[:3])
            priority = 1
        else:
            core_tuple = (-1,)
            priority = 0

        # Parse pre-release tokens
        prerelease_tokens: List[Tuple[int, Union[int, str]]] = []
        if prerelease_part:
            for p in re.split(r"[.\-]", prerelease_part):
                if p.isdigit():
                    prerelease_tokens.append((0, int(p)))
                else:
                    prerelease_tokens.append((1, p))

        return (priority, core_tuple, is_final, prerelease_tokens)

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

    discovered = get_discovered_apps()

    rate_limited = bool(status_data.get("rate_limited", False))
    last_error = str(status_data.get("last_error", "") or "")
    if not rate_limited and "rate limit" in last_error.lower():
        rate_limited = True

    return {
        "status": "syncing" if is_syncing else status_data.get("status", "idle"),
        "is_syncing": is_syncing,
        "last_sync": status_data.get("last_sync"),
        "last_success": status_data.get("last_success", True),
        "rate_limited": rate_limited,
        "last_error": last_error,
        "apps_count": len(apps_list),
        "schedule": os.environ.get("SYNC_CRON", "0 0 * * *"),
        "timezone": os.environ.get("TZ", "UTC"),
        "auth_required": is_auth_required(),
        "discovered_apps": discovered,
        "discovered_count": len(discovered),
    }


SESSION_COOKIE_NAME: str = "artcraft_session"
SESSION_DURATION_SECONDS: int = 86400  # 24 hours
MAX_BODY_SIZE: int = 64 * 1024         # 64 KB payload cap to prevent OOM/DoS
MAX_SESSIONS: int = 1000               # Bounded memory for active sessions
MAX_TRACKED_IPS: int = 5000            # Bounded memory for rate-limiting failure tracking
DISCOVER_REFRESH_COOLDOWN_SECONDS: int = 300  # 5-minute cooldown for unauthenticated refresh
CATALOG_LOCK = threading.Lock()
_discover_refresh_lock = threading.Lock()
_last_discover_refresh_time: float = 0.0

_trusted_env = os.environ.get("TRUSTED_PROXIES", "").strip()
TRUSTED_PROXIES = (
    set(p.strip() for p in _trusted_env.split(",") if p.strip())
    if _trusted_env
    else {"127.0.0.1", "::1", "localhost"}
)


def get_admin_password() -> str:
    """Return configured admin password, or empty string if disabled."""
    return os.environ.get("ADMIN_PASSWORD", "").strip()


def is_auth_required() -> bool:
    """Return True if admin password protection is enabled."""
    return bool(get_admin_password())


def verify_password(expected: str, provided: str) -> bool:
    """Constant-time comparison with SHA-256 pre-hashing to prevent timing attacks and length leaks."""
    if not expected or not provided:
        return False
    exp_hash = hashlib.sha256(expected.encode("utf-8")).digest()
    prov_hash = hashlib.sha256(provided.encode("utf-8")).digest()
    return hmac.compare_digest(exp_hash, prov_hash)


class SessionManager:
    """Thread-safe in-memory session token manager with bounded capacity."""

    def __init__(self, ttl: int = SESSION_DURATION_SECONDS, max_sessions: int = MAX_SESSIONS):
        self.ttl = ttl
        self.max_sessions = max_sessions
        self._sessions: Dict[str, float] = {}
        self._lock = threading.Lock()

    def create_session(self) -> str:
        token = secrets.token_urlsafe(32)
        expires_at = time.time() + self.ttl
        with self._lock:
            self._purge_expired_locked()
            while len(self._sessions) >= self.max_sessions:
                # Evict oldest expiring token
                oldest_token = min(self._sessions, key=lambda k: self._sessions[k])
                del self._sessions[oldest_token]
            self._sessions[token] = expires_at
        return token

    def is_valid(self, token: str) -> bool:
        if not token:
            return False
        with self._lock:
            expires_at = self._sessions.get(token)
            if not expires_at:
                return False
            if time.time() > expires_at:
                del self._sessions[token]
                return False
            return True

    def revoke_session(self, token: str) -> bool:
        with self._lock:
            return self._sessions.pop(token, None) is not None

    def _purge_expired_locked(self) -> None:
        now = time.time()
        expired = [t for t, exp in self._sessions.items() if now > exp]
        for t in expired:
            del self._sessions[t]

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()


session_manager = SessionManager()


class AuthRateLimiter:
    """Non-blocking IP-based failure tracker preventing brute-force password guessing with bounded capacity."""

    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 60,
        lockout_seconds: int = 60,
        max_tracked_ips: int = MAX_TRACKED_IPS,
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self.max_tracked_ips = max_tracked_ips
        self._failures: Dict[str, List[float]] = {}
        self._locked_until: Dict[str, float] = {}
        self._lock = threading.Lock()

    def is_locked(self, ip: str) -> Tuple[bool, int]:
        """Return (True, retry_after) if IP is currently locked out."""
        now = time.time()
        with self._lock:
            locked_until = self._locked_until.get(ip, 0)
            if now < locked_until:
                return True, max(1, int(locked_until - now))
            if ip in self._locked_until:
                del self._locked_until[ip]
            return False, 0

    def record_failure(self, ip: str) -> Tuple[bool, int]:
        """Record a failed authentication attempt. Returns (is_locked_now, retry_after)."""
        now = time.time()
        with self._lock:
            self._purge_overflow_locked(now)
            cutoff = now - self.window_seconds
            attempts = [ts for ts in self._failures.get(ip, []) if ts > cutoff]
            attempts.append(now)
            self._failures[ip] = attempts

            if len(attempts) >= self.max_attempts:
                lockout = now + self.lockout_seconds
                self._locked_until[ip] = lockout
                self._failures[ip] = []
                return True, self.lockout_seconds
            return False, 0

    def record_success(self, ip: str) -> None:
        """Clear failures on successful authentication."""
        with self._lock:
            self._failures.pop(ip, None)
            self._locked_until.pop(ip, None)

    def _purge_overflow_locked(self, now: float) -> None:
        """Evict expired or oldest entries if capacity is exceeded."""
        if len(self._failures) >= self.max_tracked_ips:
            cutoff = now - self.window_seconds
            expired = [k for k, v in self._failures.items() if not v or max(v) <= cutoff]
            for k in expired:
                del self._failures[k]
            while len(self._failures) >= self.max_tracked_ips:
                first_key = next(iter(self._failures))
                del self._failures[first_key]

        if len(self._locked_until) >= self.max_tracked_ips:
            expired_locks = [k for k, exp in self._locked_until.items() if now >= exp]
            for k in expired_locks:
                del self._locked_until[k]
            while len(self._locked_until) >= self.max_tracked_ips:
                first_key = next(iter(self._locked_until))
                del self._locked_until[first_key]

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()
            self._locked_until.clear()


rate_limiter = AuthRateLimiter()


def get_client_ip(handler: BaseHTTPRequestHandler) -> str:
    """
    Extract client IP safely.
    Only trusts X-Forwarded-For if direct peer address is in TRUSTED_PROXIES.
    """
    peer_ip = "127.0.0.1"
    client = getattr(handler, "client_address", None)
    if client and isinstance(client, (tuple, list)) and len(client) > 0:
        peer_ip = str(client[0])

    if peer_ip in TRUSTED_PROXIES and hasattr(handler, "headers") and handler.headers:
        xfwd = handler.headers.get("X-Forwarded-For")
        if xfwd:
            return xfwd.split(",")[0].strip()

    return peer_ip


def get_cookie_value(headers: Any, cookie_name: str) -> Optional[str]:
    """Extract cookie value from request headers."""
    if not hasattr(headers, "get"):
        return None
    raw_cookie = headers.get("Cookie")
    if not raw_cookie:
        return None
    try:
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        morsel = cookie.get(cookie_name)
        return morsel.value if morsel else None
    except Exception:
        return None


def read_request_body(handler: BaseHTTPRequestHandler) -> Tuple[Optional[bytes], Optional[Tuple[int, Dict[str, Any]]]]:
    """
    Safely read and validate HTTP request body.
    Enforces MAX_BODY_SIZE to prevent memory exhaustion / DoS attacks.
    Returns (payload, None) on success, or (None, (status_code, error_dict)) on failure.
    """
    raw_len = handler.headers.get("Content-Length")
    if raw_len is None:
        return b"{}", None

    try:
        content_length = int(raw_len)
    except (ValueError, TypeError):
        return None, (400, {"ok": False, "error": "Invalid Content-Length header: must be an integer"})

    if content_length < 0:
        return None, (400, {"ok": False, "error": "Invalid Content-Length: cannot be negative"})

    if content_length > MAX_BODY_SIZE:
        return None, (413, {
            "ok": False,
            "error": f"Payload too large: Content-Length {content_length} exceeds limit of {MAX_BODY_SIZE} bytes"
        })

    if content_length == 0:
        return b"{}", None

    try:
        payload = handler.rfile.read(content_length)
        if len(payload) != content_length:
            return None, (400, {"ok": False, "error": "Incomplete payload received"})
        return payload, None
    except Exception as exc:
        return None, (400, {"ok": False, "error": f"Failed reading request body: {exc}"})


def is_forward_auth_trusted() -> bool:
    """Check if forward/reverse-proxy authentication headers should be trusted."""
    return os.environ.get("TRUST_FORWARD_AUTH", "").strip().lower() in ("true", "1", "yes")


TRUST_FORWARD_AUTH: bool = is_forward_auth_trusted()


def is_https_request(headers: Any) -> bool:
    """Check if request was served over HTTPS (direct or forwarded by reverse proxy)."""
    if hasattr(headers, "get"):
        return (headers.get("X-Forwarded-Proto") or "").lower() == "https"
    return False


def verify_admin_request(headers: Any) -> bool:
    """Verify request headers or cookies against ADMIN_PASSWORD, active session, or ForwardAuth SSO."""
    if not is_auth_required():
        return True

    # 1. Check Reverse-Proxy SSO / ForwardAuth headers (Authelia, Authentik, Cloudflare Access)
    if is_forward_auth_trusted() and hasattr(headers, "get"):
        forwarded_user = (
            headers.get("Remote-User") or
            headers.get("X-Forwarded-User") or
            headers.get("X-Auth-Request-User") or
            ""
        ).strip()
        if forwarded_user:
            return True

    expected = get_admin_password()
    session_token = get_cookie_value(headers, SESSION_COOKIE_NAME)
    if session_token and session_manager.is_valid(session_token):
        return True

    provided = ""
    if hasattr(headers, "get"):
        provided = headers.get("X-Admin-Password", "") or ""
        if not provided:
            auth_hdr = headers.get("Authorization", "") or ""
            if auth_hdr.startswith("Bearer "):
                provided = auth_hdr[7:].strip()

    if provided:
        if session_manager.is_valid(provided):
            return True
        if verify_password(expected, provided):
            return True

    return False


def check_admin_auth(handler: BaseHTTPRequestHandler) -> Tuple[bool, Optional[Tuple[int, Dict[str, Any], Dict[str, str]]]]:
    """
    Check if request is authorized as admin.
    Returns (True, None) if authorized.
    Returns (False, (status_code, body_dict, extra_headers)) if unauthorized or rate-limited.
    """
    if not is_auth_required():
        return True, None

    client_ip = get_client_ip(handler)
    is_locked, retry_after = rate_limiter.is_locked(client_ip)
    if is_locked:
        return False, (429, {
            "ok": False,
            "error": "Too many failed authentication attempts. Please try again later.",
            "retry_after": retry_after
        }, {"Retry-After": str(retry_after)})

    headers = getattr(handler, "headers", {})
    if verify_admin_request(headers):
        rate_limiter.record_success(client_ip)
        return True, None

    # Record failure on unauthorized access attempt
    locked, retry_after = rate_limiter.record_failure(client_ip)
    if locked:
        return False, (429, {
            "ok": False,
            "error": "Too many failed authentication attempts. Please try again later.",
            "retry_after": retry_after
        }, {"Retry-After": str(retry_after)})

    return False, (401, {"ok": False, "error": "Unauthorized: Invalid or missing admin credentials"}, {})


def trigger_sync(app_key: Optional[str] = None) -> Tuple[Dict[str, Any], int]:
    """Trigger background sync.sh execution (full suite or targeted single-app sync)."""
    if SYNC_LOCK_FILE.exists():
        try:
            pid = int(SYNC_LOCK_FILE.read_text().strip())
            if hasattr(os, "kill"):
                os.kill(pid, 0)
                return {"ok": False, "error": "Sync is already in progress"}, 409
        except (ValueError, OSError):
            SYNC_LOCK_FILE.unlink(missing_ok=True)

    sync_script = SYNC_SCRIPT_PATH
    if not sync_script.is_file():
        local_script = Path(__file__).resolve().parent / "sync.sh"
        if local_script.is_file():
            sync_script = local_script
        else:
            return {"ok": False, "error": f"sync script not found at {SYNC_SCRIPT_PATH}"}, 500

    cmd = [str(sync_script)]
    if app_key and APP_NAME_RE.fullmatch(app_key):
        cmd.append(app_key)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        SYNC_LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        SYNC_LOCK_FILE.write_text(str(proc.pid))

        def _reap(p: subprocess.Popen) -> None:
            try:
                p.wait()
            except Exception:
                pass

        threading.Thread(target=_reap, args=(proc,), daemon=True).start()

        msg = f"Sync started for {app_key}" if app_key else "Sync started in background"
        return {"ok": True, "message": msg, "pid": proc.pid}, 200
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
    """Add or update an application record in catalog.json with concurrency protection."""
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

    with CATALOG_LOCK:
        catalog = get_catalog()
        existing = catalog.get(app_key, {})
        if meta.get("num"):
            num = str(meta["num"])
        elif existing.get("num"):
            num = str(existing["num"])
        else:
            max_num = max(
                (int(v.get("num", 0)) for v in catalog.values() if isinstance(v, dict) and str(v.get("num", "")).isdigit()),
                default=0,
            )
            num = f"{max_num + 1:02d}"

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

    # Clean up from discovered apps if present
    if DISCOVERED_APPS_FILE.is_file():
        try:
            discovered = read_json(DISCOVERED_APPS_FILE)
            if isinstance(discovered, list):
                updated = [d for d in discovered if isinstance(d, dict) and d.get("app") != app_key]
                if len(updated) != len(discovered):
                    write_json(DISCOVERED_APPS_FILE, updated)
        except Exception:
            pass

    return {"ok": True, "app": app_key, "entry": entry}, 200


def set_app_visibility(app_key: str, visible: bool) -> Tuple[Dict[str, Any], int]:
    """Update visibility flag for an application in catalog.json with concurrency protection."""
    if not APP_NAME_RE.fullmatch(app_key):
        return {"ok": False, "error": f"Invalid app name '{app_key}'"}, 400

    with CATALOG_LOCK:
        catalog = get_catalog()
        if app_key not in catalog:
            return {"ok": False, "error": f"App '{app_key}' not found in catalog"}, 404

        catalog[app_key]["visible"] = bool(visible)
        if not save_catalog(catalog):
            return {"ok": False, "error": "Failed to save catalog.json"}, 500

        result_visible = catalog[app_key]["visible"]

    return {"ok": True, "app": app_key, "visible": result_visible}, 200


def delete_catalog_app(app_key: str) -> Tuple[Dict[str, Any], int]:
    """Delete an app from catalog.json and purge its files and graphics from disk."""
    if not APP_NAME_RE.fullmatch(app_key):
        return {"ok": False, "error": f"Invalid app name '{app_key}'"}, 400

    with CATALOG_LOCK:
        catalog = get_catalog()
        if app_key in catalog:
            del catalog[app_key]
            if not save_catalog(catalog):
                return {"ok": False, "error": "Failed to save catalog.json"}, 500

    # Purge application directory in TARGET_DIR (/data/{app})
    app_dir = Path(TARGET_DIR) / app_key
    if app_dir.is_dir():
        shutil.rmtree(app_dir, ignore_errors=True)

    # Purge downloaded vector master icon (.svg) or raster icons/previews (.webp)
    target_path = Path(TARGET_DIR)
    for rel_path in (
        f"icons/{app_key}.svg",
        f"icons/{app_key}.webp",
        f"previews/{app_key}.webp",
    ):
        asset = target_path / rel_path
        if asset.is_file() or asset.is_symlink():
            try:
                asset.unlink()
            except OSError:
                pass

    return {"ok": True, "app": app_key, "deleted": True}, 200


def resolve_app_icon(app_name: str) -> Optional[str]:
    """Return the relative web URL for the existing icon, or None if no icon exists."""
    if not APP_NAME_RE.fullmatch(app_name):
        return None

    candidates = [
        Path(TARGET_DIR) / "icons",
        Path("/usr/local/share/artcraft/icons"),
        Path(__file__).resolve().parent / "icons",
    ]

    for d in candidates:
        if d.is_dir():
            if (d / f"{app_name}.webp").is_file():
                return f"/icons/{app_name}.webp"
            if (d / f"{app_name}.svg").is_file():
                return f"/icons/{app_name}.svg"

    return None


def resolve_app_preview(app_name: str) -> Optional[str]:
    """Return the relative web URL for the existing preview graphic, or None if no preview exists."""
    if not APP_NAME_RE.fullmatch(app_name):
        return None

    candidates = [
        Path(TARGET_DIR) / "previews",
        Path("/usr/local/share/artcraft/previews"),
        Path(__file__).resolve().parent / "previews",
    ]

    for d in candidates:
        if d.is_dir():
            if (d / f"{app_name}.webp").is_file():
                return f"/previews/{app_name}.webp"

    return None


KNOWN_APP_METADATA: Dict[str, Dict[str, Any]] = {
    "anicraft": {
        "title": "AniCraft",
        "category": "Graphics & Photo",
        "categoryTag": "2D ANIMATION & TIMELINE",
        "accentColor": "#a855f7",
        "tagline": "2D Vector Animation Studio",
        "desc": "Open-source 2D animation, vector tweens, and interactive timelines.",
        "webReady": False,  # Upstream is developing WebAssembly build; desktop-only currently
    },
    "materialcraft": {
        "title": "MaterialCraft",
        "category": "3D & CAD",
        "categoryTag": "PROCEDURAL MATERIAL STUDIO",
        "accentColor": "#e11d48",
        "tagline": "Procedural PBR Material Authoring",
        "desc": "Open-source procedural PBR material designer and shader authoring in pure Rust.",
        "webReady": True,
    },
    "solidcraft": {
        "title": "SolidCraft",
        "category": "3D & CAD",
        "categoryTag": "SOLID MODELING",
        "accentColor": "#0284c7",
        "tagline": "Parametric Solid Modeling",
        "desc": "Open-source boundary representation and parametric solid modeling engine.",
        "webReady": True,
    },
}


def get_discovered_apps() -> List[Dict[str, Any]]:
    """Return list of discovered upstream ArtCraft apps not yet registered in catalog.json."""
    catalog = get_catalog()
    discovered = read_json(DISCOVERED_APPS_FILE)
    if not isinstance(discovered, list):
        return []
    filtered = []
    for item in discovered:
        if isinstance(item, dict) and item.get("app") and item["app"] not in catalog:
            app_key = item["app"]
            item["icon"] = resolve_app_icon(app_key)
            item["preview"] = resolve_app_preview(app_key)
            filtered.append(item)
    return filtered


def check_upstream_web_ready(slug: str) -> bool:
    """
    Check if upstream GitHub repository currently has a WebAssembly release asset (*web*.zip).
    Falls back to KNOWN_APP_METADATA if GitHub cannot be queried.
    """
    try:
        gh_headers = {
            "User-Agent": "ArtCraftHub/2.0",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if token:
            gh_headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(
            f"https://api.github.com/repos/storytold/{slug}/releases/latest",
            headers=gh_headers,
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assets = data.get("assets", [])
            if isinstance(assets, list) and len(assets) > 0:
                return any(
                    re.search(r"web.*\.zip$", a.get("name", ""), re.IGNORECASE)
                    for a in assets
                    if isinstance(a, dict)
                )
    except Exception:
        pass

    if slug in KNOWN_APP_METADATA:
        return bool(KNOWN_APP_METADATA[slug].get("webReady", False if slug == "anicraft" else True))
    return True


def discover_upstream_apps() -> List[Dict[str, Any]]:
    """
    Query getartcraft.com and GitHub storytold organization for new Craft apps not yet in catalog.json.
    Writes result to DISCOVERED_APPS_FILE and returns discovered app list.
    """
    catalog = get_catalog()
    candidate_slugs = set()

    # 1. Check getartcraft.com (authoritative list of ArtCraft apps)
    try:
        req = urllib.request.Request(
            "https://getartcraft.com/",
            headers={"User-Agent": "ArtCraftHub/2.0"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="replace")
            for match in re.findall(r"/images/apps/([a-zA-Z0-9_\-]+)/icon\.webp", html):
                candidate_slugs.add(match.lower())
    except Exception:
        pass

    # 2. Check GitHub organization public repos only if getartcraft.com was unreachable
    if not candidate_slugs:
        try:
            gh_headers = {
                "User-Agent": "ArtCraftHub/2.0",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
            token = os.environ.get("GITHUB_TOKEN", "").strip()
            if token:
                gh_headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(
                "https://api.github.com/orgs/storytold/repos?type=public&per_page=100",
                headers=gh_headers
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                repos_data = json.loads(resp.read().decode("utf-8"))
                if isinstance(repos_data, list):
                    for r in repos_data:
                        name = (r.get("name") or "").lower()
                        if re.fullmatch(r"[a-z]+craft|craft-anything", name) and name not in ("artcraft", "crafthub"):
                            candidate_slugs.add(name)
        except Exception:
            pass

    discovered = []
    for slug in sorted(candidate_slugs):
        if slug in catalog:
            continue
        web_ready = check_upstream_web_ready(slug)
        if slug in KNOWN_APP_METADATA:
            m = KNOWN_APP_METADATA[slug]
            entry = {
                "app": slug,
                "repo": f"storytold/{slug}",
                "title": m["title"],
                "category": m["category"],
                "categoryTag": m["categoryTag"],
                "accentColor": m["accentColor"],
                "tagline": m["tagline"],
                "desc": m["desc"],
                "webReady": web_ready,
                "visible": True,
            }
        else:
            title = re.sub(r"[-_]", " ", slug).title().replace(" ", "")
            entry = {
                "app": slug,
                "repo": f"storytold/{slug}",
                "title": title,
                "category": "Graphics & Photo",
                "categoryTag": "CREATIVE STUDIO",
                "accentColor": "#4f46e5",
                "tagline": f"{title} Studio App",
                "desc": f"Open-source {title} creative application.",
                "webReady": web_ready,
                "visible": True,
            }
        entry["icon"] = resolve_app_icon(slug)
        entry["preview"] = resolve_app_preview(slug)
        discovered.append(entry)

    try:
        write_json(DISCOVERED_APPS_FILE, discovered)
    except Exception:
        pass

    return discovered


def get_manifest(headers: Optional[Any] = None) -> Dict[str, Any]:
    """Scan TARGET_DIR and return combined manifest dict, including registered catalog apps."""
    base = Path(TARGET_DIR)
    apps: List[Dict[str, Any]] = []
    found_apps = set()

    catalog = get_catalog()
    enriched_catalog: Dict[str, Any] = {}
    for cat_app, meta in catalog.items():
        if isinstance(meta, dict):
            entry = dict(meta)
            entry["icon"] = resolve_app_icon(cat_app)
            entry["preview"] = resolve_app_preview(cat_app)
            enriched_catalog[cat_app] = entry
        else:
            enriched_catalog[cat_app] = meta

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
                "icon": resolve_app_icon(app_name),
                "preview": resolve_app_preview(app_name),
            })

    for cat_app in catalog:
        if cat_app not in found_apps:
            apps.append({
                "app": cat_app,
                "active": "",
                "releases": [],
                "icon": resolve_app_icon(cat_app),
                "preview": resolve_app_preview(cat_app),
            })

    return {
        "apps": apps,
        "system": get_status(),
        "catalog": enriched_catalog,
        "auth_required": is_auth_required(),
        "authenticated": verify_admin_request(headers) if headers is not None else (not is_auth_required()),
        "discovered_apps": get_discovered_apps(),
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

    # Atomic symlink update with per-thread collision avoidance
    current_link = app_dir / "current"
    tmp_link = app_dir / f"current.tmp.{os.getpid()}.{threading.get_ident()}.{secrets.token_hex(4)}"

    try:
        if tmp_link.exists() or tmp_link.is_symlink():
            tmp_link.unlink()

        os.symlink(f"releases/{tag}", tmp_link)
        os.replace(tmp_link, current_link)
    except OSError as exc:
        try:
            if tmp_link.exists() or tmp_link.is_symlink():
                tmp_link.unlink()
        except OSError:
            pass
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

def get_cors_origin() -> str:
    """Return configured allowed CORS origin from environment."""
    return os.environ.get("CORS_ORIGIN", "").strip()


CORS_ORIGIN: str = get_cors_origin()


def get_cors_headers(origin: Optional[str] = None) -> Dict[str, str]:
    """Return CORS headers. Only permits cross-origin requests if CORS_ORIGIN is configured."""
    headers: Dict[str, str] = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Password, Cookie, Remote-User, X-Forwarded-User",
        "Access-Control-Expose-Headers": "X-Auth-Required, Set-Cookie, Retry-After",
    }
    allowed_origin = get_cors_origin()
    if allowed_origin:
        if allowed_origin == "*" or (origin and origin == allowed_origin):
            headers["Access-Control-Allow-Origin"] = origin or allowed_origin
    return headers


class SwitchAPIHandler(BaseHTTPRequestHandler):
    server_version = "ArtCraftSwitchAPI/2.0"
    sys_version = ""

    def log_message(self, fmt: str, *args: Any) -> None:
        """Suppress default stderr request logging in favor of structured log()."""
        pass

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def _read_json_dict(self) -> Optional[Dict[str, Any]]:
        """Safely read request body and parse as JSON dictionary. Sends error response if invalid."""
        payload, err = read_request_body(self)
        if err:
            status, body = err
            self._send(status, body)
            log(self.command, self.path, status)
            return None

        try:
            data = json.loads(payload.decode("utf-8")) if payload else {}
        except Exception as e:
            self._send(400, {"ok": False, "error": f"Invalid JSON payload: {e}"})
            log(self.command, self.path, 400)
            return None

        if not isinstance(data, dict):
            self._send(400, {"ok": False, "error": "JSON payload must be an object"})
            log(self.command, self.path, 400)
            return None

        return data

    def do_OPTIONS(self) -> None:
        self._send(200, None)
        log("OPTIONS", self.path, 200)

    def do_GET(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        # GET /api/manifest
        if path == "/api/manifest":
            body = get_manifest(self.headers)
            self._send(200, body)
            log("GET", self.path, 200)
            return

        # GET /api/status
        if path == "/api/status":
            body = get_status()
            self._send(200, body)
            log("GET", self.path, 200)
            return

        # GET /api/discover or /api/discovered
        if path in ("/api/discover", "/api/discovered"):
            refresh = False
            if "?" in self.path:
                query = self.path.split("?", 1)[1]
                refresh = "refresh=true" in query or "refresh=1" in query
            if refresh:
                now = time.time()
                is_admin, _ = check_admin_auth(self)
                should_refresh = False
                with _discover_refresh_lock:
                    global _last_discover_refresh_time
                    if is_admin or (now - _last_discover_refresh_time >= DISCOVER_REFRESH_COOLDOWN_SECONDS):
                        _last_discover_refresh_time = now
                        should_refresh = True
                if should_refresh:
                    discover_upstream_apps()
            discovered = get_discovered_apps()
            self._send(200, {"ok": True, "discovered_apps": discovered, "count": len(discovered)})
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
            client_ip = get_client_ip(self)
            is_locked, retry_after = rate_limiter.is_locked(client_ip)
            if is_locked:
                self._send(429, {
                    "ok": False,
                    "error": "Too many failed authentication attempts. Please try again later.",
                    "retry_after": retry_after
                }, {"Retry-After": str(retry_after)})
                log("POST", self.path, 429)
                return

            if not is_auth_required():
                self._send(200, {"ok": True, "auth_required": False, "authenticated": True})
                log("POST", self.path, 200)
                return

            # Check if client already possesses an active session cookie or valid Bearer
            cookie_token = get_cookie_value(self.headers, SESSION_COOKIE_NAME)
            if cookie_token and session_manager.is_valid(cookie_token):
                self._send(200, {"ok": True, "auth_required": True, "authenticated": True})
                log("POST", self.path, 200)
                return

            # Extract password from header or Bearer
            provided_pw = self.headers.get("X-Admin-Password", "") or ""
            if not provided_pw:
                auth_hdr = self.headers.get("Authorization", "") or ""
                if auth_hdr.startswith("Bearer "):
                    candidate = auth_hdr[7:].strip()
                    if session_manager.is_valid(candidate):
                        self._send(200, {"ok": True, "auth_required": True, "authenticated": True})
                        log("POST", self.path, 200)
                        return
                    provided_pw = candidate

            if not provided_pw:
                # Inspect optional JSON body
                payload, err = read_request_body(self)
                if not err and payload and payload != b"{}":
                    try:
                        body_data = json.loads(payload.decode("utf-8"))
                        if isinstance(body_data, dict):
                            provided_pw = (body_data.get("password") or "").strip()
                    except Exception:
                        pass

            expected = get_admin_password()
            if provided_pw and verify_password(expected, provided_pw):
                rate_limiter.record_success(client_ip)
                token = session_manager.create_session()
                secure_attr = "; Secure" if is_https_request(self.headers) else ""
                cookie_header = (
                    f"{SESSION_COOKIE_NAME}={token}; "
                    f"Max-Age={SESSION_DURATION_SECONDS}; "
                    f"Path=/api; HttpOnly; SameSite=Strict{secure_attr}"
                )
                self._send(200, {
                    "ok": True,
                    "auth_required": True,
                    "authenticated": True,
                    "token": token
                }, {"Set-Cookie": cookie_header})
                log("POST", self.path, 200)
                return

            # If user provided a password and it failed, record failure against rate limiter
            if provided_pw:
                locked, retry_after = rate_limiter.record_failure(client_ip)
                if locked:
                    self._send(429, {
                        "ok": False,
                        "error": "Too many failed authentication attempts. Please try again later.",
                        "retry_after": retry_after
                    }, {"Retry-After": str(retry_after)})
                    log("POST", self.path, 429)
                    return

            # If an invalid or expired cookie was presented, clear it in client browser
            extra_hdrs: Dict[str, str] = {}
            if cookie_token:
                secure_attr = "; Secure" if is_https_request(self.headers) else ""
                extra_hdrs["Set-Cookie"] = (
                    f"{SESSION_COOKIE_NAME}=; Max-Age=0; Path=/api; HttpOnly; SameSite=Strict{secure_attr}"
                )

            self._send(401, {"ok": False, "error": "Unauthorized: Invalid admin password"}, extra_hdrs)
            log("POST", self.path, 401)
            return

        # POST /api/logout
        if path == "/api/logout":
            token = get_cookie_value(self.headers, SESSION_COOKIE_NAME)
            if not token:
                auth_hdr = self.headers.get("Authorization", "") or ""
                if auth_hdr.startswith("Bearer "):
                    token = auth_hdr[7:].strip()
            if token:
                session_manager.revoke_session(token)
            secure_attr = "; Secure" if is_https_request(self.headers) else ""
            cookie_header = f"{SESSION_COOKIE_NAME}=; Max-Age=0; Path=/api; HttpOnly; SameSite=Strict{secure_attr}"
            self._send(200, {"ok": True, "message": "Admin session terminated"}, {"Set-Cookie": cookie_header})
            log("POST", self.path, 200)
            return

        # Enforce admin authentication on all mutating POST routes
        is_ok, err_spec = check_admin_auth(self)
        if not is_ok and err_spec:
            status, body, extra_headers = err_spec
            self._send(status, body, extra_headers)
            log("POST", self.path, status)
            return

        # POST /api/sync
        if path == "/api/sync":
            app_target = None
            if "?" in self.path:
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1])
                app_target = (q.get("app") or [None])[0]
            if not app_target:
                payload, _ = read_request_body(self)
                if payload and payload != b"{}":
                    try:
                        bdata = json.loads(payload.decode("utf-8"))
                        if isinstance(bdata, dict):
                            app_target = bdata.get("app")
                    except Exception:
                        pass

            body, status = trigger_sync(app_target)
            self._send(status, body)
            log("POST", self.path, status)
            return

        # POST /api/catalog
        if path == "/api/catalog":
            data = self._read_json_dict()
            if data is None:
                return

            app_key = (data.get("app") or "").strip().lower()
            if not app_key and data.get("repo"):
                app_key = data["repo"].split("/")[-1].strip().lower()

            body, status = add_or_update_catalog_app(app_key, data)
            if status == 200 and data.get("sync_now"):
                trigger_sync(app_key)
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

        is_ok, err_spec = check_admin_auth(self)
        if not is_ok and err_spec:
            status, body, extra_headers = err_spec
            self._send(status, body, extra_headers)
            log("PUT", self.path, status)
            return

        # PUT /api/catalog/{app}
        m = re.fullmatch(r"/api/catalog/([A-Za-z0-9_\-]+)", path)
        if m:
            app_key = m.group(1)
            data = self._read_json_dict()
            if data is None:
                return

            body, status = add_or_update_catalog_app(app_key, data)
            if status == 200 and data.get("sync_now"):
                trigger_sync(app_key)
            self._send(status, body)
            log("PUT", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("PUT", self.path, 404)

    def do_PATCH(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        is_ok, err_spec = check_admin_auth(self)
        if not is_ok and err_spec:
            status, body, extra_headers = err_spec
            self._send(status, body, extra_headers)
            log("PATCH", self.path, status)
            return

        # PATCH /api/catalog/{app}/visibility
        m = re.fullmatch(r"/api/catalog/([A-Za-z0-9_\-]+)/visibility", path)
        if m:
            app_key = m.group(1)
            data = self._read_json_dict()
            if data is None:
                return

            visible = data.get("visible", True)
            body, status = set_app_visibility(app_key, visible)
            self._send(status, body)
            log("PATCH", self.path, status)
            return

        self._send(404, {"error": "not found"})
        log("PATCH", self.path, 404)

    def do_DELETE(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        is_ok, err_spec = check_admin_auth(self)
        if not is_ok and err_spec:
            status, body, extra_headers = err_spec
            self._send(status, body, extra_headers)
            log("DELETE", self.path, status)
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

    def _send(self, status: int, body: Any, extra_headers: Optional[Dict[str, str]] = None) -> None:
        payload = json.dumps(body).encode("utf-8") if body is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Auth-Required", "true" if is_auth_required() else "false")
        req_origin = self.headers.get("Origin") if hasattr(self, "headers") and self.headers else None
        for k, v in get_cors_headers(req_origin).items():
            self.send_header(k, v)
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        if payload:
            self.wfile.write(payload)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    # Auto-reap child processes on POSIX systems if supported
    if hasattr(signal, "SIGCHLD") and hasattr(signal, "SIG_IGN"):
        try:
            signal.signal(signal.SIGCHLD, signal.SIG_IGN)
        except (ValueError, OSError):
            pass

    host = os.environ.get("API_HOST", "127.0.0.1").strip()
    try:
        port = int(os.environ.get("API_PORT", "5000").strip())
    except ValueError:
        port = 5000

    server = ThreadingHTTPServer((host, port), SwitchAPIHandler)
    server.daemon_threads = True
    print(f"[{utcnow()}] ArtCraft Switch API v2.0 listening on {host}:{port}  (TARGET_DIR={TARGET_DIR})", flush=True)
    if is_auth_required():
        print(f"[{utcnow()}] [AUTH] Admin password protection: ENABLED (HttpOnly session cookies & rate-limiting active)", flush=True)
    else:
        print(f"[{utcnow()}] [AUTH] WARNING: ADMIN_PASSWORD is not set. API and UI are in OPEN ACCESS mode.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"[{utcnow()}] Shutting down.", flush=True)
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
