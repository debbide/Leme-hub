import { ACTIVE_NODE_SELECTOR_TAG, getNodeGroupOutboundTag } from '../../../proxy/ProxyService.js';
import {
  NODE_GROUP_SWITCH_COOLDOWN_MS,
  NODE_GROUP_SWITCH_DELTA_MS,
  NODE_GROUP_SWITCH_FAIL_THRESHOLD,
  getNodeGroupById,
  getNodeGroupSelectedNodeId,
  normalizeIsoTimestamp,
  normalizeNodeGroupAutoTestIntervalSec,
  normalizeNodeGroupLatencyCache,
  normalizeSystemProxyAutoSwitchIntervalSec
} from './state-utils.js';

export const resolveActiveNodeId = (manager, settings = manager.store.getSettings(), nodes = manager.store.getNodes()) => {
  if (settings.activeNodeId && nodes.some((node) => node.id === settings.activeNodeId)) {
    return settings.activeNodeId;
  }

  return nodes[0]?.id || null;

};

export const resolveSystemProxyDefaultNodeId = (manager, settings = manager.getSettingsSnapshot(), nodes = manager.store.getNodes()) => {
  if (settings.systemProxyAutoSwitchEnabled) {
    const group = getNodeGroupById(settings.nodeGroups || [], settings.systemProxyAutoSwitchGroupId);
    const selectedNodeId = getNodeGroupSelectedNodeId(group);
    if (selectedNodeId && nodes.some((node) => node.id === selectedNodeId)) {
      return selectedNodeId;
    }
  }

  return manager.resolveActiveNodeId(settings, nodes);

};

export const getActiveNodeSelectorTarget = (manager, settings = manager.getSettingsSnapshot(), nodes = manager.store.getNodes()) => {
  const activeNodeId = manager.resolveActiveNodeId(settings, nodes);
  if (!activeNodeId || !nodes.some((node) => node.id === activeNodeId)) {
    return null;
  }

  return {
    groupTag: ACTIVE_NODE_SELECTOR_TAG,
    outboundTag: `out-${activeNodeId}`,
    selectedNodeId: activeNodeId
  };

};

export const getNodeGroupSelectorTarget = (manager, group, nodes = manager.store.getNodes()) => {
  if (!group || typeof group !== 'object' || !group.id) {
    return null;
  }

  const selectedNodeId = getNodeGroupSelectedNodeId(group);
  if (!selectedNodeId || !nodes.some((node) => node.id === selectedNodeId)) {
    return null;
  }

  return {
    groupTag: getNodeGroupOutboundTag(group.id),
    outboundTag: `out-${selectedNodeId}`,
    selectedNodeId
  };

};

export const closeRunningConnections = async (manager, reason = 'selector switch') => {
  if (typeof manager.connectionsService?.closeAllConnections !== 'function') {
    return false;
  }

  try {
    await manager.connectionsService.closeAllConnections();
    manager.store.appendLog(`[CoreManager] Closed existing connections after ${reason}`);
    return true;
  } catch (error) {
    manager.store.appendLog(`[CoreManager] Failed to close existing connections after ${reason}: ${error.message}`);
    return false;
  }

};

export const applyRunningActiveNodeSelector = async (manager, settings = manager.getSettingsSnapshot(), nodes = manager.store.getNodes()) => {
  const target = manager.getActiveNodeSelectorTarget(settings, nodes);
  if (!target) {
    return false;
  }

  await manager.clashApiService.setSelector(target.groupTag, target.outboundTag);
  await manager.closeRunningConnections('active node switch');
  manager.store.appendLog(`[CoreManager] Selector ${target.groupTag} -> ${target.outboundTag}`);
  return true;

};

export const getEffectiveNodeGroupNodeIds = (manager, group, nodes = manager.store.getNodes()) => {
  const validNodeIds = new Set((nodes || []).map((node) => node.id));
  return Array.isArray(group?.nodeIds)
    ? group.nodeIds
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId, index, array) => nodeId && validNodeIds.has(nodeId) && array.indexOf(nodeId) === index)
    : [];

};

export const applyRunningNodeGroupSelector = async (manager, group, nodes = manager.store.getNodes()) => {
  const target = manager.getNodeGroupSelectorTarget(group, nodes);
  if (!target) {
    return false;
  }

  await manager.clashApiService.setSelector(target.groupTag, target.outboundTag);
  manager.store.appendLog(`[CoreManager] Selector ${target.groupTag} -> ${target.outboundTag}`);
  return true;

};

export const syncRunningSelectors = async (manager, settings = manager.getSettingsSnapshot(), nodes = manager.store.getNodes()) => {
  if (manager.state.status !== 'running') {
    return 0;
  }

  const nodeGroups = Array.isArray(settings?.nodeGroups) ? settings.nodeGroups : [];
  const selectableGroups = nodeGroups.filter((group) => manager.getNodeGroupSelectorTarget(group, nodes));
  const activeSelectorTarget = manager.getActiveNodeSelectorTarget(settings, nodes);
  if (!activeSelectorTarget && !selectableGroups.length) {
    return 0;
  }

  await manager.clashApiService.waitUntilReady();
  let appliedCount = 0;
  if (activeSelectorTarget && await manager.applyRunningActiveNodeSelector(settings, nodes)) {
    appliedCount += 1;
  }
  for (const group of selectableGroups) {
    if (await manager.applyRunningNodeGroupSelector(group, nodes)) {
      appliedCount += 1;
    }
  }
  return appliedCount;

};

export const getNodeGroupLatencySwitchState = (manager, groupId) => {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    return null;
  }

  if (!manager._nodeGroupLatencySwitchState.has(normalizedGroupId)) {
    manager._nodeGroupLatencySwitchState.set(normalizedGroupId, {
      lastSwitchAt: 0,
      consecutiveCurrentFailures: 0
    });
  }

  return manager._nodeGroupLatencySwitchState.get(normalizedGroupId);

};

export const getNodeGroupTestingSnapshot = (manager, settings = manager.getSettingsSnapshot()) => {
  return {
    intervalSec: normalizeNodeGroupAutoTestIntervalSec(settings.nodeGroupAutoTestIntervalSec),
    latencyCache: normalizeNodeGroupLatencyCache(settings.nodeGroupLatencyCache)
  };

};

export const persistNodeGroupLatencyResults = (manager, results = [], options = {}) => {
  const settings = options.settings || manager.getSettingsSnapshot();
  const testedAt = normalizeIsoTimestamp(options.testedAt) || new Date().toISOString();
  const existingCache = normalizeNodeGroupLatencyCache(settings.nodeGroupLatencyCache);
  const mergedResults = {
    ...(existingCache.results || {})
  };

  for (const result of Array.isArray(results) ? results : []) {
    const nodeId = String(result?.id || '').trim();
    if (!nodeId) {
      continue;
    }

    const ok = !!result.ok;
    const normalizedEntry = {
      ok,
      latencyMs: null,
      error: null,
      updatedAt: testedAt
    };

    if (ok) {
      const latencyMs = Number.parseInt(result.latencyMs, 10);
      if (!Number.isInteger(latencyMs) || latencyMs < 0) {
        continue;
      }
      normalizedEntry.latencyMs = latencyMs;
    } else {
      const error = String(result.error || '').trim();
      normalizedEntry.error = error ? error.slice(0, 160) : 'failed';
    }

    mergedResults[nodeId] = normalizedEntry;
  }

  const latencyCache = {
    updatedAt: testedAt,
    results: mergedResults
  };
  const savedSettings = manager.store.saveSettings({
    ...settings,
    nodeGroupLatencyCache: latencyCache
  });

  return {
    settings: savedSettings,
    latencyCache
  };

};

export const resolveLatencyPreferredNode = (manager, group, testResults = [], options = {}) => {
  const effectiveNodeIds = manager.getEffectiveNodeGroupNodeIds(group, options.nodes || manager.store.getNodes());
  if (!effectiveNodeIds.length) {
    return null;
  }

  const resultById = new Map(
    (Array.isArray(testResults) ? testResults : [])
      .map((item) => [String(item?.id || '').trim(), item])
      .filter(([nodeId]) => Boolean(nodeId))
  );
  const candidateResults = effectiveNodeIds
    .map((nodeId) => resultById.get(nodeId))
    .filter((item) => item && item.ok && Number.isFinite(Number(item.latencyMs)))
    .sort((a, b) => Number(a.latencyMs) - Number(b.latencyMs));

  if (!candidateResults.length) {
    return null;
  }

  const switchState = manager.getNodeGroupLatencySwitchState(group?.id);
  const currentId = String(group?.selectedNodeId || '').trim();
  const currentResult = currentId ? resultById.get(currentId) : null;
  const best = candidateResults[0];
  let shouldSwitch = false;

  if (!currentId || !effectiveNodeIds.includes(currentId)) {
    shouldSwitch = true;
  } else if (!currentResult || !currentResult.ok) {
    if (switchState) {
      switchState.consecutiveCurrentFailures += 1;
      if (switchState.consecutiveCurrentFailures >= NODE_GROUP_SWITCH_FAIL_THRESHOLD && best.id !== currentId) {
        shouldSwitch = true;
      }
    }
  } else {
    if (switchState) {
      switchState.consecutiveCurrentFailures = 0;
      const cooldownPassed = (Date.now() - switchState.lastSwitchAt) >= NODE_GROUP_SWITCH_COOLDOWN_MS;
      const gain = Number(currentResult.latencyMs) - Number(best.latencyMs);
      if (best.id !== currentId && cooldownPassed && gain >= NODE_GROUP_SWITCH_DELTA_MS) {
        shouldSwitch = true;
      }
    }
  }

  if (!shouldSwitch || best.id === currentId) {
    return null;
  }

  return {
    selectedNodeId: best.id,
    previousNodeId: currentId || null,
    latencyMs: Number(best.latencyMs)
  };

};

export const getSystemProxyAutoSwitchProfile = (manager, settings = manager.getSettingsSnapshot(), nodes = manager.store.getNodes()) => {
  const group = getNodeGroupById(settings.nodeGroups || [], settings.systemProxyAutoSwitchGroupId);
  const selectedNodeId = getNodeGroupSelectedNodeId(group);
  const effectiveNodeId = manager.resolveSystemProxyDefaultNodeId(settings, nodes);
  const effectiveNode = nodes.find((node) => node.id === effectiveNodeId) || null;
  const lastAt = normalizeIsoTimestamp(settings.systemProxyAutoSwitchLastAt);
  const intervalSec = normalizeSystemProxyAutoSwitchIntervalSec(settings.systemProxyAutoSwitchIntervalSec);
  const nextAt = settings.systemProxyAutoSwitchEnabled && lastAt
    ? new Date(Date.parse(lastAt) + (intervalSec * 1000)).toISOString()
    : null;

  return {
    enabled: !!settings.systemProxyAutoSwitchEnabled,
    groupId: settings.systemProxyAutoSwitchGroupId || null,
    intervalSec,
    lastAt,
    nextAt,
    group: group || null,
    selectedNodeId,
    selectedNode: selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) || null : null,
    effectiveNodeId,
    effectiveNode
  };

};

export const runSystemProxyAutoSwitchTick = async (manager) => {
  if (manager._systemProxyAutoSwitchBusy) {
    return false;
  }

  const settings = manager.getSettingsSnapshot();
  if (manager.state.status !== 'running' || !settings.systemProxyEnabled || !settings.systemProxyAutoSwitchEnabled) {
    return false;
  }

  const group = getNodeGroupById(settings.nodeGroups || [], settings.systemProxyAutoSwitchGroupId);
  const selectedNodeId = getNodeGroupSelectedNodeId(group);
  if (!group || !selectedNodeId) {
    return false;
  }

  const intervalMs = normalizeSystemProxyAutoSwitchIntervalSec(settings.systemProxyAutoSwitchIntervalSec) * 1000;
  const nowMs = Date.now();
  const lastAtMs = settings.systemProxyAutoSwitchLastAt ? Date.parse(settings.systemProxyAutoSwitchLastAt) : Number.NaN;
  if (Number.isFinite(lastAtMs) && (nowMs - lastAtMs) < intervalMs) {
    return false;
  }

  const nodes = manager.store.getNodes();
  const validNodeIds = (Array.isArray(group.nodeIds) ? group.nodeIds : [])
    .map((nodeId) => String(nodeId || '').trim())
    .filter((nodeId) => nodes.some((node) => node.id === nodeId));
  if (!validNodeIds.length) {
    return false;
  }

  manager._systemProxyAutoSwitchBusy = true;
  try {
    const currentSelectedNodeId = validNodeIds.includes(selectedNodeId) ? selectedNodeId : (validNodeIds[0] || null);
    const candidateNodeIds = validNodeIds.length > 1
      ? validNodeIds.filter((nodeId) => nodeId !== currentSelectedNodeId)
      : validNodeIds;
    const nextSelectedNodeId = candidateNodeIds[Math.floor(Math.random() * candidateNodeIds.length)] || currentSelectedNodeId;
    const nextLastAt = new Date(nowMs).toISOString();

    if (!nextSelectedNodeId || nextSelectedNodeId === currentSelectedNodeId) {
      await manager.updateSettings({
        systemProxyAutoSwitchLastAt: nextLastAt
      });
      return false;
    }

    manager.store.appendLog(`[CoreManager] System proxy auto-switch selected ${nextSelectedNodeId} from group ${group.id}`);
    await manager.selectNodeGroupNode(group.id, nextSelectedNodeId);
    await manager.updateSettings({
      systemProxyAutoSwitchLastAt: nextLastAt
    });
    return true;
  } catch (error) {
    manager.store.appendLog(`[CoreManager] System proxy auto-switch failed: ${error.message}`);
    return false;
  } finally {
    manager._systemProxyAutoSwitchBusy = false;
  }

};

export const runNodeGroupAutoTestTick = async (manager) => {
  if (manager._nodeGroupAutoTestBusy) {
    return false;
  }

  if (manager.state.status !== 'running') {
    return false;
  }

  const settings = manager.getSettingsSnapshot();
  if (!Array.isArray(settings.nodeGroups) || !settings.nodeGroups.length) {
    return false;
  }

  const intervalMs = normalizeNodeGroupAutoTestIntervalSec(settings.nodeGroupAutoTestIntervalSec) * 1000;
  const lastAtMs = settings.nodeGroupLatencyCache?.updatedAt
    ? Date.parse(settings.nodeGroupLatencyCache.updatedAt)
    : Number.NaN;
  if (Number.isFinite(lastAtMs) && (Date.now() - lastAtMs) < intervalMs) {
    return false;
  }

  manager._nodeGroupAutoTestBusy = true;
  try {
    const payload = await manager.testNodeGroups([], {
      autoStartCore: false,
      silent: true
    });
    return Array.isArray(payload.results) && payload.results.length > 0;
  } catch (error) {
    manager.store.appendLog(`[CoreManager] Node group auto-test failed: ${error.message}`);
    return false;
  } finally {
    manager._nodeGroupAutoTestBusy = false;
  }

};
