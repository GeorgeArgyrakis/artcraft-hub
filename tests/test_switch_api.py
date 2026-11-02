#!/usr/bin/env python3
"""
test_switch_api.py — Comprehensive unit tests for ArtCraft Switch API.
Covers version switching, semver sorting, pinned apps, path traversal security, and manifest aggregation.
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
        self.orig_pinned_file = switch_api.PINNED_FILE
        self.orig_status_file = switch_api.STATUS_FILE

        switch_api.TARGET_DIR = self.test_dir
        switch_api.PINNED_FILE = Path(self.test_dir) / "pinned.json"
        switch_api.STATUS_FILE = Path(self.test_dir) / ".sync_status.json"

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
        switch_api.PINNED_FILE = self.orig_pinned_file
        switch_api.STATUS_FILE = self.orig_status_file
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

    def test_pinned_apps(self):
        # Initial empty
        self.assertEqual(switch_api.get_pinned(), [])

        # Set valid pinned
        switch_api.set_pinned(["photocraft", "cadcraft"])
        self.assertEqual(switch_api.get_pinned(), ["photocraft", "cadcraft"])

        # Filter malicious values
        switch_api.set_pinned(["photocraft", "../escape", "bad;rm", 123])
        self.assertEqual(switch_api.get_pinned(), ["photocraft", "123"])

    def test_get_manifest(self):
        manifest = switch_api.get_manifest()
        self.assertIn("apps", manifest)
        self.assertIn("system", manifest)
        self.assertIn("pinned", manifest)
        self.assertIn("catalog", manifest)

        apps = manifest["apps"]
        self.assertEqual(len(apps), 1)
        self.assertEqual(apps[0]["app"], "photocraft")
        self.assertEqual(len(apps[0]["releases"]), 2)
        # Ensure newest first
        self.assertEqual(apps[0]["releases"][0]["tag"], "v0.2.0")


if __name__ == "__main__":
    unittest.main()
