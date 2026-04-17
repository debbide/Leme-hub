import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ConfigStore } from '../app/server/services/ConfigStore.js';

const createPaths = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-config-store-'));
  const dataDir = path.join(root, 'data');
  const binDir = path.join(root, 'bin');
  const logsDir = path.join(root, 'logs');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  return {
    root,
    dataDir,
    binDir,
    settingsPath: path.join(dataDir, 'settings.json'),
    nodesPath: path.join(dataDir, 'proxy_nodes.json'),
    logPath: path.join(logsDir, 'singbox.log'),
    configPath: path.join(dataDir, 'singbox_config.json')
  };
};

test('migrates legacy system proxy default ports to new reserved ports', () => {
  const paths = createPaths();
  fs.writeFileSync(paths.settingsPath, JSON.stringify({
    systemProxySocksPort: 20100,
    systemProxyHttpPort: 20101
  }, null, 2));
  fs.writeFileSync(paths.nodesPath, '[]');
  fs.writeFileSync(paths.logPath, '');
  fs.writeFileSync(paths.configPath, 'null');

  const store = new ConfigStore(paths);
  const settings = store.getSettings();

  assert.equal(settings.systemProxySocksPort, 18998);
  assert.equal(settings.systemProxyHttpPort, 18999);
});

test('preserves custom system proxy ports during normalization', () => {
  const paths = createPaths();
  fs.writeFileSync(paths.settingsPath, JSON.stringify({
    systemProxySocksPort: 25000,
    systemProxyHttpPort: 25001
  }, null, 2));
  fs.writeFileSync(paths.nodesPath, '[]');
  fs.writeFileSync(paths.logPath, '');
  fs.writeFileSync(paths.configPath, 'null');

  const store = new ConfigStore(paths);
  const settings = store.getSettings();

  assert.equal(settings.systemProxySocksPort, 25000);
  assert.equal(settings.systemProxyHttpPort, 25001);
});

test('server mode defaults proxy listener to all interfaces without system proxy capture', () => {
  const paths = createPaths();

  const store = new ConfigStore(paths, { mode: 'server' });
  const settings = store.getSettings();

  assert.equal(settings.proxyListenHost, '0.0.0.0');
  assert.equal(settings.tlsFragmentEnabled, true);
  assert.equal(settings.systemProxyEnabled, false);
  assert.equal(settings.systemProxyCaptureEnabled, false);
});

test('desktop mode migrates legacy unified proxy preference into system proxy capture', () => {
  const paths = createPaths();
  fs.writeFileSync(paths.settingsPath, JSON.stringify({
    systemProxyEnabled: true
  }, null, 2));
  fs.writeFileSync(paths.nodesPath, '[]');
  fs.writeFileSync(paths.logPath, '');
  fs.writeFileSync(paths.configPath, 'null');

  const store = new ConfigStore(paths, { mode: 'desktop' });
  const settings = store.getSettings();

  assert.equal(settings.tlsFragmentEnabled, true);
  assert.equal(settings.systemProxyEnabled, true);
  assert.equal(settings.systemProxyCaptureEnabled, true);
});

test('initializes system proxy auto switch settings with sane defaults', () => {
  const paths = createPaths();

  const store = new ConfigStore(paths, { mode: 'desktop' });
  const settings = store.getSettings();

  assert.equal(settings.systemProxyAutoSwitchEnabled, false);
  assert.equal(settings.systemProxyAutoSwitchGroupId, null);
  assert.equal(settings.systemProxyAutoSwitchIntervalSec, 600);
  assert.equal(settings.systemProxyAutoSwitchLastAt, null);
  assert.equal(settings.speedtestUrl, 'https://www.google.com/generate_204');
});
