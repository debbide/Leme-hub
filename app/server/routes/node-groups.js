const json = (body, status = 200) => ({ status, body });

export function createNodeGroupRoutes({ coreManager }) {
  const getNodeGroups = async () => {
    if (typeof coreManager.getNodeGroupsResolved === 'function') {
      return coreManager.getNodeGroupsResolved();
    }
    return coreManager.getNodeGroups();
  };
  const getNodeGroupTesting = () => {
    if (typeof coreManager.getNodeGroupTestingSnapshot === 'function') {
      return coreManager.getNodeGroupTestingSnapshot();
    }
    const settings = coreManager.getSettingsSnapshot();
    return {
      intervalSec: settings.nodeGroupAutoTestIntervalSec || 300,
      latencyCache: settings.nodeGroupLatencyCache || { updatedAt: null, results: {} }
    };
  };

  // Every node-group response carries the same refreshed snapshot envelope so
  // the UI can re-render without an extra round trip.
  const withGroupsSnapshot = async (extra = {}, { includeSortOrder = true } = {}) => ({
    ...extra,
    nodeGroups: await getNodeGroups(),
    ...(includeSortOrder ? { groupSortOrder: coreManager.getSettingsSnapshot().groupSortOrder || [] } : {}),
    nodeGroupTesting: getNodeGroupTesting(),
    core: coreManager.getStatus()
  });

  const ok = async (extra, options) => json({ ok: true, ...(await withGroupsSnapshot(extra, options)) });
  const fail = async (error, options) => json(
    { ok: false, error: error.message, ...(await withGroupsSnapshot({}, options)) },
    error.status || 500
  );

  return {
    'GET /api/node-groups': async () => ok({
      nodes: await coreManager.getNodeRecords()
    }),
    'POST /api/node-groups': async ({ body }) => {
      try {
        return await ok(await coreManager.createNodeGroup(body || {}));
      } catch (error) {
        return await fail(error);
      }
    },
    'PUT /api/node-groups': async ({ body }) => {
      try {
        return await ok(await coreManager.updateNodeGroup(body?.id, body || {}));
      } catch (error) {
        return await fail(error);
      }
    },
    'DELETE /api/node-groups': async ({ body }) => {
      try {
        return await ok(await coreManager.deleteNodeGroup(body?.id));
      } catch (error) {
        return await fail(error);
      }
    },
    'PUT /api/node-groups/nodes': async ({ body }) => {
      try {
        return await ok(await coreManager.updateNodeGroupNodes(body?.id, body?.nodeIds));
      } catch (error) {
        return await fail(error);
      }
    },
    'PUT /api/node-groups/selection': async ({ body }) => {
      try {
        return await ok(await coreManager.selectNodeGroupNode(body?.id, body?.selectedNodeId));
      } catch (error) {
        return await fail(error);
      }
    },
    'POST /api/node-groups/test': async ({ body }) => {
      const noSortOrder = { includeSortOrder: false };
      try {
        const ids = Array.isArray(body?.ids)
          ? body.ids
          : body?.id
            ? [body.id]
            : [];
        return await ok(
          await coreManager.testNodeGroups(ids, { autoStartCore: false, applySelection: body?.applySelection !== false }),
          noSortOrder
        );
      } catch (error) {
        return await fail(error, noSortOrder);
      }
    },
    'POST /api/node-groups/reorder': async ({ body }) => {
      try {
        return await ok(await coreManager.reorderNodeGroups(body?.order || []));
      } catch (error) {
        return await fail(error);
      }
    }
  };
}
