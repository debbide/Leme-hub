import {
  AUTO_COUNTRY_NODE_GROUP_PREFIX,
  NODE_GROUP_ICON_MODES,
  NODE_GROUP_TYPES,
  buildCountryGroupName,
  createHttpError,
  createNodeId,
  hasNodeGroupsRuntimeChange,
  normalizeCountryCode,
  normalizeNodeGroups
} from './state-utils.js';

const buildNodeGroupChangeResult = async (manager, previousNodeGroups, savedNodes = manager.store.getNodes()) => {
  const nodeGroups = manager.getNodeGroups();
  if (hasNodeGroupsRuntimeChange(previousNodeGroups || [], nodeGroups, manager.getSettingsSnapshot())) {
    const applied = await manager.queueNodeChangesApply(savedNodes);
    return {
      nodeGroups,
      ...applied
    };
  }

  return {
    nodeGroups,
    ...await manager.buildSavedNodeChangeResult()
  };
};

export const getGroups = (manager) => {
  const groups = new Set(manager.getSettingsSnapshot().groups || []);
  for (const node of manager.store.getNodes()) {
    if (node.group) groups.add(node.group);
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
};

export const createGroup = async (manager, name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw createHttpError('Group name cannot be empty', 400);
  const settings = manager.getSettingsSnapshot();
  const groups = [...new Set([...(settings.groups || []), trimmed])];
  manager.store.saveSettings({ ...settings, groups });
  if (groups.includes(trimmed)) return { groups: manager.getGroups() };
  manager.store.saveSettings({ ...settings, groups: [...groups, trimmed] });
  return { groups: manager.getGroups() };
};

export const setNodeGroup = async (manager, nodeIds, group) => {
  const previousNodes = manager.store.getNodes();
  const previousNodeGroups = manager.getSettingsSnapshot().nodeGroups || [];
  const ids = new Set(Array.isArray(nodeIds) ? nodeIds : []);
  const nodes = previousNodes.map((node) => {
    if (!ids.has(node.id)) return node;
    if (node.source === 'subscription' || node.subscriptionUrl) {
      throw createHttpError('Subscription nodes must stay in their dedicated group', 400);
    }
    return { ...node, group: group || null };
  });
  const savedNodes = manager.saveNodes(nodes);
  const applied = manager.shouldApplyNodeRuntimeChanges(manager.normalizeNodes(previousNodes), savedNodes)
    ? await manager.queueNodeChangesApply(savedNodes)
    : await buildNodeGroupChangeResult(manager, previousNodeGroups, savedNodes);
  return { groups: manager.getGroups(), ...applied };
};

export const renameGroup = async (manager, oldName, newName) => {
  const trimmedNew = String(newName || '').trim();
  if (!trimmedNew) throw createHttpError('Group name cannot be empty', 400);
  const nodes = manager.store.getNodes().map((node) =>
    node.group === oldName ? { ...node, group: trimmedNew } : node
  );
  const settings = manager.getSettingsSnapshot();
  const groups = (settings.groups || []).map((group) => group === oldName ? trimmedNew : group);
  const subscriptions = (settings.subscriptions || []).map((record) =>
    record.groupName === oldName ? { ...record, groupName: trimmedNew } : record
  );
  manager.store.saveSettings({ ...settings, groups, subscriptions });
  manager.saveNodes(nodes);
  return manager.buildSavedNodeChangeResult();
};

export const deleteGroup = async (manager, groupName) => {
  const settings = manager.getSettingsSnapshot();
  const boundSubscription = (settings.subscriptions || []).find((record) => record.groupName === groupName);
  if (boundSubscription) {
    throw createHttpError('This group is managed by a subscription. Delete the subscription instead.', 400);
  }

  const nodes = manager.store.getNodes().map((node) =>
    node.group === groupName ? { ...node, group: null } : node
  );
  const groups = (settings.groups || []).filter((item) => item !== groupName);
  manager.store.saveSettings({ ...settings, groups });
  manager.saveNodes(nodes);
  return manager.buildSavedNodeChangeResult();
};

export const groupNodesByCountry = async (manager) => {
  const previousNodes = manager.store.getNodes();
  const previousNodeGroups = manager.getSettingsSnapshot().nodeGroups || [];
  const nodeRecords = await manager.getNodeRecords();
  const countryByNodeId = new Map(
    nodeRecords.map((node) => [node.id, normalizeCountryCode(node.countryCode)])
  );

  let groupedCount = 0;
  let skippedCount = 0;
  const nextNodes = manager.store.getNodes().map((node) => {
    const countryCode = countryByNodeId.get(node.id);
    if (!countryCode) {
      skippedCount += 1;
      return node;
    }

    groupedCount += 1;
    return {
      ...node,
      group: buildCountryGroupName(countryCode)
    };
  });

  if (!groupedCount) {
    throw createHttpError('No nodes with resolvable country information', 400);
  }

  const savedNodes = manager.saveNodes(nextNodes);
  manager.syncAutoCountryNodeGroups(savedNodes, countryByNodeId);
  const applied = manager.shouldApplyNodeRuntimeChanges(manager.normalizeNodes(previousNodes), savedNodes)
    ? await manager.queueNodeChangesApply(savedNodes)
    : await buildNodeGroupChangeResult(manager, previousNodeGroups, savedNodes);
  return {
    groupedCount,
    skippedCount,
    groups: manager.getGroups(),
    nodeGroups: manager.getNodeGroups(),
    ...applied
  };
};

export const setNodeCountryOverride = async (manager, nodeId, countryCode) => {
  const previousNodes = manager.store.getNodes();
  const previousNodeGroups = manager.getSettingsSnapshot().nodeGroups || [];
  const normalizedOverride = normalizeCountryCode(countryCode);
  const nodes = [...previousNodes];
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) {
    throw createHttpError('Node not found', 404);
  }

  const nextNode = {
    ...nodes[index]
  };
  if (normalizedOverride) {
    nextNode.countryCodeOverride = normalizedOverride;
  } else {
    delete nextNode.countryCodeOverride;
  }
  nodes[index] = nextNode;

  const savedNodes = manager.saveNodes(nodes);
  const nodeRecords = await manager.getNodeRecords();
  const countryByNodeId = new Map(
    nodeRecords.map((node) => [node.id, normalizeCountryCode(node.countryCode)])
  );
  manager.syncAutoCountryNodeGroups(savedNodes, countryByNodeId);
  const applied = manager.shouldApplyNodeRuntimeChanges(manager.normalizeNodes(previousNodes), savedNodes)
    ? await manager.queueNodeChangesApply(savedNodes)
    : await buildNodeGroupChangeResult(manager, previousNodeGroups, savedNodes);
  return {
    node: applied.nodes.find((item) => item.id === nodeId) || null,
    groups: manager.getGroups(),
    nodeGroups: manager.getNodeGroups(),
    ...applied
  };
};

export const syncAutoCountryNodeGroups = (manager, nodes, countryByNodeId = null) => {
  const settings = manager.getSettingsSnapshot();
  const allNodeGroups = Array.isArray(settings.nodeGroups) ? settings.nodeGroups : [];
  const manualNodeGroups = allNodeGroups.filter((group) => !String(group.id || '').startsWith(AUTO_COUNTRY_NODE_GROUP_PREFIX));
  const existingAutoGroupMap = new Map(
    allNodeGroups
      .filter((group) => String(group.id || '').startsWith(AUTO_COUNTRY_NODE_GROUP_PREFIX))
      .map((group) => [group.id, group])
  );

  let resolvedCountryByNodeId = countryByNodeId;
  if (!resolvedCountryByNodeId) {
    resolvedCountryByNodeId = new Map();
    for (const node of nodes || []) {
      resolvedCountryByNodeId.set(node.id, normalizeCountryCode(node.countryCodeOverride));
    }
  }

  const nodeIdsByCountry = new Map();
  for (const node of nodes || []) {
    const code = normalizeCountryCode(resolvedCountryByNodeId.get(node.id));
    if (!code) continue;
    if (!nodeIdsByCountry.has(code)) {
      nodeIdsByCountry.set(code, []);
    }
    nodeIdsByCountry.get(code).push(node.id);
  }

  const autoNodeGroups = Array.from(nodeIdsByCountry.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([countryCode, nodeIds]) => {
      const id = `${AUTO_COUNTRY_NODE_GROUP_PREFIX}${countryCode.toLowerCase()}`;
      const existing = existingAutoGroupMap.get(id);
      const selectedNodeId = nodeIds.includes(existing?.selectedNodeId) ? existing.selectedNodeId : (nodeIds[0] || null);
      return {
        id,
        name: buildCountryGroupName(countryCode),
        type: 'country',
        countryCode,
        iconMode: 'auto',
        iconEmoji: '',
        note: '',
        nodeIds,
        selectedNodeId
      };
    });

  const normalizedNodeGroups = normalizeNodeGroups([...manualNodeGroups, ...autoNodeGroups], nodes || []);
  manager.store.saveSettings({
    ...settings,
    nodeGroups: normalizedNodeGroups
  });
};

export const getNodeGroups = (manager) => manager.getSettingsSnapshot().nodeGroups || [];

export const getNodeGroupsResolved = async (manager) => {
  const nodes = manager.store.getNodes();
  if (!nodes.length) {
    return manager.getNodeGroups();
  }

  try {
    const nodeRecords = await manager.getNodeRecords();
    const countryByNodeId = new Map(
      nodeRecords.map((node) => [node.id, normalizeCountryCode(node.countryCode)])
    );
    manager.syncAutoCountryNodeGroups(nodes, countryByNodeId);
  } catch {
    // Keep existing node group state when geo enrichment is unavailable.
  }

  return manager.getNodeGroups();
};

export const reorderNodeGroups = async (manager, orderedIds = []) => {
  const settings = manager.getSettingsSnapshot();
  const currentGroups = settings.nodeGroups || [];
  const validGroupIds = new Set(currentGroups.map((group) => group.id));
  const normalizedOrder = [...new Set((Array.isArray(orderedIds) ? orderedIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => validGroupIds.has(id)))];

  const nextGroups = [...currentGroups].sort((a, b) => {
    const indexA = normalizedOrder.indexOf(a.id);
    const indexB = normalizedOrder.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const result = await manager.updateSettings({
    nodeGroups: nextGroups,
    groupSortOrder: normalizedOrder
  });
  return {
    ...result,
    nodeGroups: manager.getNodeGroups(),
    groupSortOrder: manager.getSettingsSnapshot().groupSortOrder || []
  };
};

export const createNodeGroup = async (manager, payload = {}) => {
  const type = NODE_GROUP_TYPES.includes(String(payload.type || '').trim())
    ? String(payload.type || '').trim()
    : 'custom';
  const countryCode = normalizeCountryCode(payload.countryCode);
  const name = String(payload.name || '').trim() || (type === 'country' && countryCode ? buildCountryGroupName(countryCode) : '');
  if (!name) throw createHttpError('Node group name cannot be empty', 400);

  const iconMode = NODE_GROUP_ICON_MODES.includes(String(payload.iconMode || '').trim())
    ? String(payload.iconMode || '').trim()
    : 'auto';
  const iconEmoji = typeof payload.iconEmoji === 'string' ? payload.iconEmoji.trim().slice(0, 4) : '';
  const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 200) : '';
  const nodeIds = Array.isArray(payload.nodeIds) ? payload.nodeIds : [];
  const selectedNodeId = payload.selectedNodeId == null ? null : String(payload.selectedNodeId).trim();

  const settings = manager.getSettingsSnapshot();
  const currentGroups = settings.nodeGroups || [];
  const groupId = createNodeId();
  const nextGroups = [...currentGroups, {
    id: groupId,
    name,
    type,
    countryCode,
    iconMode,
    iconEmoji,
    note,
    nodeIds,
    selectedNodeId
  }];
  const nextSortOrder = [...(settings.groupSortOrder || []).filter((id) => currentGroups.some((group) => group.id === id)), groupId];
  return manager.updateSettings({ nodeGroups: nextGroups, groupSortOrder: nextSortOrder });
};

export const updateNodeGroup = async (manager, groupId, patch = {}) => {
  if (!groupId) {
    throw createHttpError('Node group id is required', 400);
  }

  const settings = manager.getSettingsSnapshot();
  const existing = (settings.nodeGroups || []).find((group) => group.id === groupId);
  if (!existing) {
    throw createHttpError('Node group not found', 404);
  }

  const nextGroup = {
    ...existing,
    ...(Object.prototype.hasOwnProperty.call(patch, 'name') ? { name: patch.name } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'type') ? { type: patch.type } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'countryCode') ? { countryCode: patch.countryCode } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'iconMode') ? { iconMode: patch.iconMode } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'iconEmoji') ? { iconEmoji: patch.iconEmoji } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'note') ? { note: patch.note } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'selectedNodeId') ? { selectedNodeId: patch.selectedNodeId } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'nodeIds') ? { nodeIds: patch.nodeIds } : {})
  };

  const nextGroups = (settings.nodeGroups || []).map((group) => group.id === groupId ? nextGroup : group);
  return manager.updateSettings({ nodeGroups: nextGroups });
};

export const deleteNodeGroup = async (manager, groupId) => {
  const settings = manager.getSettingsSnapshot();
  const nextGroups = (settings.nodeGroups || []).filter((group) => group.id !== groupId);
  return manager.updateSettings({
    nodeGroups: nextGroups,
    groupSortOrder: (settings.groupSortOrder || []).filter((id) => id !== groupId),
    customRules: (settings.customRules || []).map((rule) => rule.action === 'node_group' && rule.nodeGroupId === groupId ? { ...rule, action: 'default', nodeGroupId: null } : rule),
    rulesets: (settings.rulesets || []).map((ruleset) => ruleset.target === 'node_group' && ruleset.groupId === groupId ? { ...ruleset, target: 'default', groupId: null } : ruleset)
  });
};

export const updateNodeGroupNodes = async (manager, groupId, nodeIds) => {
  const settings = manager.getSettingsSnapshot();
  const normalizedIds = Array.isArray(nodeIds) ? nodeIds : [];
  const nextGroups = (settings.nodeGroups || []).map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      nodeIds: normalizedIds,
      selectedNodeId: normalizedIds.includes(group.selectedNodeId) ? group.selectedNodeId : (normalizedIds[0] || null)
    };
  });
  return manager.updateSettings({ nodeGroups: nextGroups });
};

export const selectNodeGroupNode = async (manager, groupId, selectedNodeId) => {
  const settings = manager.getSettingsSnapshot();
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    throw createHttpError('Node group id is required', 400);
  }

  const nodes = manager.store.getNodes();
  const existingGroup = (settings.nodeGroups || []).find((group) => group.id === normalizedGroupId);
  if (!existingGroup) {
    throw createHttpError('Node group not found', 404);
  }

  const normalizedSelectedNodeId = selectedNodeId == null ? null : String(selectedNodeId).trim();
  const nextGroups = normalizeNodeGroups(
    (settings.nodeGroups || []).map((group) => group.id === normalizedGroupId
      ? { ...group, selectedNodeId: normalizedSelectedNodeId }
      : group),
    nodes
  );
  const nextGroup = nextGroups.find((group) => group.id === normalizedGroupId) || null;

  if (manager.state.status === 'running') {
    await manager.clashApiService.waitUntilReady();
    await manager.applyRunningNodeGroupSelector(nextGroup, nodes);
  }

  const saved = manager.store.saveSettings({
    ...settings,
    nodeGroups: nextGroups
  });
  manager.proxyService.runtimeOptions = manager.getRuntimeOptions(saved, nodes);

  return {
    settings: { ...saved },
    proxy: manager.getProxyProfile(),
    restartRequired: false,
    autoRestarted: false,
    core: manager.getStatus()
  };
};
