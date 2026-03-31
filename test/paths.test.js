import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';

import { resolveDefaultRuntimeRoot, resolveProjectPaths } from '../app/shared/paths.js';

test('resolveProjectPaths separates asset root from runtime root', () => {
  const assetRoot = path.join(os.tmpdir(), 'leme-hub-assets');
  const runtimeRoot = path.join(os.tmpdir(), 'leme-hub-runtime');
  const paths = resolveProjectPaths(assetRoot, { runtimeRoot });

  assert.equal(paths.root, path.resolve(assetRoot));
  assert.equal(paths.runtimeRoot, path.resolve(runtimeRoot));
  assert.equal(paths.publicDir, path.join(path.resolve(assetRoot), 'public'));
  assert.equal(paths.dataDir, path.join(path.resolve(runtimeRoot), 'data'));
  assert.equal(paths.geoDir, path.join(path.resolve(runtimeRoot), 'geo'));
  assert.equal(paths.geoIpDbPath, path.join(path.resolve(runtimeRoot), 'geo', 'GeoLite2-Country.mmdb'));
});

test('resolveDefaultRuntimeRoot prefers explicit runtime root env', () => {
  const runtimeRoot = resolveDefaultRuntimeRoot('E:/repo/leme-hub', { LEME_RUNTIME_ROOT: 'E:/custom/runtime' });

  assert.equal(runtimeRoot, path.resolve('E:/custom/runtime'));
});
