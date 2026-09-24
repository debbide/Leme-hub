import test from 'node:test';
import assert from 'node:assert/strict';

import { createCoreRoutes } from '../app/server/routes/core.js';
import { getActiveConnections } from '../app/server/services/core-manager/status-manager.js';

const makeManager = (overrides = {}) => ({
  state: { status: 'running' },
  refreshConnectionsServiceBaseUrl: () => {},
  connectionsService: {
    getConnections: async () => []
  },
  ...overrides
});

test('getActiveConnections returns empty list when core is not running', async () => {
  const manager = makeManager({ state: { status: 'stopped' } });
  const result = await getActiveConnections(manager);
  assert.deepEqual(result, []);
});

test('getActiveConnections normalizes clash API connections', async () => {
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => [
        {
          id: 'conn-1',
          metadata: {
            host: 'www.youtube.com',
            destinationPort: 443,
            network: 'tcp',
            type: 'http',
            process: 'chrome.exe'
          },
          chains: ['out-jp', 'proxy'],
          rule: 'DomainSuffix',
          rulePayload: 'youtube.com',
          upload: 1024,
          download: 2048
        }
      ]
    }
  });

  const result = await getActiveConnections(manager);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'conn-1');
  assert.equal(result[0].host, 'www.youtube.com');
  assert.equal(result[0].destinationPort, 443);
  assert.equal(result[0].process, 'chrome.exe');
  assert.equal(result[0].uploadBytes, 1024);
  assert.equal(result[0].downloadBytes, 2048);
  assert.deepEqual(result[0].chains, ['out-jp', 'proxy']);
});

test('getActiveConnections returns empty list when clash API fails', async () => {
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => { throw new Error('connection refused'); }
    }
  });
  const result = await getActiveConnections(manager);
  assert.deepEqual(result, []);
});

test('GET /api/core/connections exposes normalized connections', async () => {
  const routes = createCoreRoutes({
    coreManager: {
      getActiveConnections: async () => [
        { id: 'a', host: 'example.com', uploadBytes: 10, downloadBytes: 20 }
      ],
      getStatus: () => ({ status: 'running' })
    }
  });

  const response = await routes['GET /api/core/connections']();
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.connections.length, 1);
  assert.equal(response.body.connections[0].host, 'example.com');
});

test('GET /api/core/connections returns ok:false envelope on failure', async () => {
  const routes = createCoreRoutes({
    coreManager: {
      getActiveConnections: async () => { throw new Error('boom'); },
      getStatus: () => ({ status: 'running' })
    }
  });

  const response = await routes['GET /api/core/connections']();
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, 'boom');
  assert.deepEqual(response.body.connections, []);
});

test('getActiveConnections resolves selector chains to the real exit node', async () => {
  const { expandSelectorChains } = await import('../app/server/services/core-manager/status-manager.js');
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => [
        { id: 'c1', metadata: { host: 'www.youtube.com', destinationPort: 443 }, chains: ['selector-active'] },
        { id: 'c2', metadata: { host: 'example.com' }, chains: ['direct'] }
      ],
      getProxies: async () => ({
        'selector-active': { name: 'selector-active', type: 'Selector', now: 'HK-01' },
        direct: { name: 'direct', type: 'Direct' }
      })
    }
  });

  const result = await getActiveConnections(manager);
  assert.deepEqual(result[0].chains, ['selector-active']);
  assert.deepEqual(result[0].resolvedChains, ['selector-active', 'HK-01']);
  assert.equal(result[0].exitNode, 'HK-01');
  assert.deepEqual(result[1].resolvedChains, ['direct']);
  assert.equal(result[1].exitNode, 'direct');
  assert.deepEqual(expandSelectorChains([], new Map()), []);
});

test('getActiveConnections follows nested selectors and stops on cycles', async () => {
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => [
        { id: 'c1', metadata: {}, chains: ['sel-a'] },
        { id: 'c2', metadata: {}, chains: ['sel-x'] }
      ],
      getProxies: async () => ({
        'sel-a': { name: 'sel-a', type: 'Selector', now: 'sel-b' },
        'sel-b': { name: 'sel-b', type: 'Selector', now: 'SG-02' },
        'sel-x': { name: 'sel-x', type: 'Selector', now: 'sel-y' },
        'sel-y': { name: 'sel-y', type: 'Selector', now: 'sel-x' }
      })
    }
  });

  const result = await getActiveConnections(manager);
  assert.deepEqual(result[0].resolvedChains, ['sel-a', 'sel-b', 'SG-02']);
  assert.equal(result[0].exitNode, 'SG-02');
  // Cycle: sel-x -> sel-y -> sel-x stops instead of looping forever.
  assert.deepEqual(result[1].resolvedChains, ['sel-x', 'sel-y']);
  assert.equal(result[1].exitNode, 'sel-y');
});

test('getActiveConnections keeps raw chains when /proxies is unavailable', async () => {
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => [
        { id: 'c1', metadata: {}, chains: ['selector-active'] }
      ],
      getProxies: async () => { throw new Error('not found'); }
    }
  });

  const result = await getActiveConnections(manager);
  assert.deepEqual(result[0].resolvedChains, ['selector-active']);
  assert.equal(result[0].exitNode, 'selector-active');
});

test('getActiveConnections works with legacy connectionsService without getProxies', async () => {
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => [
        { id: 'c1', metadata: {}, chains: ['selector-active'] }
      ]
    }
  });

  const result = await getActiveConnections(manager);
  assert.deepEqual(result[0].resolvedChains, ['selector-active']);
  assert.equal(result[0].exitNode, 'selector-active');
});

test('getActiveConnections resolves outbound tags to node names', async () => {
  const manager = makeManager({
    getNodeRecords: async () => [
      { id: '635416e', name: 'HK-01' },
      { id: 'aabbcc', name: 'JP-02' }
    ],
    connectionsService: {
      getConnections: async () => [
        { id: 'c1', metadata: { host: 'example.com' }, chains: ['selector-active'] },
        { id: 'c2', metadata: { host: 'example.org' }, chains: ['direct'] }
      ],
      getProxies: async () => ({
        'selector-active': { name: 'selector-active', type: 'Selector', now: 'out-635416e' }
      })
    }
  });

  const result = await getActiveConnections(manager);
  assert.deepEqual(result[0].resolvedChains, ['selector-active', 'HK-01']);
  assert.equal(result[0].exitNode, 'HK-01');
  assert.equal(result[0].exitNodeTag, 'out-635416e');
  // Non-node outbounds keep their raw tag and get no exitNodeTag.
  assert.equal(result[1].exitNode, 'direct');
  assert.equal(result[1].exitNodeTag, null);
});

test('getActiveConnections keeps raw tags when node lookup is unavailable', async () => {
  const manager = makeManager({
    connectionsService: {
      getConnections: async () => [
        { id: 'c1', metadata: {}, chains: ['out-635416e'] }
      ],
      getProxies: async () => ({})
    }
  });

  const result = await getActiveConnections(manager);
  assert.equal(result[0].exitNode, 'out-635416e');
  assert.equal(result[0].exitNodeTag, null);
});
