import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const VENDOR_DIR = path.join(repoRoot, 'public', 'vendor', 'phosphor');

test('dashboard icons are vendored locally (no icon CDN)', () => {
  const html = read('public/index.html');
  assert.doesNotMatch(html, /unpkg\.com/u, 'index.html must not load icons from unpkg');
  assert.match(html, /\/vendor\/phosphor\/phosphor\.css/u, 'index.html must reference the vendored phosphor stylesheet');
});

test('vendored phosphor assets exist with license', () => {
  for (const file of ['phosphor.css', 'Phosphor.woff2', 'Phosphor.woff', 'LICENSE']) {
    assert.ok(fs.existsSync(path.join(VENDOR_DIR, file)), `missing vendored file: ${file}`);
  }
  assert.ok(
    fs.statSync(path.join(VENDOR_DIR, 'Phosphor.woff2')).size > 10000,
    'vendored woff2 looks truncated'
  );
});

const collectIconNames = (source) => {
  const names = new Set();
  for (const match of source.matchAll(/\bph-(?!ph\b)([a-z-]+)/gu)) {
    names.add(`ph-${match[1]}`);
  }
  return names;
};

test('every icon used by the dashboard exists in the vendored stylesheet', () => {
  const css = read('public/vendor/phosphor/phosphor.css');
  const used = new Set([
    ...collectIconNames(read('public/index.html')),
    ...collectIconNames(read('public/app.js'))
  ]);
  assert.ok(used.size > 0, 'expected to find phosphor icon usages');
  const missing = [...used].filter((name) => !css.includes(`.${name}:before`));
  assert.deepEqual(missing, [], `icons missing from vendored css: ${missing.join(', ')}`);
});

test('vendored icon stylesheet references only local font files', () => {
  const css = read('public/vendor/phosphor/phosphor.css');
  const urls = [...css.matchAll(/url\(([^)]+)\)/gu)].map((m) => m[1].replace(/["']/gu, ''));
  assert.ok(urls.length > 0, 'expected @font-face url() references');
  for (const url of urls) {
    assert.doesNotMatch(url, /^https?:\/\//u, `font url must be local: ${url}`);
    assert.ok(
      fs.existsSync(path.join(VENDOR_DIR, url)),
      `referenced font file missing: ${url}`
    );
  }
});

test('CSP no longer allowlists the icon CDN', () => {
  const serverSource = read('app/server/createServer.js');
  assert.doesNotMatch(serverSource, /https:\/\/unpkg\.com/u, 'CSP must not allowlist unpkg.com anymore');
  assert.match(serverSource, /\/vendor\/phosphor/u, 'CSP comment should mention the vendored icons');
});
