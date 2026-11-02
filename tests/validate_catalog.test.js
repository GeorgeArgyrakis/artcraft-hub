/**
 * validate_catalog.test.js
 * Automated validation test suite for ArtCraft Hub manifests and assets.
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT_DIR = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT_DIR, 'config', 'catalog.json');
const APPS_CONF_PATH = path.join(ROOT_DIR, 'config', 'apps.conf');
const ICONS_DIR = path.join(ROOT_DIR, 'icons');
const PREVIEWS_DIR = path.join(ROOT_DIR, 'previews');

test('catalog.json syntax and schema validation', (t) => {
  assert.ok(fs.existsSync(CATALOG_PATH), 'catalog.json must exist');
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  let catalog;
  assert.doesNotThrow(() => {
    catalog = JSON.parse(raw);
  }, 'catalog.json must be valid JSON');

  assert.ok(catalog && typeof catalog === 'object', 'catalog must be an object');
  const keys = Object.keys(catalog);
  assert.ok(keys.length > 0, 'catalog must contain applications');

  const requiredFields = ['repo', 'title', 'category', 'categoryTag', 'accentColor', 'tagline', 'desc'];
  const validCategories = new Set(['graphics', 'vector', 'documents', 'audio', 'cad']);
  const hexColorRe = /^#[0-9a-fA-F]{6}$/;

  for (const key of keys) {
    const item = catalog[key];
    t.diagnostic(`Validating catalog app: ${key}`);

    for (const field of requiredFields) {
      assert.ok(item[field] && typeof item[field] === 'string', `${key} must have string field '${field}'`);
    }

    assert.ok(validCategories.has(item.category), `${key} has unknown category '${item.category}'`);
    assert.match(item.accentColor, hexColorRe, `${key} accentColor must be #RRGGBB format`);
    assert.match(item.repo, /^[\w.-]+\/[\w.-]+$/, `${key} repo must be org/repo format`);
  }
});

test('apps.conf and catalog.json synchronization', () => {
  assert.ok(fs.existsSync(APPS_CONF_PATH), 'apps.conf must exist');
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

  const confLines = fs.readFileSync(APPS_CONF_PATH, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  assert.ok(confLines.length > 0, 'apps.conf must contain applications');

  for (const repo of confLines) {
    const appName = repo.split('/')[1];
    assert.ok(
      catalog[appName] || catalog[appName.replace(/-/g, '')],
      `App '${repo}' from apps.conf should exist in catalog.json`
    );
  }
});

test('bundled static assets exist for catalog apps', () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const appKeys = Object.keys(catalog);

  for (const key of appKeys) {
    const iconWebp = path.join(ICONS_DIR, `${key}.webp`);
    const iconSvg = path.join(ICONS_DIR, `${key}.svg`);
    const hasIcon = fs.existsSync(iconWebp) || fs.existsSync(iconSvg);
    assert.ok(hasIcon, `App '${key}' must have an icon in icons/ directory (.webp or .svg)`);

    const previewWebp = path.join(PREVIEWS_DIR, `${key}.webp`);
    assert.ok(fs.existsSync(previewWebp), `App '${key}' must have a preview image in previews/${key}.webp`);
  }
});
