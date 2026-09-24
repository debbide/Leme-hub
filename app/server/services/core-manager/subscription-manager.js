import {
  buildInvalidNodeWarning,
  buildUniqueSubscriptionGroupName,
  createHttpError,
  deriveSubscriptionDisplayName,
  getNodeSignature,
  mergeUniqueNodes,
  normalizeSubscriptionRecord
} from './state-utils.js';
import { createSecureId } from '../../../shared/ids.js';

export const SUBSCRIPTION_AUTO_UPDATE_TICK_MS = 5 * 60 * 1000;

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
    id: recordInput.id || existingRecord?.id || `subscription-${createSecureId()}`,
    name: deriveSubscriptionDisplayName(recordInput.url || existingRecord?.url || '', recordInput.name || existingRecord?.name || '')
  }, existingRecord ? subscriptions.indexOf(existingRecord) : subscriptions.length);
  const nextSubscriptions = [
    ...subscriptions.filter((item) => item.id !== existingRecord?.id),
    nextRecord
  ];
  // Persist only the subscriptions list. The snapshot may be stale (callers
  // reach here after network syncs), and saveSettings merges over fresh disk
  // state, so a whole-object write would revert unrelated concurrent edits.
  manager.store.saveSettings({ subscriptions: nextSubscriptions });
  // Keep the auto-update poller in sync with the feature flag: it should
  // only exist while at least one subscription opted in.
  manager.rescheduleSubscriptionAutoUpdateTimer?.();
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

export const updateSubscriptionSettings = (manager, id, patch = {}) => {
  const settings = manager.getSettingsSnapshot();
  const record = findSubscriptionRecord({ id }, settings);
  if (!record) {
    throw createHttpError('Subscription not found', 404);
  }

  const next = { ...record };
  if ('name' in patch) {
    next.name = String(patch.name || '').trim();
  }
  if ('autoUpdate' in patch) {
    next.autoUpdate = patch.autoUpdate === true || patch.autoUpdate === 'true';
  }
  if ('updateIntervalHours' in patch) {
    const hours = Number.parseInt(patch.updateIntervalHours, 10);
    if (Number.isInteger(hours) && hours >= 1 && hours <= 168) {
      next.updateIntervalHours = hours;
    } else {
      throw createHttpError('updateIntervalHours must be between 1 and 168', 400);
    }
  }

  return updateSubscriptionRecord(manager, next, { settings });
};

export const getSubscriptionsDueForAutoUpdate = (manager, now = Date.now()) => {
  const subscriptions = manager.getSettingsSnapshot().subscriptions || [];
  return subscriptions.filter((record) => {
    if (!record?.autoUpdate) {
      return false;
    }
    const intervalMs = (record.updateIntervalHours || 24) * 3600 * 1000;
    const lastSynced = record.lastSyncedAt ? Date.parse(record.lastSyncedAt) : 0;
    return !Number.isFinite(lastSynced) || now - lastSynced >= intervalMs;
  });
};

export const runSubscriptionAutoUpdateTick = async (manager, options = {}) => {
  const now = options.now ?? Date.now();
  if (manager._subscriptionAutoUpdateBusy) {
    return { ran: false, reason: 'busy' };
  }
  manager._subscriptionAutoUpdateBusy = true;
  try {
    const due = getSubscriptionsDueForAutoUpdate(manager, now);
    const results = [];
    for (const record of due) {
      try {
        await syncSubscription(manager, { id: record.id, url: record.url });
        results.push({ id: record.id, ok: true });
      } catch (error) {
        results.push({ id: record.id, ok: false, error: error.message });
      }
    }
    return { ran: true, results };
  } finally {
    manager._subscriptionAutoUpdateBusy = false;
  }
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
  manager.rescheduleSubscriptionAutoUpdateTimer?.();
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

  // `settings` was snapshotted before the network sync above; writing it back
  // whole would clobber any field changed meanwhile. Persist only the group
  // list, re-reading current groups so a concurrent group edit is preserved.
  if (groupName) {
    const current = manager.getSettingsSnapshot();
    const currentGroups = Array.isArray(current.groups) ? current.groups : [];
    if (!currentGroups.includes(groupName)) {
      manager.store.saveSettings({ groups: [...currentGroups, groupName] });
    }
  }

  const urlsToReplace = new Set([url, existingRecord?.url].filter(Boolean));
  const allNodes = manager.store.getNodes();
  const replacedNodes = allNodes.filter((node) => urlsToReplace.has(node.subscriptionUrl));
  const existingNodes = allNodes.filter((node) => !urlsToReplace.has(node.subscriptionUrl));

  // Stable ids across re-syncs: an unchanged node (same signature) keeps its
  // previous id, so the active node selection, groups, latency cache entries
  // and local port mappings survive a subscription refresh.
  const signatureToPreviousId = new Map();
  for (const node of replacedNodes) {
    const signature = getNodeSignature(node);
    if (signature && !signatureToPreviousId.has(signature)) {
      signatureToPreviousId.set(signature, node.id);
    }
  }
  const usedIds = new Set(existingNodes.map((node) => node.id));
  const incomingNodes = validNodes.map((node) => {
    const withMeta = {
      ...node,
      source: 'subscription',
      subscriptionUrl: url,
      ...(groupName ? { group: groupName } : {})
    };
    const previousId = signatureToPreviousId.get(getNodeSignature(withMeta));
    if (previousId && !usedIds.has(previousId)) {
      usedIds.add(previousId);
      return { ...withMeta, id: previousId };
    }
    return withMeta;
  });

  const savedNodes = manager.saveNodes(mergeUniqueNodes(existingNodes, incomingNodes));

  const subscriptionNodeIds = savedNodes
    .filter((node) => node.subscriptionUrl === url)
    .map((node) => node.id);
  const applied = await manager.queueNodeChangesApply(savedNodes, { waitNodeIds: subscriptionNodeIds });
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
