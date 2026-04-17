import test from 'node:test';
import assert from 'node:assert/strict';

import { createNodeGroupRoutes } from '../app/server/routes/node-groups.js';

test('node group routes expose CRUD endpoints', async () => {
  let nodeGroups = [{ id: 'g1', name: 'JP Pool', type: 'country', countryCode: 'JP', iconMode: 'auto', iconEmoji: '', note: '', nodeIds: ['n1'], selectedNodeId: 'n1' }];
  const coreManager = {
    getNodeGroups: () => nodeGroups,
    getNodeRecords: async () => [{ id: 'n1', name: 'JP 1' }],
    getStatus: () => ({ status: 'running' }),
    getSettingsSnapshot: () => ({ nodeGroupAutoTestIntervalSec: 300, nodeGroupLatencyCache: { updatedAt: null, results: {} } }),
    getNodeGroupTestingSnapshot: () => ({ intervalSec: 300, latencyCache: { updatedAt: null, results: {} } }),
    createNodeGroup: async (payload) => { nodeGroups = [...nodeGroups, { id: 'g2', name: payload.name, type: payload.type || 'custom', countryCode: payload.countryCode || null, iconMode: payload.iconMode || 'auto', iconEmoji: payload.iconEmoji || '', note: payload.note || '', nodeIds: [], selectedNodeId: null }]; return {}; },
    updateNodeGroup: async (id, payload) => { nodeGroups = nodeGroups.map((g) => g.id === id ? { ...g, ...payload } : g); return {}; },
    deleteNodeGroup: async (id) => { nodeGroups = nodeGroups.filter((g) => g.id !== id); return {}; },
    updateNodeGroupNodes: async (id, ids) => { nodeGroups = nodeGroups.map((g) => g.id === id ? { ...g, nodeIds: ids, selectedNodeId: ids[0] || null } : g); return {}; },
    selectNodeGroupNode: async (id, selectedNodeId) => { nodeGroups = nodeGroups.map((g) => g.id === id ? { ...g, selectedNodeId } : g); return {}; },
    testNodeGroups: async (ids) => ({ results: [{ id: 'n1', ok: true, latencyMs: 100 }], testedIds: ids })
  };
  const routes = createNodeGroupRoutes({ coreManager });

  const list = await routes['GET /api/node-groups']();
  await routes['POST /api/node-groups']({ body: { name: 'US Pool', type: 'country', countryCode: 'US' } });
  await routes['PUT /api/node-groups']({ body: { id: 'g1', name: 'JP Main', note: 'main route' } });
  await routes['PUT /api/node-groups/nodes']({ body: { id: 'g1', nodeIds: ['n1'] } });
  await routes['PUT /api/node-groups/selection']({ body: { id: 'g1', selectedNodeId: 'n1' } });
  const tested = await routes['POST /api/node-groups/test']({ body: { id: 'g1' } });
  const removed = await routes['DELETE /api/node-groups']({ body: { id: 'g2' } });

  assert.equal(list.body.nodeGroups.length, 1);
  assert.equal(tested.body.results[0].latencyMs, 100);
  assert.equal(removed.body.nodeGroups[0].name, 'JP Main');
  assert.equal(removed.body.nodeGroups[0].note, 'main route');
});
