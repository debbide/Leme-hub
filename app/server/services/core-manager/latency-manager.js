import {
  createHttpError,
  getNodeGroupById
} from './state-utils.js';

export const testNode = async (manager, nodeId) => {
  if (!manager.getNodeById(nodeId)) {
    throw createHttpError('Node not found', 404);
  }

  const { results, autoStarted } = await manager.measureNodeLatencies([nodeId], {
    autoStartCore: true
  });
  const [result] = results;
  if (!result?.ok) {
    throw createHttpError(result?.error || 'Speed test failed', 502);
  }

  const latencyMs = result.latencyMs;
  return {
    node: manager.getNodeById(nodeId),
    latencyMs,
    core: manager.getStatus(),
    autoStarted
  };
};

export const measureNodeLatencies = async (manager, nodeIds = [], options = {}) => {
  const requestedIds = Array.isArray(nodeIds) && nodeIds.length
    ? [...new Set(nodeIds)]
    : manager.store.getNodes().map((node) => node.id);

  if (!requestedIds.length) {
    throw createHttpError('No nodes available for latency tests', 400);
  }

  const unknownId = requestedIds.find((nodeId) => !manager.getNodeById(nodeId));
  if (unknownId) {
    throw createHttpError(`Node not found: ${unknownId}`, 404);
  }

  let autoStarted = false;
  if (manager.state.status !== 'running') {
    if (options.autoStartCore === false) {
      const settings = manager.getSettingsSnapshot();
      const binary = await manager.binaryManager.ensureAvailable(settings.singBoxBinaryPath);
      manager.proxyService.setNodes(manager.store.getNodes());

      if (typeof manager.proxyService.testNodes === 'function') {
        const results = await manager.proxyService.testNodes(requestedIds, {
          binPath: binary.executablePath,
          onResult: options.onResult
        });
        return {
          results: results.map((item) => ({
            ...item,
            node: item.node || manager.getNodeById(item.id)
          })),
          core: manager.getStatus(),
          autoStarted
        };
      }
    } else {
      await manager.start();
      autoStarted = true;
    }
  }

  if (typeof manager.proxyService.testNodes === 'function') {
    const results = await manager.proxyService.testNodes(requestedIds, {
      onResult: options.onResult
    });
    return {
      results: results.map((item) => ({
        ...item,
        node: item.node || manager.getNodeById(item.id)
      })),
      core: manager.getStatus(),
      autoStarted
    };
  }

  const concurrency = 5;
  const results = [];
  for (let i = 0; i < requestedIds.length; i += concurrency) {
    const batch = requestedIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (nodeId) => {
      const node = manager.getNodeById(nodeId);
      try {
        const latencyMs = await manager.proxyService.testNode(nodeId);
        const result = { id: nodeId, ok: true, latencyMs, node };
        await options.onResult?.(result);
        return result;
      } catch (error) {
        const result = { id: nodeId, ok: false, error: error.message, node };
        await options.onResult?.(result);
        return result;
      }
    }));
    results.push(...batchResults);
  }

  return {
    results,
    core: manager.getStatus(),
    autoStarted
  };
};

export const testNodes = async (manager, nodeIds = [], options = {}) => manager.measureNodeLatencies(nodeIds, {
  ...options,
  autoStartCore: true
});

export const testNodeGroups = async (manager, groupIds = [], options = {}) => {
  const settings = manager.getSettingsSnapshot();
  const nodes = manager.store.getNodes();
  const requestedGroupIds = Array.isArray(groupIds)
    ? [...new Set(groupIds.map((groupId) => String(groupId || '').trim()).filter(Boolean))]
    : (groupIds ? [String(groupIds).trim()] : []);
  const eligibleGroups = (settings.nodeGroups || []).filter((group) => {
    if (!group?.id) {
      return false;
    }
    if (requestedGroupIds.length && !requestedGroupIds.includes(group.id)) {
      return false;
    }
    return manager.getEffectiveNodeGroupNodeIds(group, nodes).length > 0;
  });

  if (!eligibleGroups.length) {
    if (requestedGroupIds.length) {
      throw createHttpError('Node group not found or has no testable nodes', 404);
    }

    return {
      results: [],
      switchedGroups: [],
      nodeGroups: settings.nodeGroups || [],
      nodeGroupTesting: manager.getNodeGroupTestingSnapshot(settings),
      core: manager.getStatus(),
      autoStarted: false
    };
  }

  const requestedNodeIds = [...new Set(
    eligibleGroups.flatMap((group) => manager.getEffectiveNodeGroupNodeIds(group, nodes))
  )];
  const measurement = await manager.measureNodeLatencies(requestedNodeIds, {
    autoStartCore: options.autoStartCore !== false
  });
  const testedAt = new Date().toISOString();
  let latestSettings = manager.persistNodeGroupLatencyResults(measurement.results || [], {
    settings: manager.getSettingsSnapshot(),
    testedAt
  }).settings;
  const switchedGroups = [];

  if (options.applySelection !== false) {
    for (const group of eligibleGroups) {
      const latestGroup = getNodeGroupById(latestSettings.nodeGroups || [], group.id);
      if (!latestGroup) {
        continue;
      }

      const preferred = manager.resolveLatencyPreferredNode(latestGroup, measurement.results || [], { nodes });
      if (!preferred || preferred.selectedNodeId === latestGroup.selectedNodeId) {
        continue;
      }

      const payload = await manager.selectNodeGroupNode(latestGroup.id, preferred.selectedNodeId);
      latestSettings = payload.settings;
      const switchState = manager.getNodeGroupLatencySwitchState(latestGroup.id);
      if (switchState) {
        switchState.lastSwitchAt = Date.now();
        switchState.consecutiveCurrentFailures = 0;
      }

      switchedGroups.push({
        groupId: latestGroup.id,
        previousNodeId: preferred.previousNodeId,
        selectedNodeId: preferred.selectedNodeId,
        latencyMs: preferred.latencyMs
      });

      if (!options.silent) {
        manager.store.appendLog(`[CoreManager] Latency priority switched ${latestGroup.id} -> ${preferred.selectedNodeId} (${preferred.latencyMs} ms)`);
      }
    }
  }

  return {
    results: measurement.results || [],
    switchedGroups,
    nodeGroups: latestSettings.nodeGroups || [],
    nodeGroupTesting: manager.getNodeGroupTestingSnapshot(latestSettings),
    core: manager.getStatus(),
    autoStarted: measurement.autoStarted
  };
};
