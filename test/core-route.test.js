import test from 'node:test';
import assert from 'node:assert/strict';

import { createCoreRoutes } from '../app/server/routes/core.js';

test('core routes expose routing hits endpoint', async () => {
  const routes = createCoreRoutes({
    coreManager: {
      getRoutingHits: async () => [{ id: '1', host: 'www.youtube.com', name: 'YouTube 视频', kind: 'ruleset', outbound: 'out-jp' }],
      getStatus: () => ({ status: 'running' })
    }
  });

  const response = await routes['GET /api/core/routing-hits']();
  assert.equal(response.body.ok, true);
  assert.equal(response.body.hits[0].host, 'www.youtube.com');
});
