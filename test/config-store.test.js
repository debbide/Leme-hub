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

test('normalizes persisted group sort order ids', () => {
  const paths = createPaths();
  fs.writeFileSync(paths.settingsPath, JSON.stringify({
    groupSortOrder: ['g2', '', 'g1', 'g2', null]
  }, null, 2));
  fs.writeFileSync(paths.nodesPath, '[]');
  fs.writeFileSync(paths.logPath, '');
  fs.writeFileSync(paths.configPath, 'null');

  const store = new ConfigStore(paths, { mode: 'desktop' });
  const settings = store.getSettings();

  assert.deepEqual(settings.groupSortOrder, ['g2', 'g1']);
});

test('backs up settings before saving', () => {
  const paths = createPaths();
  const store = new ConfigStore(paths, { mode: 'desktop' });

  store.saveSettings({ ...store.getSettings(), routingMode: 'global' });
  store.saveSettings({ ...store.getSettings(), routingMode: 'direct' });

  const newestBackup = JSON.parse(fs.readFileSync(`${paths.settingsPath}.bak.1`, 'utf8'));
  const olderBackup = JSON.parse(fs.readFileSync(`${paths.settingsPath}.bak.2`, 'utf8'));

  assert.equal(newestBackup.routingMode, 'global');
  assert.equal(olderBackup.routingMode, 'rule');
  assert.equal(store.getSettings().routingMode, 'direct');
});

test('can save maintenance settings without rotating backups', () => {
  const paths = createPaths();
  const store = new ConfigStore(paths, { mode: 'desktop' });

  store.saveSettings({ ...store.getSettings(), routingMode: 'global' });
  store.saveSettings({ ...store.getSettings(), routingMode: 'direct' }, { backup: false });

  const newestBackup = JSON.parse(fs.readFileSync(`${paths.settingsPath}.bak.1`, 'utf8'));

  assert.equal(newestBackup.routingMode, 'rule');
  assert.equal(fs.existsSync(`${paths.settingsPath}.bak.2`), false);
  assert.equal(store.getSettings().routingMode, 'direct');
});

test('preserves routing settings when a partial save carries empty routing fields', () => {
  const paths = createPaths();
  const store = new ConfigStore(paths, { mode: 'desktop' });

  store.saveSettings({
    ...store.getSettings(),
    routingItems: [{ id: 'rule-1', kind: 'rule', type: 'domain_suffix', value: 'corp.local', action: 'direct', note: '' }],
    customRules: [{ id: 'rule-1', type: 'domain_suffix', value: 'corp.local', action: 'direct', note: '' }],
    rulesets: []
  });
  store.saveSettings({
    nodeGroupLatencyCache: { updatedAt: '2026-06-11T00:00:00.000Z', results: {} },
    routingItems: [],
    customRules: [],
    rulesets: []
  }, { backup: false });

  const settings = store.getSettings();
  assert.equal(settings.routingItems.length, 1);
  assert.equal(settings.customRules.length, 1);
  assert.equal(settings.customRules[0].value, 'corp.local');
});

test('allows explicit routing clears through save options', () => {
  const paths = createPaths();
  const store = new ConfigStore(paths, { mode: 'desktop' });

  store.saveSettings({
    ...store.getSettings(),
    routingItems: [{ id: 'rule-1', kind: 'rule', type: 'domain_suffix', value: 'corp.local', action: 'direct', note: '' }],
    customRules: [{ id: 'rule-1', type: 'domain_suffix', value: 'corp.local', action: 'direct', note: '' }],
    rulesets: []
  });
  store.saveSettings({
    ...store.getSettings(),
    routingItems: [],
    customRules: [],
    rulesets: []
  }, { allowEmptyRoutingClear: true });

  const settings = store.getSettings();
  assert.equal(settings.routingItems.length, 0);
  assert.equal(settings.customRules.length, 0);
  assert.equal(settings.rulesets.length, 0);
});

test('defaults tun settings to disabled capture-safe values', () => {
  const paths = createPaths();
  const store = new ConfigStore(paths, { mode: 'desktop' });
  const settings = store.getSettings();

  assert.equal(settings.tunEnabled, false);
  assert.equal(settings.tunCaptureEnabled, false);
  assert.equal(settings.tunStack, 'system');
  assert.equal(settings.tunStrictRoute, true);
  assert.equal(settings.tunInterfaceName, 'leme-tun');
  assert.deepEqual(settings.tunAddress, ['172.19.0.1/30']);
  assert.equal(settings.tunMtu, 1500);
});

test('normalizing tun enabled clears system proxy capture preference conflict', () => {
  const paths = createPaths();
  fs.writeFileSync(paths.settingsPath, JSON.stringify({
    systemProxyEnabled: true,
    systemProxyCaptureEnabled: true,
    tunEnabled: true
  }, null, 2));
  fs.writeFileSync(paths.nodesPath, '[]');
  fs.writeFileSync(paths.logPath, '');
  fs.writeFileSync(paths.configPath, 'null');

  const store = new ConfigStore(paths, { mode: 'desktop' });
  const settings = store.getSettings();

  assert.equal(settings.tunEnabled, true);
  assert.equal(settings.systemProxyCaptureEnabled, false);
});
