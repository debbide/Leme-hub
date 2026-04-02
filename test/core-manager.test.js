import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { CoreManager } from '../app/server/services/CoreManager.js';

const createStore = (initialNodes = [{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]) => {
  let nodes = [...initialNodes];
  const settings = {
    proxyListenHost: '127.0.0.1',
    proxyBasePort: 20000,
    systemProxyEnabled: false,
    systemProxySocksPort: 20100,
    systemProxyHttpPort: 20101,
    activeNodeId: null,
    routingMode: 'rule',
    subscriptions: [],
    singBoxBinaryPath: 'E:\\missing\\sing-box.exe'
  };

  return {
    appendLog() {},
    getNodes: () => nodes,
    getRecentLogs: () => [],
    getSettings: () => settings,
    saveNodes: (nextNodes) => {
      nodes = nextNodes;
      return nodes;
    },
    saveSettings: (nextSettings) => {
      Object.assign(settings, nextSettings);
      return settings;
    }
  };
};

const createPaths = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-core-manager-'));
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
    configPath: path.join(dataDir, 'singbox_config.json'),
    nodesPath: path.join(dataDir, 'proxy_nodes.json'),
    settingsPath: path.join(dataDir, 'settings.json'),
    logPath: path.join(logsDir, 'singbox.log')
  };
};

test('start bootstraps binary before starting proxy', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  const calls = [];

  manager.binaryManager = {
    ensureAvailable: async (configuredPath) => {
      calls.push(['ensureAvailable', configuredPath]);
      return { executablePath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe', source: 'managed', version: '1.13.4' };
    },
    getStatus: () => ({
      configuredPath: 'E:\\missing\\sing-box.exe',
      configuredExists: false,
      managedPath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe',
      managedExists: true,
      ready: true,
      source: 'managed'
    })
  };
  manager.proxyService = {
    proxyProcess: { once() {} },
    setNodes: (nodes) => calls.push(['setNodes', nodes.length]),
    start: async ({ binPath }) => {
      calls.push(['start', binPath]);
      return { configPath: createPaths().configPath, executablePath: binPath };
    },
    stop() {},
    getLocalPort: () => 20000,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const status = await manager.start();

  assert.deepEqual(calls.slice(0, 3).map(([name]) => name), ['ensureAvailable', 'setNodes', 'start']);
  assert.equal(status.binary.source, 'managed');
  assert.equal(status.binary.version, '1.13.4');
});

test('start surfaces binary bootstrap failures in core state', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  manager.binaryManager = {
    ensureAvailable: async () => {
      throw new Error('download failed');
    },
    getStatus: () => ({
      configuredPath: 'E:\\missing\\sing-box.exe',
      configuredExists: false,
      managedPath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe',
      managedExists: false,
      ready: false,
      source: 'missing'
    })
  };

  await assert.rejects(() => manager.start(), /download failed/);
  const status = manager.getStatus();
  assert.equal(status.status, 'error');
  assert.equal(status.binary.status, 'error');
  assert.equal(status.binary.lastError, 'download failed');
});

test('start keeps binary ready when runtime startup fails after bootstrap', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  manager.binaryManager = {
    ensureAvailable: async () => ({
      executablePath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe',
      source: 'managed',
      version: '1.13.4'
    }),
    getStatus: () => ({
      configuredPath: 'E:\\missing\\sing-box.exe',
      configuredExists: false,
      managedPath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe',
      managedExists: true,
      ready: true,
      source: 'managed'
    })
  };
  manager.proxyService = {
    setNodes() {},
    start: async () => {
      throw new Error('spawn failed');
    },
    stop() {},
    getLocalPort: () => 20000,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  await assert.rejects(() => manager.start(), /spawn failed/);
  const status = manager.getStatus();
  assert.equal(status.status, 'error');
  assert.equal(status.lastError, 'spawn failed');
  assert.equal(status.binary.status, 'ready');
  assert.equal(status.binary.lastError, null);
  assert.equal(status.binary.version, '1.13.4');
});

test('start rolls back proxy process when system proxy apply fails', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  const calls = [];

  manager.binaryManager = {
    ensureAvailable: async () => ({
      executablePath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe',
      source: 'managed',
      version: '1.13.4'
    }),
    getStatus: () => ({
      configuredPath: 'E:\\missing\\sing-box.exe',
      configuredExists: false,
      managedPath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe',
      managedExists: true,
      ready: true,
      source: 'managed'
    })
  };
  manager.updateSettings({ systemProxyEnabled: true });
  manager.proxyService = {
    proxyProcess: { once() {} },
    setNodes() {},
    start: async () => ({ configPath: createPaths().configPath, executablePath: 'E:\\repo\\local-proxy-client\\bin\\sing-box.exe' }),
    stop: () => calls.push('stop'),
    getLocalPort: () => 20000,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.systemProxyManager = {
    apply: async () => {
      throw new Error('apply failed');
    },
    getCapabilities: () => ({ supported: true, provider: 'mock' })
  };

  await assert.rejects(() => manager.start(), /apply failed/);
  assert.deepEqual(calls, ['stop']);
});

test('importProxyLink merges parsed nodes through CoreManager', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  manager.proxyService = {
    parseProxyLinks: () => ([{ type: 'socks', server: 'two.example', port: 1081 }]),
    parseProxyLink: () => ({ type: 'socks', server: 'two.example', port: 1081 }),
    setNodes() {},
    getLocalPort: (nodeId) => nodeId === 'n1' ? 20000 : 20001,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes.map((node) => ({ ...node, localPort: node.localPort ?? (node.id === 'n1' ? 20000 : 20001) })),
    getStatus: () => ({ ready: false, pending: false, lastError: null })
  };

  const result = await manager.importProxyLink('socks://demo');

  assert.equal(result.nodes.length, 2);
  assert.equal(result.node.server, 'two.example');
  assert.equal(result.node.localPort, 20001);
  assert.equal(result.restartRequired, false);
  assert.equal(result.importedCount, 1);
});

test('importProxyLink splits multi-line links and persists all parsed nodes through CoreManager', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  manager.proxyService = {
    parseProxyLinks: () => ([
      { type: 'socks', server: 'two.example', port: 1081 },
      { type: 'trojan', server: 'three.example', port: 443, password: 'secret', id: 'custom-id' }
    ]),
    setNodes() {},
    getLocalPort: (nodeId) => {
      if (nodeId === 'n1') return 20000;
      if (nodeId === 'custom-id') return 20002;
      return 20001;
    },
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes,
    getStatus: () => ({ ready: false, pending: false, lastError: null })
  };

  const result = await manager.importProxyLink('socks://demo\ntrojan://secret@example.com#trojan', 'Batch');

  assert.equal(result.importedCount, 2);
  assert.equal(result.nodes.some((node) => node.server === 'two.example'), true);
  assert.equal(result.nodes.some((node) => node.server === 'three.example'), true);
  assert.equal(result.nodes.filter((node) => node.group === 'Batch').length, 2);
  assert.equal(result.node.server, 'two.example');
});

test('importProxyLink decodes base64 manual payloads before parsing', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  const decodedLinks = 'trojan://secret@example.com#trojan\nss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388#ss';
  const encoded = Buffer.from(decodedLinks).toString('base64');
  let received = null;

  manager.proxyService = {
    normalizeManualImportContent: (input) => {
      assert.equal(input, encoded);
      return decodedLinks;
    },
    parseProxyLinks: (input) => {
      received = input;
      return [
        { type: 'trojan', server: 'two.example', port: 443, password: 'secret' },
        { type: 'shadowsocks', server: 'three.example', port: 8388, method: 'aes-256-gcm', password: 'secret', id: 'custom-id' }
      ];
    },
    setNodes() {},
    getLocalPort: (nodeId) => {
      if (nodeId === 'n1') return 20000;
      if (nodeId === 'custom-id') return 20002;
      return 20001;
    },
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes,
    getStatus: () => ({ ready: false, pending: false, lastError: null })
  };

  const result = await manager.importProxyLink(encoded, 'Batch');

  assert.equal(received, decodedLinks);
  assert.equal(result.importedCount, 2);
  assert.equal(result.nodes.some((node) => node.server === 'two.example'), true);
  assert.equal(result.nodes.some((node) => node.server === 'three.example'), true);
  assert.equal(result.nodes.filter((node) => node.group === 'Batch').length, 2);
});

test('syncSubscription decorates imported nodes and persists them through CoreManager', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  manager.proxyService = {
    syncSubscription: async () => ([{ type: 'socks', server: 'sub.example', port: 1082 }]),
    setNodes() {},
    getLocalPort: (nodeId) => nodeId === 'n1' ? 20000 : 20001,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes.map((node) => ({ ...node, localPort: node.localPort ?? (node.id === 'n1' ? 20000 : 20001) })),
    getStatus: () => ({ ready: false, pending: false, lastError: null })
  };

  const result = await manager.syncSubscription('https://example.com/sub');
  const importedNode = result.nodes.find((node) => node.server === 'sub.example');

  assert.equal(result.importedCount, 1);
  assert.equal(importedNode.source, 'subscription');
  assert.equal(importedNode.subscriptionUrl, 'https://example.com/sub');
  assert.equal(importedNode.localPort, 20001);
  assert.equal(result.subscription.url, 'https://example.com/sub');
  assert.equal(result.subscription.lastNodeCount, 1);
});

test('syncSubscription replaces older nodes from the same subscription url', async () => {
  const manager = new CoreManager(createPaths(), createStore([
    { id: 'old-sub', type: 'socks', server: 'old.example', port: 1080, source: 'subscription', subscriptionUrl: 'https://example.com/sub' },
    { id: 'manual', type: 'socks', server: 'manual.example', port: 1081 }
  ]));

  manager.proxyService = {
    syncSubscription: async () => ([{ type: 'socks', server: 'new.example', port: 1082 }]),
    setNodes() {},
    getLocalPort: (nodeId) => nodeId === 'manual' ? 20000 : 20001,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const result = await manager.syncSubscription('https://example.com/sub');

  assert.equal(result.nodes.some((node) => node.server === 'old.example'), false);
  assert.equal(result.nodes.some((node) => node.server === 'manual.example'), true);
  assert.equal(result.nodes.some((node) => node.server === 'new.example'), true);
});

test('getNodeRecords exposes ready-to-copy endpoint metadata', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  manager.proxyService = {
    setNodes() {},
    getLocalPort: () => 20000,
    toShareLink: () => 'socks://127.0.0.1:1080#n1',
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes,
    getStatus: () => ({ ready: false, pending: false, lastError: null })
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes,
    getStatus: () => ({ ready: false, pending: false, lastError: null })
  };

  const [node] = await manager.getNodeRecords();

  assert.equal(node.endpoint.protocol, 'socks5');
  assert.equal(node.endpoint.host, '127.0.0.1');
  assert.equal(node.endpoint.port, 20000);
  assert.equal(node.endpoint.url, 'socks5://127.0.0.1:20000');
  assert.equal(node.copyText, '127.0.0.1:20000');
  assert.equal(node.shareLink, 'socks://127.0.0.1:1080#n1');
});

test('getNodeRecords enriches nodes with geo metadata when available', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  manager.proxyService = {
    setNodes() {},
    getLocalPort: () => 20000,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.geoIpService = {
    enrichNodes: async (nodes) => nodes.map((node) => ({
      ...node,
      countryCode: 'JP',
      countryName: 'Japan',
      flagEmoji: '🇯🇵'
    })),
    getStatus: () => ({ ready: true, pending: false, lastError: null })
  };

  const [node] = await manager.getNodeRecords();

  assert.equal(node.countryCode, 'JP');
  assert.equal(node.countryName, 'Japan');
  assert.equal(node.flagEmoji, '🇯🇵');
});

test('updateSettings persists proxy mode and active node profile', async () => {
  const manager = new CoreManager(createPaths(), createStore([
    { id: 'n1', type: 'socks', server: 'one.example', port: 1080 },
    { id: 'n2', type: 'socks', server: 'two.example', port: 1081 }
  ]));

  const result = await manager.updateSettings({
    activeNodeId: 'n2',
    routingMode: 'global',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(result.settings.routingMode, 'global');
  assert.equal(result.proxy.activeNodeId, 'n2');
  assert.equal(result.proxy.systemProxyEnabled, true);
  assert.equal(result.proxy.unifiedSocksPort, 20100);
});

test('updateSettings persists validated custom rules', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  const result = await manager.updateSettings({
    routingMode: 'rule',
    customRules: [
      { type: 'domain_suffix', value: 'corp.local', action: 'direct' },
      { type: 'ip_cidr', value: '10.0.0.0/8', action: 'direct' }
    ]
  });

  assert.equal(result.settings.customRules.length, 2);
  assert.equal(result.proxy.customRules[0].type, 'domain_suffix');
});

test('updateSettings trims custom rule fields and preserves note', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  const result = await manager.updateSettings({
    customRules: [
      { id: 'rule-a', type: ' domain_suffix ', value: ' corp.local ', action: ' direct ', note: ' office ' }
    ]
  });

  assert.deepEqual(result.settings.customRules, [
    { id: 'rule-a', type: 'domain_suffix', value: 'corp.local', action: 'direct', nodeId: null, note: 'office' }
  ]);
});

test('updateSettings rejects unsupported routing mode', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({ routingMode: 'bogus' }), /Invalid routing mode/);
});

test('updateSettings rejects invalid custom rule type', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    customRules: [{ type: 'geoip', value: 'cn', action: 'direct' }]
  }), /invalid type/);
});

test('updateSettings rejects invalid ip cidr custom rules', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    customRules: [{ type: 'ip_cidr', value: '300.1.1.0/24', action: 'direct' }]
  }), /valid IPv4 CIDR/);
});

test('updateSettings rejects node custom rules without node id', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    customRules: [{ type: 'domain', value: 'youtube.com', action: 'node' }]
  }), /requires nodeId/);
});

test('updateSettings rejects duplicate custom rules', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    customRules: [
      { type: 'domain_suffix', value: 'corp.local', action: 'direct' },
      { type: 'domain_suffix', value: 'CORP.LOCAL', action: 'direct' }
    ]
  }), /duplicates/);
});

test('updateSettings persists normalized rulesets', async () => {
  const manager = new CoreManager(createPaths(), createStore([{ id: 'n1', type: 'socks', server: 'one.example', port: 1080 }]));

  const result = await manager.updateSettings({
    rulesets: [
      { id: 'rs-ai', kind: 'builtin', presetId: 'ai-services', name: ' AI ', enabled: true, target: 'node', nodeId: 'n1' },
      { kind: 'custom', name: ' Work ', enabled: true, target: 'direct', entries: [{ type: 'domain_suffix', value: ' corp.local ' }] }
    ]
  });

  assert.equal(result.settings.rulesets.length, 2);
  assert.equal(result.settings.rulesets[0].name, 'AI');
  assert.equal(result.settings.rulesets[1].entries[0].value, 'corp.local');
});

test('getBuiltinRulesets exposes common preset catalog', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  const builtinRulesets = manager.getBuiltinRulesets();

  assert.equal(builtinRulesets.some((ruleset) => ruleset.id === 'youtube'), true);
  assert.equal(builtinRulesets.some((ruleset) => ruleset.id === 'telegram'), true);
  assert.equal(builtinRulesets.some((ruleset) => ruleset.id === 'apple'), true);
});

test('updateSettings rejects invalid ruleset target', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    rulesets: [{ kind: 'builtin', presetId: 'ai-services', target: 'bogus' }]
  }), /invalid target/);
});

test('updateSettings rejects node target ruleset without node id', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    rulesets: [{ kind: 'builtin', presetId: 'ai-services', target: 'node' }]
  }), /requires nodeId/);
});

test('getSettingsSnapshot repairs malformed persisted custom rules', () => {
  const store = createStore();
  store.saveSettings({
    ...store.getSettings(),
    customRules: [{ type: 'geoip', value: 'cn', action: 'direct' }]
  });
  const manager = new CoreManager(createPaths(), store);

  const settings = manager.getSettingsSnapshot();

  assert.deepEqual(settings.customRules, []);
});

test('updateSettings rejects colliding unified proxy ports', async () => {
  const manager = new CoreManager(createPaths(), createStore());

  await assert.rejects(() => manager.updateSettings({
    systemProxySocksPort: 20100,
    systemProxyHttpPort: 20100
  }), /must be different/);
});

test('updateSettings rejects unified ports that collide with manual ports', async () => {
  const manager = new CoreManager(createPaths(), createStore([
    { id: 'n1', type: 'socks', server: 'one.example', port: 1080, local_port: 20100 }
  ]));

  await assert.rejects(() => manager.updateSettings({ systemProxySocksPort: 20100 }), /conflicts with manual proxy ports/);
});

test('getStatus exposes http default and socks manual endpoints', () => {
  const manager = new CoreManager(createPaths(), createStore());

  const status = manager.getStatus();

  assert.deepEqual(status.proxy.systemDefaultEndpoint, {
    protocol: 'http',
    host: '127.0.0.1',
    port: 20101,
    url: 'http://127.0.0.1:20101'
  });
  assert.deepEqual(status.proxy.httpCompatibilityEndpoint, {
    protocol: 'socks5',
    host: '127.0.0.1',
    port: 20100,
    url: 'socks5://127.0.0.1:20100'
  });
  assert.deepEqual(status.proxy.systemSocksEndpoint, {
    protocol: 'socks5',
    host: '127.0.0.1',
    port: 20100,
    url: 'socks5://127.0.0.1:20100'
  });
});

test('applySystemProxy uses current unified proxy ports', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  manager.state.status = 'running';
  manager.systemProxyManager = {
    apply: async ({ host, httpPort, socksPort }) => ({
      enabled: true,
      mode: 'manual',
      provider: 'mock',
      http: { host, port: httpPort },
      socks: { host, port: socksPort },
      supported: true,
      lastError: null
    }),
    getCapabilities: () => ({ supported: true, provider: 'mock' })
  };

  const status = await manager.applySystemProxy();

  assert.equal(status.enabled, true);
  assert.equal(status.http.port, 20101);
  assert.equal(status.socks.port, 20100);
});

test('disableSystemProxy clears desired system proxy setting', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  await manager.updateSettings({ systemProxyEnabled: true });
  manager.systemProxyManager = {
    disable: async () => ({
      enabled: false,
      mode: 'off',
      provider: 'mock',
      http: null,
      socks: null,
      supported: true,
      lastError: null
    }),
    getCapabilities: () => ({ supported: true, provider: 'mock' })
  };

  const status = await manager.disableSystemProxy();

  assert.equal(status.enabled, false);
  assert.equal(manager.getStatus().systemProxy.desiredEnabled, false);
});

test('unexpected process exit disables system proxy when desired', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  await manager.updateSettings({ systemProxyEnabled: true });
  let exitHandler = null;

  manager.proxyService = {
    proxyProcess: {
      once: (_event, handler) => {
        exitHandler = handler;
      }
    },
    setNodes() {},
    getLocalPort: () => 20000,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };
  manager.systemProxyManager = {
    disable: async () => ({
      enabled: false,
      mode: 'off',
      provider: 'mock',
      http: null,
      socks: null,
      supported: true,
      lastError: null
    }),
    getStatus: async () => ({
      enabled: true,
      mode: 'manual',
      provider: 'mock',
      http: { host: '127.0.0.1', port: 20101 },
      socks: { host: '127.0.0.1', port: 20100 },
      supported: true,
      lastError: null
    }),
    getCapabilities: () => ({ supported: true, provider: 'mock' })
  };

  manager.bindProcessState();
  await exitHandler(2, null);

  assert.equal(manager.getStatus().status, 'error');
  assert.equal(manager.getStatus().systemProxy.enabled, false);
});

test('updateSettings auto restarts when active node changes while core is running', async () => {
  const manager = new CoreManager(createPaths(), createStore([
    { id: 'n1', type: 'socks', server: 'one.example', port: 1080 },
    { id: 'n2', type: 'socks', server: 'two.example', port: 1081 }
  ]));
  manager.state.status = 'running';
  let restarted = false;
  manager.restart = async () => {
    restarted = true;
    manager.state.status = 'running';
    return manager.getStatus();
  };

  const result = await manager.updateSettings({ activeNodeId: 'n2' });

  assert.equal(restarted, true);
  assert.equal(result.autoRestarted, true);
  assert.equal(result.proxy.activeNodeId, 'n2');
});

test('updateSettings auto restarts when custom rules change while core is running', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  manager.state.status = 'running';
  let restarted = false;
  manager.restart = async () => {
    restarted = true;
    manager.state.status = 'running';
    return manager.getStatus();
  };

  const result = await manager.updateSettings({
    customRules: [{ type: 'domain', value: 'example.com', action: 'direct', note: 'site' }]
  });

  assert.equal(restarted, true);
  assert.equal(result.autoRestarted, true);
  assert.equal(result.restartRequired, false);
  assert.equal(result.proxy.customRules[0].value, 'example.com');
});

test('updateSettings applies auto start registration state', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  let enabled = false;
  manager.autoStartManager = {
    getCapabilities: () => ({ supported: true, provider: 'mock' }),
    enable: async () => {
      enabled = true;
      return { enabled: true, supported: true, provider: 'mock', command: 'mock-enable' };
    },
    disable: async () => {
      enabled = false;
      return { enabled: false, supported: true, provider: 'mock', command: null };
    }
  };

  const enabledResult = await manager.updateSettings({ autoStart: true });
  const enabledStatus = manager.getStatus();
  const disabledResult = await manager.updateSettings({ autoStart: false });
  const disabledStatus = manager.getStatus();

  assert.equal(enabledResult.settings.autoStart, true);
  assert.equal(enabledStatus.autoStart.enabled, true);
  assert.equal(disabledResult.settings.autoStart, false);
  assert.equal(disabledStatus.autoStart.enabled, false);
  assert.equal(enabled, false);
});

test('importRawNode auto restarts when core is already running', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  manager.state.status = 'running';
  let restarted = false;
  manager.restart = async () => {
    restarted = true;
    manager.state.status = 'running';
    return manager.getStatus();
  };
  manager.proxyService = {
    setNodes() {},
    getLocalPort: (nodeId) => nodeId === 'n1' ? 20000 : 20001,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const result = await manager.importRawNode({ type: 'socks', server: 'two.example', port: 1081 });

  assert.equal(restarted, true);
  assert.equal(result.autoRestarted, true);
  assert.equal(result.restartRequired, false);
});

test('testNode auto starts core when stopped', async () => {
  const manager = new CoreManager(createPaths(), createStore());
  let started = false;
  manager.start = async () => {
    started = true;
    manager.state.status = 'running';
    return manager.getStatus();
  };
  manager.proxyService = {
    setNodes() {},
    getLocalPort: () => 20000,
    testNode: async () => 123,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const result = await manager.testNode('n1');

  assert.equal(started, true);
  assert.equal(result.autoStarted, true);
  assert.equal(result.latencyMs, 123);
});

test('testNodes auto starts core and returns per-node results', async () => {
  const manager = new CoreManager(createPaths(), createStore([
    { id: 'n1', type: 'socks', server: 'one.example', port: 1080 },
    { id: 'n2', type: 'socks', server: 'two.example', port: 1081 }
  ]));
  let started = false;
  manager.start = async () => {
    started = true;
    manager.state.status = 'running';
    return manager.getStatus();
  };
  manager.proxyService = {
    setNodes() {},
    getLocalPort: (nodeId) => nodeId === 'n1' ? 20000 : 20001,
    testNode: async (nodeId) => {
      if (nodeId === 'n2') {
        throw new Error('connect failed');
      }
      return 88;
    },
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const result = await manager.testNodes();

  assert.equal(started, true);
  assert.equal(result.autoStarted, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[0].latencyMs, 88);
  assert.equal(result.results[1].ok, false);
  assert.equal(result.results[1].error, 'connect failed');
});
