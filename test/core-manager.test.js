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
    parseProxyLink: () => ({ type: 'socks', server: 'two.example', port: 1081 }),
    setNodes() {},
    getLocalPort: (nodeId) => nodeId === 'n1' ? 20000 : 20001,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const result = await manager.importProxyLink('socks://demo');

  assert.equal(result.nodes.length, 2);
  assert.equal(result.node.server, 'two.example');
  assert.equal(result.node.localPort, 20001);
  assert.equal(result.restartRequired, false);
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

test('getNodeRecords exposes ready-to-copy endpoint metadata', () => {
  const manager = new CoreManager(createPaths(), createStore());
  manager.proxyService = {
    setNodes() {},
    getLocalPort: () => 20000,
    proxyListen: '127.0.0.1',
    basePort: 20000
  };

  const [node] = manager.getNodeRecords();

  assert.equal(node.endpoint.protocol, 'socks5');
  assert.equal(node.endpoint.host, '127.0.0.1');
  assert.equal(node.endpoint.port, 20000);
  assert.equal(node.endpoint.url, 'socks5://127.0.0.1:20000');
  assert.equal(node.copyText, '127.0.0.1:20000');
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
    routingMode: 'custom',
    customRules: [
      { type: 'domain_suffix', value: 'corp.local', action: 'direct' },
      { type: 'ip_cidr', value: '10.0.0.0/8', action: 'direct' }
    ]
  });

  assert.equal(result.settings.customRules.length, 2);
  assert.equal(result.proxy.customRules[0].type, 'domain_suffix');
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
  const disabledResult = await manager.updateSettings({ autoStart: false });

  assert.equal(enabledResult.settings.autoStart, true);
  assert.equal(enabledResult.core.autoStart.enabled, true);
  assert.equal(disabledResult.settings.autoStart, false);
  assert.equal(disabledResult.core.autoStart.enabled, false);
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
