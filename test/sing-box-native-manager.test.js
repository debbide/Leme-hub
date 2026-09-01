import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { SingBoxNativeManager } from '../app/proxy/SingBoxNativeManager.js';
import { resolveProjectPaths } from '../app/shared/paths.js';

const createProjectRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-native-'));

test('resolves supported native asset and versioned install path', () => {
  const paths = resolveProjectPaths(createProjectRoot());
  const manager = new SingBoxNativeManager(paths, {
    arch: 'x64',
    fetch: async () => { throw new Error('fetch should not be called'); },
    platform: 'win32',
    runtimeVersion: '1.14.0-r4'
  });

  assert.equal(manager.getAssetName(), 'leme-singbox-win32-x64.dll');
  assert.equal(manager.getManagedLibraryPath().endsWith(path.join('native', '1.14.0-r4', 'win32-x64', 'leme-singbox.dll')), true);
});

test('rejects unsupported native platforms', () => {
  const paths = resolveProjectPaths(createProjectRoot());
  const manager = new SingBoxNativeManager(paths, {
    arch: 'ia32',
    fetch: async () => {},
    platform: 'win32'
  });

  assert.throws(() => manager.getAssetName(), /Unsupported native sing-box platform/);
});

test('extracts a bundled native library when the writable managed copy is missing', () => {
  const paths = resolveProjectPaths(createProjectRoot());
  const originalResourcesPath = process.resourcesPath;
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-resources-'));
  const bundledPath = path.join(resourcesPath, 'native', '1.14.0-r4', 'win32-x64', 'leme-singbox.dll');
  fs.mkdirSync(path.dirname(bundledPath), { recursive: true });
  fs.writeFileSync(bundledPath, 'native-library');
  fs.writeFileSync(path.join(resourcesPath, 'native', 'manifest.json'), JSON.stringify({
    runtimeVersion: '1.14.0-r4'
  }));

  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: resourcesPath });
  try {
    const manager = new SingBoxNativeManager(paths, {
      arch: 'x64',
      fetch: async () => { throw new Error('fetch should not be called'); },
      platform: 'win32',
      runtimeVersion: '1.14.0-r4'
    });
    const status = manager.getStatus();
    assert.equal(status.libraryPath, manager.getManagedLibraryPath());
    assert.equal(fs.readFileSync(status.libraryPath, 'utf8'), 'native-library');
    assert.equal(status.source, 'embedded-native');
    assert.equal(status.ready, true);
  } finally {
    Object.defineProperty(process, 'resourcesPath', { configurable: true, value: originalResourcesPath });
  }
});

test('does not download a native library at runtime when embedded assets are missing', async () => {
  const paths = resolveProjectPaths(createProjectRoot());
  let fetched = false;
  const manager = new SingBoxNativeManager(paths, {
    arch: 'x64',
    platform: 'win32',
    fetch: async () => {
      fetched = true;
      throw new Error('network should not be used');
    }
  });

  await assert.rejects(() => manager.ensureAvailable(), /missing from this build/);
  assert.equal(fetched, false);
});
