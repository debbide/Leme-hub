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

test('node routes expose country grouping and override endpoints', async () => {
  const routes = createNodeRoutes({
    coreManager: {
      getNodeRecords: async () => [],
      getGroups: () => ['国家/JP'],
      getStatus: () => ({ status: 'running' }),
      getGeoIpStatus: () => ({ ready: true, pending: false, lastError: null }),
      groupNodesByCountry: async () => ({ groupedCount: 2, skippedCount: 1, nodes: [{ id: 'n1', group: '国家/JP' }] }),
      setNodeCountryOverride: async () => ({ node: { id: 'n1', countryCodeOverride: 'JP' }, nodes: [{ id: 'n1', countryCodeOverride: 'JP' }], groups: ['国家/JP'] })
    }
  });

  const groupResponse = await routes['POST /api/groups/country']({ body: {} });
  const overrideResponse = await routes['PUT /api/nodes/country']({ body: { id: 'n1', countryCode: 'jp' } });
  const invalidResponse = await routes['PUT /api/nodes/country']({ body: { id: 'n1', countryCode: 'JPN' } });

  assert.equal(groupResponse.body.ok, true);
  assert.equal(groupResponse.body.groupedCount, 2);
  assert.equal(overrideResponse.body.ok, true);
  assert.equal(overrideResponse.body.node.countryCodeOverride, 'JP');
  assert.equal(invalidResponse.status, 400);
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
      refreshGeoIp: async () => ({ ready: true, pending: false, lastError: null }),
      getRulesetDatabaseStatus: () => ({ ready: false, pending: false, lastError: null }),
      refreshRulesetDatabase: async () => ({ ready: true, pending: false, lastError: null })
    }
  });

  const statusResponse = await routes['GET /api/system/status']();
  const refreshResponse = await routes['POST /api/system/geoip/refresh']();

  assert.equal(statusResponse.body.geoIp.pending, true);
  assert.equal(refreshResponse.body.geoIp.ready, true);
});

test('system routes expose ruleset database status and refresh endpoint', async () => {
  const routes = createSystemRoutes({
    store: {},
    paths: { root: 'E:/repo', publicDir: 'E:/repo/public', dataDir: 'E:/repo/data', logsDir: 'E:/repo/logs' },
    coreManager: {
      refreshSystemProxyState: async () => ({ enabled: false }),
      getSettingsSnapshot: () => ({ autoStart: false }),
      getStatus: () => ({ status: 'running' }),
      getGeoIpStatus: () => ({ ready: true, pending: false, lastError: null }),
      getRulesetDatabaseStatus: () => ({ ready: false, pending: true, lastError: null }),
      refreshRulesetDatabase: async () => ({ ready: true, pending: false, lastError: null, downloadedAt: '2026-04-02T00:00:00.000Z' })
    }
  });

  const statusResponse = await routes['GET /api/system/status']();
  const refreshResponse = await routes['POST /api/system/rulesets/refresh']();

  assert.equal(statusResponse.body.rulesetDatabase.pending, true);
  assert.equal(refreshResponse.body.rulesetDatabase.ready, true);
});

test('system rules routes expose rules and save result payload', async () => {
  let settingsSnapshot = { customRules: [{ id: 'rule-1', type: 'domain', value: 'example.com', action: 'direct', note: '' }], rulesets: [{ id: 'rs-ai', kind: 'builtin', presetId: 'ai-services', target: 'default', nodeId: null, enabled: true, entries: [], name: 'AI', note: '' }] };
  const routes = createSystemRoutes({
    store: {},
    paths: { root: 'E:/repo', publicDir: 'E:/repo/public', dataDir: 'E:/repo/data', logsDir: 'E:/repo/logs' },
    coreManager: {
      getSettingsSnapshot: () => settingsSnapshot,
      getBuiltinRulesets: () => [{ id: 'ai-services', name: 'AI Services', entries: [] }],
      getStatus: () => ({ status: 'running', proxy: { mode: 'custom' } }),
      updateSettings: async ({ customRules, rulesets }) => ({
        settings: (settingsSnapshot = {
          customRules: customRules || settingsSnapshot.customRules,
          rulesets: rulesets || settingsSnapshot.rulesets
        }),
        rules: settingsSnapshot.customRules,
        customRules: settingsSnapshot.customRules,
        rulesets: settingsSnapshot.rulesets,
        autoRestarted: true,
        restartRequired: false,
        proxy: { mode: 'custom' }
      })
    }
  });

  const getResponse = await routes['GET /api/system/rules']();
  const putResponse = await routes['PUT /api/system/rules']({
    body: {
      customRules: [{ id: 'rule-2', type: 'domain_suffix', value: 'corp.local', action: 'default', note: 'corp' }],
      rulesets: [{ id: 'rs-dev', kind: 'builtin', presetId: 'dev-services', target: 'direct', nodeId: null, enabled: true, entries: [], name: 'Dev', note: '' }]
    }
  });

  assert.equal(getResponse.body.rules.length, 1);
  assert.equal(getResponse.body.rulesets.length, 1);
  assert.equal(getResponse.body.builtinRulesets.length, 1);
  assert.equal(getResponse.body.rules[0].type, 'domain');
  assert.equal(putResponse.body.ok, true);
  assert.equal(putResponse.body.customRules[0].type, 'domain_suffix');
  assert.equal(putResponse.body.rulesets[0].presetId, 'dev-services');
  assert.equal(putResponse.body.autoRestarted, true);
});
