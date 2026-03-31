import test from 'node:test';
import assert from 'node:assert/strict';

import { assignStableLocalPorts } from '../app/server/services/CoreManager.js';
import { createNodeRoutes } from '../app/server/routes/nodes.js';
import { createSystemRoutes } from '../app/server/routes/system.js';

test('assignStableLocalPorts preserves existing assignments when nodes change', () => {
  const initialNodes = assignStableLocalPorts([
    { id: 'alpha', type: 'socks', server: 'one.example', port: 1080 },
    { id: 'beta', type: 'socks', server: 'two.example', port: 1081 }
  ], 20000);

  assert.equal(initialNodes[0].local_port, 20000);
  assert.equal(initialNodes[1].local_port, 20001);

  const afterDeleteAndAdd = assignStableLocalPorts([
    initialNodes[1],
    { id: 'gamma', type: 'socks', server: 'three.example', port: 1082 }
  ], 20000);

  assert.equal(afterDeleteAndAdd[0].id, 'beta');
  assert.equal(afterDeleteAndAdd[0].local_port, 20001);
  assert.equal(afterDeleteAndAdd[1].id, 'gamma');
  assert.equal(afterDeleteAndAdd[1].local_port, 20000);
});

test('node routes expose geo ip status alongside enriched node records', async () => {
  const routes = createNodeRoutes({
    coreManager: {
      getNodeRecords: async () => ([{ id: 'n1', server: '1.1.1.1', countryCode: 'AU', flagEmoji: '🇦🇺' }]),
      getGroups: () => ['Default'],
      getStatus: () => ({ status: 'running' }),
      getGeoIpStatus: () => ({ ready: true, pending: false, lastError: null })
    }
  });

  const response = await routes['GET /api/nodes']({});

  assert.equal(response.body.ok, true);
  assert.equal(response.body.nodes[0].countryCode, 'AU');
  assert.equal(response.body.geoIp.ready, true);
});

test('system routes expose geo ip status and refresh endpoint', async () => {
  const routes = createSystemRoutes({
    store: {},
    paths: { root: 'E:/repo', publicDir: 'E:/repo/public', dataDir: 'E:/repo/data', logsDir: 'E:/repo/logs' },
    coreManager: {
      refreshSystemProxyState: async () => ({ enabled: false }),
      getSettingsSnapshot: () => ({ autoStart: false }),
      getStatus: () => ({ status: 'running' }),
      getGeoIpStatus: () => ({ ready: false, pending: true, lastError: null }),
      refreshGeoIp: async () => ({ ready: true, pending: false, lastError: null })
    }
  });

  const statusResponse = await routes['GET /api/system/status']();
  const refreshResponse = await routes['POST /api/system/geoip/refresh']();

  assert.equal(statusResponse.body.geoIp.pending, true);
  assert.equal(refreshResponse.body.geoIp.ready, true);
});
