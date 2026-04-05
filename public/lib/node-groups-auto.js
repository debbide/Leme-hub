export const getNodeGroupSwitchState = ({ groupId, nodeGroupAutoSwitchState }) => {
  const existing = nodeGroupAutoSwitchState.get(groupId) || {
    lastSwitchAt: 0,
    consecutiveCurrentFailures: 0,
  };
  nodeGroupAutoSwitchState.set(groupId, existing);
  return existing;
};

export const applyNodeGroupLatencyResults = ({ results = [], nodeGroupLatencyMap }) => {
  results.forEach((result) => {
    nodeGroupLatencyMap.set(result.id, {
      ok: Boolean(result.ok),
      latencyMs: result.latencyMs,
      error: result.error || null,
      updatedAt: new Date().toISOString(),
    });
  });
};

export const applyLatencyPrioritySwitch = async ({
  group,
  testResults = [],
  options = {},
  requestJson,
  nodeGroups,
  setNodeGroups,
  nodeGroupAutoSwitchState,
  routingNodeOptions,
  NODE_GROUP_SWITCH_FAIL_THRESHOLD,
  NODE_GROUP_SWITCH_COOLDOWN_MS,
  NODE_GROUP_SWITCH_DELTA_MS,
  showToast,
}) => {
  if (!group || !group.id || !Array.isArray(group.nodeIds) || !group.nodeIds.length) {
    return;
  }

  const resultById = new Map(testResults.map((item) => [item.id, item]));
  const candidateResults = group.nodeIds
    .map((nodeId) => resultById.get(nodeId))
    .filter((item) => item && item.ok && Number.isFinite(Number(item.latencyMs)))
    .sort((a, b) => Number(a.latencyMs) - Number(b.latencyMs));

  if (!candidateResults.length) {
    return;
  }

  const state = getNodeGroupSwitchState({ groupId: group.id, nodeGroupAutoSwitchState });
  const currentId = String(group.selectedNodeId || '');
  const currentResult = currentId ? resultById.get(currentId) : null;
  const best = candidateResults[0];
  let shouldSwitch = false;

  if (!currentId || !group.nodeIds.includes(currentId)) {
    shouldSwitch = true;
  } else if (!currentResult || !currentResult.ok) {
    state.consecutiveCurrentFailures += 1;
    if (state.consecutiveCurrentFailures >= NODE_GROUP_SWITCH_FAIL_THRESHOLD && best.id !== currentId) {
      shouldSwitch = true;
    }
  } else {
    state.consecutiveCurrentFailures = 0;
    const now = Date.now();
    const cooldownPassed = now - state.lastSwitchAt >= NODE_GROUP_SWITCH_COOLDOWN_MS;
    const gain = Number(currentResult.latencyMs) - Number(best.latencyMs);
    if (best.id !== currentId && cooldownPassed && gain >= NODE_GROUP_SWITCH_DELTA_MS) {
      shouldSwitch = true;
    }
  }

  if (!shouldSwitch || best.id === currentId) {
    return;
  }

  const payload = await requestJson('/api/node-groups/selection', {
    method: 'PUT',
    body: JSON.stringify({ id: group.id, selectedNodeId: best.id }),
  });
  setNodeGroups(payload.nodeGroups || nodeGroups);
  state.lastSwitchAt = Date.now();

  if (!options.silent) {
    const bestNode = routingNodeOptions.find((node) => node.id === best.id);
    showToast(`延时优先切换：${group.name} -> ${bestNode?.name || best.id} (${best.latencyMs} ms)`, 'success');
  }
};

export const testNodeGroupNodes = async ({
  groupId,
  options = {},
  nodeGroups,
  getEffectiveGroupNodeIds,
  nodeGroupTestingGroupIds,
  nodeGroupTestingNodeIds,
  renderNodeGroups,
  requestJson,
  nodeGroupLatencyMap,
  nodeGroupLastTestAt,
  setNodeGroupLastTestAt,
  renderNodeGroupTestMeta,
  persistNodeGroupTestingState,
  applyLatencyPrioritySwitch,
  updateCoreStatus,
  showToast,
}) => {
  const group = nodeGroups.find((item) => item.id === groupId);
  if (!group) return;
  const nodeIds = getEffectiveGroupNodeIds(group);
  if (!nodeIds.length) {
    if (!options.silent) showToast('该节点组暂无可测速节点', 'info');
    return;
  }
  if (nodeGroupTestingGroupIds.has(groupId)) return;

  nodeGroupTestingGroupIds.add(groupId);
  nodeIds.forEach((id) => nodeGroupTestingNodeIds.add(id));
  renderNodeGroups();

  try {
    const payload = await requestJson('/api/nodes/test-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: nodeIds }),
    });
    applyNodeGroupLatencyResults({ results: payload.results || [], nodeGroupLatencyMap });
    await applyLatencyPrioritySwitch(group, payload.results || [], options);
    setNodeGroupLastTestAt(new Date());
    renderNodeGroupTestMeta();
    persistNodeGroupTestingState();
    if (payload.core) updateCoreStatus(payload.core);
    if (!options.silent) {
      const successCount = (payload.results || []).filter((item) => item.ok).length;
      showToast(`分组测速完成：成功 ${successCount}/${nodeIds.length}`, successCount === nodeIds.length ? 'success' : 'info');
    }
  } catch (error) {
    if (!options.silent) {
      showToast(`分组测速失败: ${error.message}`, 'error');
    }
  } finally {
    nodeGroupTestingGroupIds.delete(groupId);
    nodeIds.forEach((id) => nodeGroupTestingNodeIds.delete(id));
    renderNodeGroups();
  }
};

export const testSingleNodeInGroup = async ({
  nodeId,
  options = {},
  nodeGroupTestingNodeIds,
  renderNodeGroups,
  requestJson,
  nodeGroupLatencyMap,
  setNodeGroupLastTestAt,
  renderNodeGroupTestMeta,
  persistNodeGroupTestingState,
  updateCoreStatus,
  showToast,
}) => {
  if (!nodeId || nodeGroupTestingNodeIds.has(nodeId)) return;
  nodeGroupTestingNodeIds.add(nodeId);
  renderNodeGroups();
  try {
    const payload = await requestJson('/api/nodes/test', {
      method: 'POST',
      body: JSON.stringify({ id: nodeId }),
    });
    applyNodeGroupLatencyResults({ results: [{ id: nodeId, ok: true, latencyMs: payload.latencyMs }], nodeGroupLatencyMap });
    setNodeGroupLastTestAt(new Date());
    renderNodeGroupTestMeta();
    persistNodeGroupTestingState();
    if (payload.core) updateCoreStatus(payload.core);
    if (!options.silent) showToast(`节点测速完成：${payload.latencyMs} ms`, 'success');
  } catch (error) {
    applyNodeGroupLatencyResults({ results: [{ id: nodeId, ok: false, error: error.message || '未知错误' }], nodeGroupLatencyMap });
    setNodeGroupLastTestAt(new Date());
    renderNodeGroupTestMeta();
    persistNodeGroupTestingState();
    if (!options.silent) showToast(`节点测速失败: ${error.message || '未知错误'}`, 'error');
  } finally {
    nodeGroupTestingNodeIds.delete(nodeId);
    renderNodeGroups();
  }
};

export const stopNodeGroupAutoTest = ({ nodeGroupAutoTestTimer, setNodeGroupAutoTestTimer, nodeGroupAutoTestStatusTimer, setNodeGroupAutoTestStatusTimer }) => {
  if (nodeGroupAutoTestTimer) {
    clearInterval(nodeGroupAutoTestTimer);
    setNodeGroupAutoTestTimer(null);
  }
  if (nodeGroupAutoTestStatusTimer) {
    clearInterval(nodeGroupAutoTestStatusTimer);
    setNodeGroupAutoTestStatusTimer(null);
  }
};

export const startNodeGroupAutoTest = ({ nodeGroupAutoTestTimer, setNodeGroupAutoTestTimer, setNodeGroupAutoTestStatusTimer, nodeGroups, getEffectiveGroupNodeIds, testNodeGroupNodes, nodeGroupAutoTestIntervalMs, renderNodeGroupTestMeta }) => {
  if (nodeGroupAutoTestTimer) return;
  setNodeGroupAutoTestTimer(setInterval(() => {
    nodeGroups.forEach((group) => {
      if (getEffectiveGroupNodeIds(group).length) {
        testNodeGroupNodes(group.id, { silent: true });
      }
    });
  }, nodeGroupAutoTestIntervalMs));

  setNodeGroupAutoTestStatusTimer(setInterval(() => {
    renderNodeGroupTestMeta();
  }, 1000));
  renderNodeGroupTestMeta();
};

export const runNodeGroupAutoBackfillIfNeeded = async ({ nodeGroups, getEffectiveGroupNodeIds, nodeGroupLatencyMap, testNodeGroupNodes }) => {
  const pendingGroups = nodeGroups.filter((group) => {
    const effectiveNodeIds = getEffectiveGroupNodeIds(group);
    if (!effectiveNodeIds.length) return false;
    const hasMeasuredNode = effectiveNodeIds.some((nodeId) => nodeGroupLatencyMap.has(nodeId));
    return !hasMeasuredNode;
  });

  for (const group of pendingGroups) {
    await testNodeGroupNodes(group.id, { silent: true });
  }
};
