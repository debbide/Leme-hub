const json = (body, status = 200) => ({ status, body });

export function createNodeRoutes({ coreManager }) {
  return {
    'GET /api/nodes': async () => json({
      ok: true,
      nodes: await coreManager.getNodeRecords(),
      groups: coreManager.getGroups(),
      core: coreManager.getStatus(),
      geoIp: coreManager.getGeoIpStatus()
    }),

    'POST /api/groups': async ({ body }) => {
      const name = String(body?.name || '').trim();
      if (!name) {
        return json({ ok: false, error: 'Missing group name' }, 400);
      }
      try {
        return json({ ok: true, ...(await coreManager.createGroup(name)) });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'POST /api/groups/country': async () => {
      try {
        return json({ ok: true, ...(await coreManager.groupNodesByCountry()) });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'POST /api/nodes/import-link': async ({ body }) => {
      const link = body?.link?.trim();
      if (!link) {
        return json({ ok: false, error: 'Missing proxy link' }, 400);
      }
      const group = body?.group ? String(body.group).trim() || null : null;

      try {
        return json({ ok: true, ...(await coreManager.importProxyLink(link, group)) }, 201);
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'POST /api/nodes/raw': async ({ body }) => {
      if (!body || typeof body !== 'object') {
        return json({ ok: false, error: 'Invalid or missing node JSON' }, 400);
      }

      try {
        return json({ ok: true, ...(await coreManager.importRawNode(body)) }, 201);
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'PUT /api/nodes': async ({ body }) => {
      const nodeId = body?.id;
      if (!nodeId) {
        return json({ ok: false, error: 'Missing node id' }, 400);
      }

      try {
        return json({ ok: true, ...(await coreManager.updateNode(nodeId, body)) });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'PUT /api/nodes/country': async ({ body }) => {
      const nodeId = body?.id;
      if (!nodeId) {
        return json({ ok: false, error: 'Missing node id' }, 400);
      }

      const countryCode = body?.countryCode ?? null;
      if (countryCode !== null && !/^[a-z]{2}$/iu.test(String(countryCode).trim())) {
        return json({ ok: false, error: 'countryCode must be a 2-letter ISO code' }, 400);
      }

      try {
        return json({ ok: true, ...(await coreManager.setNodeCountryOverride(nodeId, countryCode)) });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'DELETE /api/nodes': async ({ body }) => {
      const nodeId = body?.id;
      if (!nodeId) {
        return json({ ok: false, error: 'Missing node id' }, 400);
      }

      try {
        return json({ ok: true, ...(await coreManager.deleteNode(nodeId)) });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'POST /api/nodes/test': async ({ body }) => {
      const nodeId = body?.id;
      if (!nodeId) {
        return json({ ok: false, error: 'Missing node id' }, 400);
      }

      try {
        const result = await coreManager.testNode(nodeId);
        return json({ ok: true, ...result });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'POST /api/nodes/test-batch': async ({ body }) => {
      try {
        const result = await coreManager.testNodes(body?.ids);
        return json({ ok: true, ...result });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'POST /api/subscriptions/sync': async ({ body }) => {
      const url = body?.url?.trim();
      if (!url) {
        return json({ ok: false, error: 'Missing subscription url' }, 400);
      }

      try {
        return json({ ok: true, ...(await coreManager.syncSubscription(url)) });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'GET /api/groups': async () => json({
      ok: true,
      groups: coreManager.getGroups()
    }),

    'PUT /api/groups/rename': async ({ body }) => {
      const from = String(body?.from || '').trim();
      const to = String(body?.to || '').trim();
      if (!from || !to) {
        return json({ ok: false, error: 'Missing from or to' }, 400);
      }
      try {
        const result = await coreManager.renameGroup(from, to);
        return json({ ok: true, ...result, groups: coreManager.getGroups() });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'DELETE /api/groups': async ({ body }) => {
      const name = String(body?.name || '').trim();
      if (!name) {
        return json({ ok: false, error: 'Missing group name' }, 400);
      }
      try {
        const result = await coreManager.deleteGroup(name);
        return json({ ok: true, ...result, groups: coreManager.getGroups() });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    },

    'PUT /api/nodes/group': async ({ body }) => {
      const nodeIds = body?.nodeIds;
      const group = body?.group ?? null;
      if (!Array.isArray(nodeIds) || !nodeIds.length) {
        return json({ ok: false, error: 'Missing nodeIds array' }, 400);
      }
      try {
        const result = await coreManager.setNodeGroup(nodeIds, group);
        return json({ ok: true, ...result, groups: coreManager.getGroups() });
      } catch (error) {
        return json({ ok: false, error: error.message }, error.status || 500);
      }
    }
  };
}
