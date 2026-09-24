import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const FLAGS_DIR = path.join(repoRoot, 'public', 'vendor', 'flags', '24x18');

const isPng = (filePath) => {
  const header = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, header, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
};

test('node group flags are vendored locally (no flag CDN)', () => {
  const source = read('public/lib/node-groups-render.js');
  assert.ok(!source.includes('flagcdn.com'), 'group flags must not load from flagcdn.com');
  assert.ok(!source.includes('src="http'), 'group flag <img> must not use a remote URL');
  assert.ok(
    source.includes('/vendor/flags/24x18/'),
    'group flag <img> must reference the vendored flags'
  );
});

test('vendored flag images exist and are valid PNGs', () => {
  assert.ok(fs.existsSync(FLAGS_DIR), 'vendored flags directory is missing');
  const files = fs.readdirSync(FLAGS_DIR).filter((file) => file.endsWith('.png'));
  assert.ok(files.length >= 240, `expected at least 240 flag images, found ${files.length}`);

  // Spot-check the countries visible in real user screenshots plus common ones.
  for (const code of ['au', 'cr', 'cy', 'de', 'fr', 'us', 'jp', 'sg', 'hk', 'gb']) {
    assert.ok(
      files.includes(`${code}.png`),
      `missing vendored flag for country code: ${code}`
    );
  }

  const invalid = files.filter((file) => {
    const full = path.join(FLAGS_DIR, file);
    return !isPng(full) || fs.statSync(full).size < 100;
  });
  assert.deepEqual(invalid, [], `invalid vendored flag images: ${invalid.slice(0, 10).join(', ')}`);
});

test('vendored flags need no CSP exception (served from self)', () => {
  const serverSource = read('app/server/createServer.js');
  assert.ok(
    !serverSource.includes('flagcdn.com'),
    'CSP must not need a flagcdn.com exception once flags are vendored'
  );
});
