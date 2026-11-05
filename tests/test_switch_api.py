#!/usr/bin/env python3
"""
test_switch_api.py — Comprehensive unit tests for ArtCraft Switch API.
Covers version switching, semver sorting, admin password protection, path traversal security, and manifest aggregation.
"""

import io
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

# Add project root to path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import switch_api


class TestSemverSorting(unittest.TestCase):
    """Test semver-aware release sorting."""

    def test_numeric_sorting(self):
        releases = [
            {"tag": "v0.2.9"},
            {"tag": "v0.2.10"},
            {"tag": "v0.1.0"},
            {"tag": "v0.17.0"},
            {"tag": "v1.0.0"},
        ]
        sorted_rels = switch_api.sorted_releases_newest_first(releases)
        tags = [r["tag"] for r in sorted_rels]
        self.assertEqual(tags, ["v1.0.0", "v0.17.0", "v0.2.10", "v0.2.9", "v0.1.0"])

    def test_without_v_prefix(self):
        releases = [{"tag": "1.2.3"}, {"tag": "1.10.0"}, {"tag": "2.0.0"}]
        sorted_rels = switch_api.sorted_releases_newest_first(releases)
        tags = [r["tag"] for r in sorted_rels]
        self.assertEqual(tags, ["2.0.0", "1.10.0", "1.2.3"])

    def test_empty_and_single(self):
        self.assertEqual(switch_api.sorted_releases_newest_first([]), [])
        self.assertEqual(
            switch_api.sorted_releases_newest_first([{"tag": "v1.0.0"}]),
            [{"tag": "v1.0.0"}],
        )


class TestSecurityValidation(unittest.TestCase):
    """Test validation and path traversal defenses."""

    def test_app_name_regex(self):
        valid = ["photocraft", "cadcraft", "craft-anything", "app_1", "App-2"]
        for name in valid:
            self.assertTrue(switch_api.APP_NAME_RE.fullmatch(name), f"Should be valid: {name}")

        invalid = ["../photocraft", "app/sub", "app;rm", "..", "app name", "app$"]
        for name in invalid:
            self.assertFalse(switch_api.APP_NAME_RE.fullmatch(name), f"Should be invalid: {name}")

    def test_tag_name_regex(self):
        valid = ["v1.0.0", "1.0", "beta.1", "v0.17.0-rc1", "build-123"]
        for tag in valid:
            self.assertTrue(switch_api.TAG_NAME_RE.fullmatch(tag), f"Should be valid: {tag}")

        invalid = ["../v1.0", "tag/bad", "tag;rm", "..", "tag name", "tag$"]
        for tag in invalid:
            self.assertFalse(switch_api.TAG_NAME_RE.fullmatch(tag), f"Should be invalid: {tag}")


class TestSwitchVersionWorkflow(unittest.TestCase):
    """Test atomic version switching and manifest generation on filesystem."""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="artcraft_test_")
        self.orig_target_dir = switch_api.TARGET_DIR
        self.orig_status_file = switch_api.STATUS_FILE
        self.orig_catalog_file = switch_api.CATALOG_FILE
        self.orig_local_catalog = switch_api.LOCAL_CATALOG_FILE

        switch_api.TARGET_DIR = self.test_dir
        switch_api.STATUS_FILE = Path(self.test_dir) / ".sync_status.json"
        self.catalog_file = Path(self.test_dir) / "catalog.json"
        switch_api.write_json(self.catalog_file, {})
        switch_api.CATALOG_FILE = self.catalog_file
        switch_api.LOCAL_CATALOG_FILE = self.catalog_file

        # Create mock app
        self.app_dir = Path(self.test_dir) / "photocraft"
        self.releases_dir = self.app_dir / "releases"
        self.releases_dir.mkdir(parents=True, exist_ok=True)

        (self.releases_dir / "v0.1.0").mkdir()
        (self.releases_dir / "v0.2.0").mkdir()

        # Seed initial versions.json
        switch_api.write_json(
            self.app_dir / "versions.json",
            {
                "app": "photocraft",
                "active": "v0.1.0",
                "releases": [
                    {"tag": "v0.2.0", "downloaded_at": "2026-11-01T12:00:00Z"},
                    {"tag": "v0.1.0", "downloaded_at": "2026-10-01T12:00:00Z"},
                ],
            },
        )

    def tearDown(self):
        switch_api.TARGET_DIR = self.orig_target_dir
        switch_api.STATUS_FILE = self.orig_status_file
        switch_api.CATALOG_FILE = self.orig_catalog_file
        switch_api.LOCAL_CATALOG_FILE = self.orig_local_catalog
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_switch_version_success(self):
        resp, code = switch_api.switch_version("photocraft", "v0.2.0")
        self.assertEqual(code, 200)
        self.assertTrue(resp.get("ok"))
        self.assertEqual(resp.get("active"), "v0.2.0")

        # Verify active.txt
        active_txt = (self.app_dir / "active.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(active_txt, "v0.2.0")

        # Verify symlink
        current_link = self.app_dir / "current"
        self.assertTrue(current_link.is_symlink())
        self.assertEqual(os.readlink(current_link), "releases/v0.2.0")

        # Verify versions.json
        versions = switch_api.read_json(self.app_dir / "versions.json")
        self.assertEqual(versions["active"], "v0.2.0")

    def test_switch_version_not_found(self):
        resp, code = switch_api.switch_version("photocraft", "v9.9.9")
        self.assertEqual(code, 404)
        self.assertFalse(resp.get("ok"))

    def test_switch_version_path_traversal(self):
        resp, code = switch_api.switch_version("..", "v0.1.0")
        self.assertEqual(code, 400)
        self.assertFalse(resp.get("ok"))

        resp, code = switch_api.switch_version("photocraft", "../v0.1.0")
        self.assertEqual(code, 400)
        self.assertFalse(resp.get("ok"))

        resp, code = switch_api.switch_version("photocraft", "..")
        self.assertEqual(code, 400)
        self.assertFalse(resp.get("ok"))

    def test_get_versions(self):
        data = switch_api.get_versions("photocraft")
        self.assertIsNotNone(data)
        self.assertEqual(data["app"], "photocraft")

        self.assertIsNone(switch_api.get_versions("nonexistent"))
        self.assertIsNone(switch_api.get_versions("../photocraft"))

    def test_get_manifest(self):
        manifest = switch_api.get_manifest()
        self.assertIn("apps", manifest)
        self.assertIn("system", manifest)
        self.assertIn("catalog", manifest)
        self.assertIn("auth_required", manifest)

        apps = manifest["apps"]
        self.assertEqual(len(apps), 1)
        self.assertEqual(apps[0]["app"], "photocraft")
        self.assertIn("icon", apps[0])
        self.assertIn("preview", apps[0])
        self.assertEqual(len(apps[0]["releases"]), 2)
        # Ensure newest first
        self.assertEqual(apps[0]["releases"][0]["tag"], "v0.2.0")

    def test_resolve_app_icon_and_preview(self):
        icons_dir = Path(self.test_dir) / "icons"
        previews_dir = Path(self.test_dir) / "previews"
        icons_dir.mkdir(parents=True, exist_ok=True)
        previews_dir.mkdir(parents=True, exist_ok=True)

        # WebP icon takes priority
        (icons_dir / "photocraft.webp").write_bytes(b"webp-data")
        (icons_dir / "photocraft.svg").write_text("<svg></svg>")
        self.assertEqual(switch_api.resolve_app_icon("photocraft"), "/icons/photocraft.webp")

        # SVG icon when webp is absent
        (icons_dir / "texturecraft.svg").write_text("<svg></svg>")
        self.assertEqual(switch_api.resolve_app_icon("texturecraft"), "/icons/texturecraft.svg")

        # None when no icon exists
        self.assertIsNone(switch_api.resolve_app_icon("solidcraft"))

        # Preview resolution
        (previews_dir / "photocraft.webp").write_bytes(b"preview-data")
        self.assertEqual(switch_api.resolve_app_preview("photocraft"), "/previews/photocraft.webp")
        self.assertIsNone(switch_api.resolve_app_preview("solidcraft"))

        # Path traversal / invalid names
        self.assertIsNone(switch_api.resolve_app_icon("../photocraft"))
        self.assertIsNone(switch_api.resolve_app_preview("../photocraft"))

    def test_get_catalog_structure(self):
        catalog = switch_api.get_catalog()
        self.assertIsInstance(catalog, dict)
        if catalog:
            for app, meta in catalog.items():
                self.assertIn("category", meta)
                self.assertIn("categoryTag", meta)


class TestCatalogManagement(unittest.TestCase):
    """Test dynamic catalog additions, visibility toggling, and data purging."""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="artcraft_cat_test_")
        self.orig_target_dir = switch_api.TARGET_DIR
        self.orig_catalog_file = switch_api.CATALOG_FILE
        self.orig_local_catalog = switch_api.LOCAL_CATALOG_FILE

        switch_api.TARGET_DIR = self.test_dir
        self.catalog_file = Path(self.test_dir) / "catalog.json"
        switch_api.CATALOG_FILE = self.catalog_file
        switch_api.LOCAL_CATALOG_FILE = self.catalog_file

        # Seed initial catalog
        switch_api.write_json(
            self.catalog_file,
            {
                "photocraft": {
                    "repo": "storytold/photocraft",
                    "num": "01",
                    "title": "PhotoCraft",
                    "category": "Graphics & Photo",
                    "categoryTag": "IMAGE EDITOR",
                    "accentColor": "#2563eb",
                    "tagline": "Photo editor",
                    "desc": "An image editor.",
                    "visible": True,
                }
            },
        )

    def tearDown(self):
        switch_api.TARGET_DIR = self.orig_target_dir
        switch_api.CATALOG_FILE = self.orig_catalog_file
        switch_api.LOCAL_CATALOG_FILE = self.orig_local_catalog
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_add_catalog_app(self):
        meta = {
            "repo": "myorg/coolcraft",
            "title": "CoolCraft",
            "category": "3D & CAD",
            "categoryTag": "3D STUDIO",
            "accentColor": "#14b8a6",
            "tagline": "Procedural 3D",
            "desc": "A great 3D modeler.",
            "visible": True,
        }
        res, code = switch_api.add_or_update_catalog_app("coolcraft", meta)
        self.assertEqual(code, 200)
        self.assertTrue(res["ok"])
        self.assertEqual(res["app"], "coolcraft")

        # Verify saved in catalog
        catalog = switch_api.get_catalog()
        self.assertIn("coolcraft", catalog)
        self.assertEqual(catalog["coolcraft"]["title"], "CoolCraft")
        self.assertTrue(catalog["coolcraft"]["visible"])

    def test_add_catalog_app_validation(self):
        # Invalid app key
        res, code = switch_api.add_or_update_catalog_app("../badapp", {"repo": "org/repo"})
        self.assertEqual(code, 400)

        # Invalid repo
        res, code = switch_api.add_or_update_catalog_app("goodapp", {"repo": "not-a-repo"})
        self.assertEqual(code, 400)

    def test_set_app_visibility(self):
        # Toggle to false
        res, code = switch_api.set_app_visibility("photocraft", False)
        self.assertEqual(code, 200)
        self.assertFalse(res["visible"])

        catalog = switch_api.get_catalog()
        self.assertFalse(catalog["photocraft"]["visible"])

        # Toggle back to true
        res, code = switch_api.set_app_visibility("photocraft", True)
        self.assertEqual(code, 200)
        self.assertTrue(res["visible"])

        # Unknown app
        res, code = switch_api.set_app_visibility("nonexistent", True)
        self.assertEqual(code, 404)

    def test_delete_catalog_app_and_purge_data(self):
        # Create app data directory and icon
        app_dir = Path(self.test_dir) / "photocraft"
        app_dir.mkdir(parents=True, exist_ok=True)
        (app_dir / "testfile.txt").write_text("release data")

        icons_dir = Path(self.test_dir) / "icons"
        icons_dir.mkdir(parents=True, exist_ok=True)
        icon_file = icons_dir / "photocraft.svg"
        icon_file.write_text("<svg></svg>")

        # Call delete
        res, code = switch_api.delete_catalog_app("photocraft")
        self.assertEqual(code, 200)
        self.assertTrue(res["ok"])

        # Verify removed from catalog
        catalog = switch_api.get_catalog()
        self.assertNotIn("photocraft", catalog)

        # Verify filesystem directory was purged
        self.assertFalse(app_dir.exists())
        self.assertFalse(icon_file.exists())


class TestAdminPasswordProtection(unittest.TestCase):
    """Test optional ADMIN_PASSWORD authentication, verification, and timing attack protection."""

    def setUp(self):
        self.orig_env_pw = os.environ.get("ADMIN_PASSWORD")
        if "ADMIN_PASSWORD" in os.environ:
            del os.environ["ADMIN_PASSWORD"]

    def tearDown(self):
        if self.orig_env_pw is not None:
            os.environ["ADMIN_PASSWORD"] = self.orig_env_pw
        elif "ADMIN_PASSWORD" in os.environ:
            del os.environ["ADMIN_PASSWORD"]

    def test_auth_disabled_by_default(self):
        os.environ["ADMIN_PASSWORD"] = ""
        self.assertFalse(switch_api.is_auth_required())
        self.assertTrue(switch_api.verify_admin_request({}))
        self.assertTrue(switch_api.verify_admin_request({"X-Admin-Password": ""}))
        self.assertTrue(switch_api.verify_admin_request({"X-Admin-Password": "anything"}))

    def test_auth_enabled_verification(self):
        os.environ["ADMIN_PASSWORD"] = "secret123"
        self.assertTrue(switch_api.is_auth_required())

        # Correct password via X-Admin-Password
        self.assertTrue(switch_api.verify_admin_request({"X-Admin-Password": "secret123"}))

        # Correct password via Authorization: Bearer
        self.assertTrue(switch_api.verify_admin_request({"Authorization": "Bearer secret123"}))

        # Missing or wrong password (mock sleep to avoid slowing down tests)
        orig_sleep = switch_api.time.sleep
        slept = []
        switch_api.time.sleep = lambda s: slept.append(s)
        try:
            self.assertFalse(switch_api.verify_admin_request({}))
            self.assertEqual(len(slept), 1)
            self.assertEqual(slept[0], 1)

            self.assertFalse(switch_api.verify_admin_request({"X-Admin-Password": "wrong"}))
            self.assertEqual(len(slept), 2)
        finally:
            switch_api.time.sleep = orig_sleep


if __name__ == "__main__":
    unittest.main()
