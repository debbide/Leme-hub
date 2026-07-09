import { DEFAULT_SPEEDTEST_URL, ROUTING_MODES } from '../../../shared/constants.js';
import { normalizeHost } from '../../../shared/network.js';
import {
  assignStableLocalPorts,
  createHttpError,
  hasNodeGroupsRuntimeChange,
  legacyRoutingItemsFromSettings,
  normalizeCustomRules,
  normalizeIsoTimestamp,
  normalizeNodeGroupAutoTestIntervalSec,
  normalizeNodeGroupLatencyCache,
  normalizeNodeGroups,
  normalizeRoutingItems,
  normalizeRulesets,
  normalizeSubscriptionRecord,
  normalizeSystemProxyAutoSwitchIntervalSec,
  normalizeSystemProxyAutoSwitchSettings,
  routingItemsToLegacySettings,
  validatePort
} from './state-utils.js';

const MAINTENANCE_SETTINGS_KEYS = new Set([
  'nodeGroupLatencyCache',
  'systemProxyAutoSwitchLastAt'
]);

export const ACTIVE_NODE_CHANGE_SOURCES = new Set([
  'dashboard-active-node-select',
  'nodes-list-dblclick'
]);

export const isAllowedActiveNodeChangeSource = (value) => ACTIVE_NODE_CHANGE_SOURCES.has(String(value || '').trim());

const shouldBackupSettingsPatch = (patch = {}, options = {}) => {
  if (Object.prototype.hasOwnProperty.call(options, 'backup')) {
    return options.backup !== false;
  }

  const keys = Object.keys(patch || {});
  return !keys.length || keys.some((key) => !MAINTENANCE_SETTINGS_KEYS.has(key));
};

const formatNodeForLog = (nodeId, nodes = []) => {
  const id = String(nodeId || '').trim();
  if (!id) return '-';
  const node = nodes.find((item) => item?.id === id);
  const name = String(node?.name || node?.server || '').trim();
  return name ? `${id} (${name})` : id;
};

const normalizeActiveNodeChangeSource = (value) => {
  const source = String(value || '').trim();
  return source || 'unknown';
};

export const getSettingsSnapshot = (manager) => {
  const settings = manager.store.getSettings();
  const normalizedSubscriptions = Array.isArray(settings.subscriptions)
    ? settings.subscriptions.map(normalizeSubscriptionRecord).filter(Boolean)
    : [];
  const normalizedNodeGroupAutoTestIntervalSec = normalizeNodeGroupAutoTestIntervalSec(settings.nodeGroupAutoTestIntervalSec);
  const normalizedNodeGroupLatencyCache = normalizeNodeGroupLatencyCache(settings.nodeGroupLatencyCache);
  const normalizedSpeedtestUrl = String(settings.speedtestUrl || DEFAULT_SPEEDTEST_URL).trim() || DEFAULT_SPEEDTEST_URL;
  const nodes = manager.store.getNodes();

  let normalizedNodeGroups;
  try {
    normalizedNodeGroups = Array.isArray(settings.nodeGroups) ? normalizeNodeGroups(settings.nodeGroups, nodes) : [];
  } catch (error) {
    manager.store.appendLog(`[CoreManager] Invalid persisted node groups ignored: ${error.message}`);
    normalizedNodeGroups = [];
  }

  const normalizedSystemProxyAutoSwitch = normalizeSystemProxyAutoSwitchSettings(settings, normalizedNodeGroups);

  let normalizedRoutingItems;
  let customRules;
  let rulesets;
  const hasLegacyRoutingSettings = (Array.isArray(settings.customRules) && settings.customRules.length > 0)
    || (Array.isArray(settings.rulesets) && settings.rulesets.length > 0);

  if (Array.isArray(settings.routingItems) && (settings.routingItems.length > 0 || !hasLegacyRoutingSettings)) {
    try {
      normalizedRoutingItems = normalizeRoutingItems(settings.routingItems, normalizedNodeGroups);
    } catch (error) {
      manager.store.appendLog(`[CoreManager] Invalid persisted routingItems recovered from legacy rules: ${error.message}`);
      try {
        normalizedRoutingItems = normalizeRoutingItems(
          legacyRoutingItemsFromSettings(settings, normalizedNodeGroups),
          normalizedNodeGroups
        );
      } catch (legacyError) {
        manager.store.appendLog(`[CoreManager] Invalid persisted routing settings ignored: ${legacyError.message}`);
        normalizedRoutingItems = [];
      }
    }
  } else {
    try {
      normalizedRoutingItems = normalizeRoutingItems(
        legacyRoutingItemsFromSettings(settings, normalizedNodeGroups),
        normalizedNodeGroups
      );
    } catch (error) {
      manager.store.appendLog(`[CoreManager] Invalid persisted routing settings ignored: ${error.message}`);
      normalizedRoutingItems = [];
    }
  }

  ({ customRules, rulesets } = routingItemsToLegacySettings(normalizedRoutingItems));

  return {
    ...settings,
    routingItems: normalizedRoutingItems,
    customRules,
    rulesets,
    nodeGroups: normalizedNodeGroups,
    subscriptions: normalizedSubscriptions,
    nodeGroupAutoTestIntervalSec: normalizedNodeGroupAutoTestIntervalSec,
    nodeGroupLatencyCache: normalizedNodeGroupLatencyCache,
    speedtestUrl: normalizedSpeedtestUrl,
    systemProxyAutoSwitchEnabled: normalizedSystemProxyAutoSwitch.enabled,
    systemProxyAutoSwitchGroupId: normalizedSystemProxyAutoSwitch.groupId,
    systemProxyAutoSwitchIntervalSec: normalizedSystemProxyAutoSwitch.intervalSec,
    systemProxyAutoSwitchLastAt: normalizedSystemProxyAutoSwitch.lastAt
  };

};

export const updateSettings = async (manager, patch, options = {}) => {
  const persistedSettings = manager.store.getSettings();
  const current = manager.getSettingsSnapshot();
  const hasPatchRoutingItems = Object.prototype.hasOwnProperty.call(patch, 'routingItems');
  const hasPatchCustomRules = Object.prototype.hasOwnProperty.call(patch, 'customRules');
  const hasPatchRulesets = Object.prototype.hasOwnProperty.call(patch, 'rulesets');
  const hasPatchLegacyRouting = hasPatchCustomRules || hasPatchRulesets;
  const hasPatchNodeGroups = Object.prototype.hasOwnProperty.call(patch, 'nodeGroups');
  const preservePersistedRouting = !hasPatchRoutingItems && !hasPatchLegacyRouting && !hasPatchNodeGroups;
  const next = {
    ...current,
    ...patch
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'proxyListenHost')) {
    next.proxyListenHost = normalizeHost(next.proxyListenHost);
    if (!next.proxyListenHost) {
      throw createHttpError('proxyListenHost is required', 400);
    }
  }

  next.systemProxyEnabled = !!next.systemProxyEnabled;
  next.systemProxyCaptureEnabled = !!next.systemProxyCaptureEnabled;
  next.tlsFragmentEnabled = !!next.tlsFragmentEnabled;
  if (manager.runtimeMode === 'desktop'
    && Object.prototype.hasOwnProperty.call(patch, 'systemProxyEnabled')
    && !Object.prototype.hasOwnProperty.call(patch, 'systemProxyCaptureEnabled')) {
    next.systemProxyCaptureEnabled = next.systemProxyEnabled;
  }
  if (!next.systemProxyEnabled) {
    next.systemProxyCaptureEnabled = false;
  }
  if (next.systemProxyCaptureEnabled) {
    next.systemProxyEnabled = true;
  }

  if (next.routingMode && !ROUTING_MODES.includes(next.routingMode)) {
    throw createHttpError('Invalid routing mode', 400);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'dnsFinal')) {
    const dnsFinal = String(next.dnsFinal || '').trim();
    if (!['dns-remote', 'dns-local'].includes(dnsFinal)) {
      throw createHttpError('dnsFinal must be dns-remote or dns-local', 400);
    }
    next.dnsFinal = dnsFinal;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'dnsStrategy')) {
    const dnsStrategy = String(next.dnsStrategy || '').trim();
    if (!['prefer_ipv4', 'ipv4_only', 'prefer_ipv6', 'ipv6_only'].includes(dnsStrategy)) {
      throw createHttpError('dnsStrategy is invalid', 400);
    }
    next.dnsStrategy = dnsStrategy;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'dnsRemoteServer')) {
    next.dnsRemoteServer = String(next.dnsRemoteServer || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'dnsDirectServer')) {
    next.dnsDirectServer = String(next.dnsDirectServer || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'dnsBootstrapServer')) {
    next.dnsBootstrapServer = String(next.dnsBootstrapServer || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'speedtestUrl')) {
    next.speedtestUrl = String(next.speedtestUrl || '').trim() || DEFAULT_SPEEDTEST_URL;
  }

  const proxyBasePort = validatePort(next.proxyBasePort, 'proxyBasePort');
  const systemProxySocksPort = validatePort(next.systemProxySocksPort, 'systemProxySocksPort');
  const systemProxyHttpPort = validatePort(next.systemProxyHttpPort, 'systemProxyHttpPort');
  if (Object.prototype.hasOwnProperty.call(patch, 'customRules') && !Array.isArray(next.customRules)) {
    throw createHttpError('customRules must be an array', 400);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rulesets') && !Array.isArray(next.rulesets)) {
    throw createHttpError('rulesets must be an array', 400);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingItems') && !Array.isArray(next.routingItems)) {
    throw createHttpError('routingItems must be an array', 400);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroups') && !Array.isArray(next.nodeGroups)) {
    throw createHttpError('nodeGroups must be an array', 400);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroupAutoTestIntervalSec')) {
    const parsedIntervalSec = Number.parseInt(patch.nodeGroupAutoTestIntervalSec, 10);
    if (!Number.isInteger(parsedIntervalSec)) {
      throw createHttpError('nodeGroupAutoTestIntervalSec must be an integer', 400);
    }
    next.nodeGroupAutoTestIntervalSec = normalizeNodeGroupAutoTestIntervalSec(parsedIntervalSec);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroupLatencyCache')) {
    if (!patch.nodeGroupLatencyCache || typeof patch.nodeGroupLatencyCache !== 'object') {
      throw createHttpError('nodeGroupLatencyCache must be an object', 400);
    }
    next.nodeGroupLatencyCache = normalizeNodeGroupLatencyCache(patch.nodeGroupLatencyCache);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchEnabled')) {
    next.systemProxyAutoSwitchEnabled = !!patch.systemProxyAutoSwitchEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchGroupId')) {
    next.systemProxyAutoSwitchGroupId = patch.systemProxyAutoSwitchGroupId == null
      ? null
      : String(patch.systemProxyAutoSwitchGroupId).trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchIntervalSec')) {
    const parsedIntervalSec = Number.parseInt(patch.systemProxyAutoSwitchIntervalSec, 10);
    if (!Number.isInteger(parsedIntervalSec)) {
      throw createHttpError('systemProxyAutoSwitchIntervalSec must be an integer', 400);
    }
    next.systemProxyAutoSwitchIntervalSec = normalizeSystemProxyAutoSwitchIntervalSec(parsedIntervalSec);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchLastAt')) {
    next.systemProxyAutoSwitchLastAt = normalizeIsoTimestamp(patch.systemProxyAutoSwitchLastAt);
  }

  const nodeGroups = Array.isArray(next.nodeGroups)
    ? normalizeNodeGroups(next.nodeGroups, manager.store.getNodes())
    : current.nodeGroups;
  const systemProxyAutoSwitch = normalizeSystemProxyAutoSwitchSettings(next, nodeGroups, {
    strict: Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchEnabled')
      || Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchGroupId')
  });
  const shouldResetSystemProxyAutoSwitchLastAt = systemProxyAutoSwitch.enabled
    && !Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchLastAt')
    && (
      (Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchEnabled') && !!patch.systemProxyAutoSwitchEnabled)
      || Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchGroupId')
      || Object.prototype.hasOwnProperty.call(patch, 'systemProxyAutoSwitchIntervalSec')
    );
  const systemProxyAutoSwitchLastAt = shouldResetSystemProxyAutoSwitchLastAt
    ? new Date().toISOString()
    : systemProxyAutoSwitch.lastAt;

  if (Object.prototype.hasOwnProperty.call(patch, 'customRules') && !Object.prototype.hasOwnProperty.call(patch, 'routingItems')) {
    next.customRules = normalizeCustomRules(next.customRules || [], nodeGroups);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rulesets') && !Object.prototype.hasOwnProperty.call(patch, 'routingItems')) {
    next.rulesets = normalizeRulesets(next.rulesets || [], nodeGroups);
  }

  let routingItems;
  let customRules;
  let rulesets;

  const normalizeLegacyRoutingPatch = () => {
    const legacyCustomRules = hasPatchCustomRules
      ? normalizeCustomRules(next.customRules || [], nodeGroups)
      : current.customRules;
    const legacyRulesets = hasPatchRulesets
      ? normalizeRulesets(next.rulesets || [], nodeGroups)
      : current.rulesets;
    const legacyRoutingItems = normalizeRoutingItems(
      legacyRoutingItemsFromSettings({ customRules: legacyCustomRules, rulesets: legacyRulesets }, nodeGroups),
      nodeGroups
    );

    return {
      routingItems: legacyRoutingItems,
      customRules: legacyCustomRules,
      rulesets: legacyRulesets
    };
  };

  if (preservePersistedRouting) {
    routingItems = Array.isArray(persistedSettings.routingItems) ? persistedSettings.routingItems : current.routingItems;
    customRules = Array.isArray(persistedSettings.customRules) ? persistedSettings.customRules : current.customRules;
    rulesets = Array.isArray(persistedSettings.rulesets) ? persistedSettings.rulesets : current.rulesets;
  } else if (hasPatchRoutingItems) {
    const normalizedRoutingItems = normalizeRoutingItems(next.routingItems, nodeGroups);
    if (hasPatchLegacyRouting) {
      const legacy = normalizeLegacyRoutingPatch();
      if (legacy.routingItems.length > normalizedRoutingItems.length) {
        manager.store.appendLog(`[CoreManager] Ignored stale routingItems payload with ${normalizedRoutingItems.length} item(s); legacy routing fields contain ${legacy.routingItems.length} item(s)`);
        routingItems = legacy.routingItems;
        customRules = legacy.customRules;
        rulesets = legacy.rulesets;
      } else {
        routingItems = normalizedRoutingItems;
        const legacyFromItems = routingItemsToLegacySettings(routingItems);
        customRules = legacyFromItems.customRules;
        rulesets = legacyFromItems.rulesets;
      }
    } else {
      routingItems = normalizedRoutingItems;
      const legacy = routingItemsToLegacySettings(routingItems);
      customRules = legacy.customRules;
      rulesets = legacy.rulesets;
    }
  } else if (hasPatchLegacyRouting) {
    customRules = Array.isArray(next.customRules)
      ? normalizeCustomRules(next.customRules, nodeGroups)
      : current.customRules;
    rulesets = Array.isArray(next.rulesets)
      ? normalizeRulesets(next.rulesets, nodeGroups)
      : current.rulesets;
    routingItems = legacyRoutingItemsFromSettings({ customRules, rulesets }, nodeGroups);
  } else {
    routingItems = Array.isArray(next.routingItems)
      ? normalizeRoutingItems(next.routingItems, nodeGroups)
      : current.routingItems;
    const legacy = routingItemsToLegacySettings(routingItems);
    customRules = legacy.customRules;
    rulesets = legacy.rulesets;
  }

  if ((hasPatchRoutingItems || hasPatchLegacyRouting)
    && !options.allowEmptyRoutingClear
    && Array.isArray(current.routingItems)
    && current.routingItems.length > 0
    && routingItems.length === 0) {
    manager.store.appendLog(`[CoreManager] Refused empty routing payload that would clear ${current.routingItems.length} existing item(s)`);
    routingItems = current.routingItems;
    const legacy = routingItemsToLegacySettings(routingItems);
    customRules = legacy.customRules;
    rulesets = legacy.rulesets;
  }

  if (systemProxySocksPort === systemProxyHttpPort) {
    throw createHttpError('systemProxySocksPort and systemProxyHttpPort must be different', 400);
  }

  const nodes = manager.store.getNodes();
  const normalizedNodes = assignStableLocalPorts(nodes, proxyBasePort);
  const occupiedManualPorts = new Set(normalizedNodes.map((node) => Number.parseInt(node.local_port, 10)).filter((port) => Number.isInteger(port)));

  if (occupiedManualPorts.has(systemProxySocksPort) || systemProxySocksPort === proxyBasePort) {
    throw createHttpError('systemProxySocksPort conflicts with manual proxy ports', 400);
  }

  if (occupiedManualPorts.has(systemProxyHttpPort) || systemProxyHttpPort === proxyBasePort) {
    throw createHttpError('systemProxyHttpPort conflicts with manual proxy ports', 400);
  }

  const hasPatchActiveNodeId = Object.prototype.hasOwnProperty.call(patch, 'activeNodeId');
  const requestedActiveNodeId = hasPatchActiveNodeId
    ? (patch.activeNodeId == null ? null : String(patch.activeNodeId).trim() || null)
    : undefined;
  if (hasPatchActiveNodeId && options.requireActiveNodeChangeSource === true && !isAllowedActiveNodeChangeSource(options.activeNodeChangeSource)) {
    throw createHttpError('activeNodeId can only be changed by an explicit active node switch action', 400);
  }
  const previousActiveNodeId = manager.resolveActiveNodeId(current, nodes);
  const activeNodeId = hasPatchActiveNodeId
    ? manager.resolveActiveNodeId({ ...next, activeNodeId: requestedActiveNodeId }, nodes)
    : (current.activeNodeId == null ? null : String(current.activeNodeId).trim() || null);
  const willChangeAutoStart = Object.prototype.hasOwnProperty.call(patch, 'autoStart');

  const systemProxyCaptureWasEnabled = !!current.systemProxyCaptureEnabled;
  const systemProxyCaptureWillBeDisabled = systemProxyCaptureWasEnabled && !next.systemProxyCaptureEnabled;
  const saved = manager.store.saveSettings({
    ...next,
    proxyListenHost: next.proxyListenHost,
    proxyBasePort,
    tlsFragmentEnabled: !!next.tlsFragmentEnabled,
    systemProxyEnabled: !!next.systemProxyEnabled,
    systemProxyCaptureEnabled: !!next.systemProxyCaptureEnabled,
    systemProxySocksPort,
    systemProxyHttpPort,
    routingItems,
    customRules,
    rulesets,
    nodeGroups,
    activeNodeId,
    autoStart: !!next.autoStart,
    nodeGroupAutoTestIntervalSec: normalizeNodeGroupAutoTestIntervalSec(next.nodeGroupAutoTestIntervalSec),
    nodeGroupLatencyCache: normalizeNodeGroupLatencyCache(next.nodeGroupLatencyCache),
    systemProxyAutoSwitchEnabled: systemProxyAutoSwitch.enabled,
    systemProxyAutoSwitchGroupId: systemProxyAutoSwitch.groupId,
    systemProxyAutoSwitchIntervalSec: systemProxyAutoSwitch.intervalSec,
    systemProxyAutoSwitchLastAt: systemProxyAutoSwitchLastAt
  }, {
    backup: shouldBackupSettingsPatch(patch, options),
    allowEmptyRoutingClear: options.allowEmptyRoutingClear === true
  });
  if (hasPatchActiveNodeId && previousActiveNodeId !== activeNodeId) {
    manager.store.appendLog(`[CoreManager] Active node change source=${normalizeActiveNodeChangeSource(options.activeNodeChangeSource)} old=${formatNodeForLog(previousActiveNodeId, nodes)} new=${formatNodeForLog(activeNodeId, nodes)} requested=${formatNodeForLog(requestedActiveNodeId, nodes)}`);
  }
  if (systemProxyCaptureWillBeDisabled) {
    const disabledProxy = await manager.systemProxyManager.disable();
    manager.state.systemProxy = manager.buildSystemProxyState(disabledProxy);
  }
  // Apply the OS-level autostart change AFTER persisting settings so the
  // snapshot read -> saveSettings write stays synchronous and atomic (no await
  // window in which a concurrent writer's fields could be clobbered).
  let autoStart = manager.state.autoStart;
  if (willChangeAutoStart) {
    autoStart = patch.autoStart
      ? await manager.autoStartManager.enable()
      : await manager.autoStartManager.disable();
  }
  manager.state.autoStart = manager.buildAutoStartState(autoStart);
  manager.refreshConnectionsServiceBaseUrl(saved);
  manager.proxyService.runtimeOptions = manager.getRuntimeOptions(saved, nodes);

  const runtimeSensitiveKeys = ['activeNodeId', 'routingMode', 'routingItems', 'customRules', 'rulesets', 'dnsRemoteServer', 'dnsDirectServer', 'dnsBootstrapServer', 'dnsFinal', 'dnsStrategy', 'tlsFragmentEnabled', 'proxyListenHost', 'systemProxySocksPort', 'systemProxyHttpPort', 'systemProxyAutoSwitchEnabled', 'systemProxyAutoSwitchGroupId'];
  const changedRuntimeKeys = runtimeSensitiveKeys.filter((key) => Object.prototype.hasOwnProperty.call(patch, key));
  if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroups') && hasNodeGroupsRuntimeChange(current.nodeGroups || [], nodeGroups, {
    ...current,
    ...saved
  })) {
    changedRuntimeKeys.push('nodeGroups');
  }
  const hasRuntimeChanges = changedRuntimeKeys.length > 0;
  const shouldHotSwitchActiveNode = manager.state.status === 'running'
    && changedRuntimeKeys.length === 1
    && changedRuntimeKeys[0] === 'activeNodeId';
  let shouldAutoRestart = manager.state.status === 'running'
    && changedRuntimeKeys.some((key) => key !== 'activeNodeId');
  let hotSwitchedActiveNode = false;

  let core = manager.getStatus();
  if (shouldHotSwitchActiveNode) {
    try {
      await manager.applyRunningActiveNodeSelector(saved, nodes, {
        reason: 'active node switch'
      });
      hotSwitchedActiveNode = true;
    } catch (error) {
      manager.store.appendLog(`[CoreManager] Active selector hot-switch failed, falling back to restart: ${error.message}`);
      shouldAutoRestart = true;
    }
  }
  if (shouldAutoRestart) {
    core = await manager.restart();
  }

  const snapshot = manager.getSettingsSnapshot();
  return {
    settings: { ...snapshot },
    proxy: manager.getProxyProfile(),
    restartRequired: hasRuntimeChanges && !shouldAutoRestart && !hotSwitchedActiveNode ? manager.getRestartRequired() : false,
    autoRestarted: shouldAutoRestart,
    core
  };

};
