const json = (body, status = 200) => ({ status, body });

export function createNodeGroupRoutes({ coreManager }) {
  const getNodeGroups = async () => {
    if (typeof coreManager.getNodeGroupsResolved === 'function') {
      return coreManager.getNodeGroupsResolved();
    }
    return coreManager.getNodeGroups();
  };
  const getNodeGroupTesting = () => {
    const settings = coreManager.getSettingsSnapshot();
    return {
      intervalSec: settings.nodeGroupAutoTestIntervalSec || 300,
      latencyCache: settings.nodeGroupLatencyCache || { updatedAt: null, results: {} }
    };
  };

  return {
    'GET /api/node-groups': async () => json({ ok: true, nodeGroups: await getNodeGroups(), nodes: await coreManager.getNodeRecords(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() }),
    'POST /api/node-groups': async ({ body }) => {
      try {
        return json({ ok: true, ...await coreManager.createNodeGroup(body || {}), nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() });
      } catch (error) {
        return json({ ok: false, error: error.message, nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() }, error.status || 500);
      }
    },
    'PUT /api/node-groups': async ({ body }) => {
      try {
        return json({ ok: true, ...await coreManager.updateNodeGroup(body?.id, body || {}), nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() });
      } catch (error) {
        return json({ ok: false, error: error.message, nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() }, error.status || 500);
      }
    },
    'DELETE /api/node-groups': async ({ body }) => {
      try {
        return json({ ok: true, ...await coreManager.deleteNodeGroup(body?.id), nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() });
      } catch (error) {
        return json({ ok: false, error: error.message, nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() }, error.status || 500);
      }
    },
    'PUT /api/node-groups/nodes': async ({ body }) => {
      try {
        return json({ ok: true, ...await coreManager.updateNodeGroupNodes(body?.id, body?.nodeIds), nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() });
      } catch (error) {
        return json({ ok: false, error: error.message, nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() }, error.status || 500);
      }
    },
    'PUT /api/node-groups/selection': async ({ body }) => {
      try {
        return json({ ok: true, ...await coreManager.selectNodeGroupNode(body?.id, body?.selectedNodeId), nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() });
      } catch (error) {
        return json({ ok: false, error: error.message, nodeGroups: await getNodeGroups(), nodeGroupTesting: getNodeGroupTesting(), core: coreManager.getStatus() }, error.status || 500);
      }
    }
  };
}
