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
