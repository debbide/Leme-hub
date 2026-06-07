import {
  buildInvalidNodeWarning,
  buildUniqueSubscriptionGroupName,
  createHttpError,
  deriveSubscriptionDisplayName,
  mergeUniqueNodes,
  normalizeSubscriptionRecord
} from './state-utils.js';

export const getSubscriptions = (manager) => manager.getSettingsSnapshot().subscriptions || [];

export const ensureStoredGroup = (settings, groupName) => {
  if (!groupName) {
    return settings;
  }

  const groups = Array.isArray(settings.groups) ? settings.groups : [];
  if (groups.includes(groupName)) {
    return settings;
  }

  return {
    ...settings,
    groups: [...groups, groupName]
  };
};

export const allocateSubscriptionGroupName = (manager, settings, preferredName, subscriptionId = null) => {
  const occupiedNames = new Set(manager.getGroups());
  for (const record of settings.subscriptions || []) {
    if (!record?.groupName || (subscriptionId && record.id === subscriptionId)) {
      continue;
    }
    occupiedNames.add(record.groupName);
  }

  return buildUniqueSubscriptionGroupName(preferredName, occupiedNames);
};

export const updateSubscriptionRecord = (manager, recordInput, options = {}) => {
  const settings = options.settings || manager.getSettingsSnapshot();
  const subscriptions = Array.isArray(settings.subscriptions) ? settings.subscriptions : [];
  const existingRecord = subscriptions.find((item) =>
    (recordInput.id && item.id === recordInput.id)
    || (recordInput.url && item.url === recordInput.url)
  ) || null;
  const nextRecord = normalizeSubscriptionRecord({
    ...existingRecord,
    ...recordInput,
    id: recordInput.id || existingRecord?.id || `subscription-${Date.now()}`,
    name: deriveSubscriptionDisplayName(recordInput.url || existingRecord?.url || '', recordInput.name || existingRecord?.name || '')
  }, existingRecord ? subscriptions.indexOf(existingRecord) : subscriptions.length);
  const nextSubscriptions = [
    ...subscriptions.filter((item) => item.id !== existingRecord?.id),
    nextRecord
  ];
  const nextSettings = {
    ...settings,
    subscriptions: nextSubscriptions
  };

  manager.store.saveSettings(nextSettings);
  return nextRecord;
};

export const updateSubscriptionRecordError = (manager, record, errorMessage) => {
  if (!record) {
    return null;
  }

  return updateSubscriptionRecord(manager, {
    ...record,
    lastStatus: 'error',
    lastError: String(errorMessage || '').trim() || 'Sync failed'
  });
};

export const findSubscriptionRecord = (input, settings = {}) => {
  const subscriptions = Array.isArray(settings.subscriptions) ? settings.subscriptions : [];
  if (typeof input === 'string') {
    const url = String(input || '').trim();
    return subscriptions.find((item) => item.url === url) || null;
  }

  const id = String(input?.id || '').trim();
  const url = String(input?.url || '').trim();
  if (id) {
    return subscriptions.find((item) => item.id === id) || null;
  }
  if (url) {
    return subscriptions.find((item) => item.url === url) || null;
  }
  return null;
};

export const deleteSubscription = async (manager, id) => {
  const settings = manager.getSettingsSnapshot();
  const subscription = findSubscriptionRecord({ id }, settings);
  if (!subscription) {
    throw createHttpError('Subscription not found', 404);
  }

  const remainingSubscriptions = (settings.subscriptions || []).filter((item) => item.id !== subscription.id);
  const remainingNodes = manager.store.getNodes().filter((node) => node.subscriptionUrl !== subscription.url);
  const remainingGroups = (settings.groups || []).filter((groupName) => {
    if (groupName !== subscription.groupName) {
      return true;
    }

    const stillUsedBySubscription = remainingSubscriptions.some((item) => item.groupName === groupName);
    const stillUsedByNode = remainingNodes.some((node) => node.group === groupName);
    return stillUsedBySubscription || stillUsedByNode;
  });

  manager.store.saveSettings({
    ...settings,
    groups: remainingGroups,
    subscriptions: remainingSubscriptions
  });

  const savedNodes = manager.saveNodes(remainingNodes);
  const applied = await manager.queueNodeChangesApply(savedNodes);
  return {
    subscription,
    subscriptions: manager.getSubscriptions(),
    groups: manager.getGroups(),
    ...applied
  };
};

export const syncSubscription = async (manager, input) => {
  const request = typeof input === 'string'
    ? { url: input }
    : (input && typeof input === 'object' ? input : {});
  let settings = manager.getSettingsSnapshot();
  const existingRecord = findSubscriptionRecord(request, settings);
  const url = String(request.url || existingRecord?.url || '').trim();
  if (!url) {
    throw createHttpError('Missing subscription url', 400);
  }

  const displayName = deriveSubscriptionDisplayName(url, request.name || existingRecord?.name || '');
  let groupName = existingRecord?.groupName || null;
  const groupOwnedByOtherSubscription = groupName && (settings.subscriptions || []).some((record) =>
    record.id !== existingRecord?.id && record.groupName === groupName
  );
  if (!groupName || groupOwnedByOtherSubscription) {
    groupName = allocateSubscriptionGroupName(manager, settings, displayName, existingRecord?.id || null);
  }

  let importedNodes;
  try {
    const activeNodeId = manager.resolveActiveNodeId(settings, manager.store.getNodes());
    importedNodes = await manager.proxyService.syncSubscription(url, {
      allowInternalProxy: manager.state.status === 'running',
      activeNodeId,
      localPort: activeNodeId ? manager.proxyService.getLocalPort(activeNodeId) : null,
      proxyListen: settings.proxyListenHost
    });
  } catch (error) {
    updateSubscriptionRecordError(manager, existingRecord, error.message);
    throw error;
  }

  if (!importedNodes.length) {
    updateSubscriptionRecordError(manager, existingRecord, 'Subscription returned no usable nodes');
    throw createHttpError('Subscription returned no usable nodes', 400);
  }

  const { validNodes, invalidNodes } = await manager.filterValidNodes(importedNodes);
  if (!validNodes.length) {
    const errorMessage = buildInvalidNodeWarning(invalidNodes) || 'Subscription returned no usable nodes';
    updateSubscriptionRecordError(manager, existingRecord, errorMessage);
    throw createHttpError(errorMessage, 400);
  }

  settings = ensureStoredGroup(settings, groupName);
  manager.store.saveSettings(settings);

  const urlsToReplace = new Set([url, existingRecord?.url].filter(Boolean));
  const existingNodes = manager.store.getNodes().filter((node) => !urlsToReplace.has(node.subscriptionUrl));
  const savedNodes = manager.saveNodes(mergeUniqueNodes(existingNodes, validNodes.map((node) => ({
    ...node,
    source: 'subscription',
    subscriptionUrl: url,
    ...(groupName ? { group: groupName } : {})
  }))));

  const applied = await manager.queueNodeChangesApply(savedNodes);
  const warning = [applied.warning, buildInvalidNodeWarning(invalidNodes)].filter(Boolean).join('；') || null;
  const subscription = updateSubscriptionRecord(manager, {
    id: existingRecord?.id,
    url,
    name: displayName,
    groupName,
    importedCount: validNodes.length,
    lastSyncedAt: new Date().toISOString(),
    lastNodeCount: applied.nodes.filter((node) => node.subscriptionUrl === url).length,
    lastStatus: 'success',
    lastError: null
  }, { settings: manager.getSettingsSnapshot() });

  return {
    importedCount: validNodes.length,
    invalidCount: invalidNodes.length,
    subscription,
    subscriptions: manager.getSubscriptions(),
    groups: manager.getGroups(),
    ...applied,
    warning
  };
};
