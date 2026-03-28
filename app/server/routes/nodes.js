const json = (body, status = 200) => ({ status, body });

export function createNodeRoutes({ coreManager }) {
  return {
    'GET /api/nodes': async () => json({
      ok: true,
      nodes: coreManager.getNodeRecords(),
      core: coreManager.getStatus()
    }),

    'POST /api/nodes/import-link': async ({ body }) => {
      const link = body?.link?.trim();
      if (!link) {
        return json({ ok: false, error: 'Missing proxy link' }, 400);
      }

      try {
        return json({ ok: true, ...(await coreManager.importProxyLink(link)) }, 201);
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
    }
  };
}
