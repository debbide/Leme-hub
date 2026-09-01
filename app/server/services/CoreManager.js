import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { SingBoxBinaryManager } from '../../proxy/SingBoxBinaryManager.js';
import { SingBoxNativeManager } from '../../proxy/SingBoxNativeManager.js';
import { ProxyService } from '../../proxy/ProxyService.js';
import { CoreRuntimeFactory } from '../../proxy/runtime/CoreRuntimeFactory.js';
import { AutoStartManager } from './AutoStartManager.js';
import { ClashApiService } from './ClashApiService.js';
import { ConnectionsService } from './ConnectionsService.js';
import { GeoIpService } from './GeoIpService.js';
import { RulesetDatabaseService } from './RulesetDatabaseService.js';
import { SystemProxyManager } from './SystemProxyManager.js';
import * as latencyManager from './core-manager/latency-manager.js';
import * as lifecycleManager from './core-manager/lifecycle-manager.js';
import * as nodeManager from './core-manager/node-manager.js';
import * as selectorManager from './core-manager/selector-manager.js';
import * as settingsManager from './core-manager/settings-manager.js';
import * as statusManager from './core-manager/status-manager.js';
import {
  appendRoutingHitHistory as appendRoutingHitHistoryEntry,
  createRoutingHitDisplayContext as createRoutingHitContext,
  decorateRoutingHitEntry as decorateRoutingHit,
  getRoutingHitGroupDisplayName as getRoutingHitGroupName,
  normalizeRoutingHitHistoryEntry as normalizeRoutingHitEntry,
  readRoutingHitHistory as readRoutingHitHistoryEntries
} from './core-manager/routing-hits.js';
import {
  allocateSubscriptionGroupName as allocateSubscriptionGroupNameForManager,
  deleteSubscription as deleteSubscriptionForManager,
  ensureStoredGroup as ensureSubscriptionStoredGroup,
  findSubscriptionRecord as findSubscriptionRecordFromSettings,
  getSubscriptions as getSubscriptionsForManager,
  syncSubscription as syncSubscriptionForManager,
  updateSubscriptionRecord as updateSubscriptionRecordForManager,
  updateSubscriptionRecordError as updateSubscriptionRecordErrorForManager
} from './core-manager/subscription-manager.js';
import {
  createGroup as createGroupForManager,
  createNodeGroup as createNodeGroupForManager,
  deleteGroup as deleteGroupForManager,
  deleteNodeGroup as deleteNodeGroupForManager,
  getGroups as getGroupsForManager,
  getNodeGroups as getNodeGroupsForManager,
  getNodeGroupsResolved as getNodeGroupsResolvedForManager,
  groupNodesByCountry as groupNodesByCountryForManager,
  renameGroup as renameGroupForManager,
  reorderNodeGroups as reorderNodeGroupsForManager,
  selectNodeGroupNode as selectNodeGroupNodeForManager,
  setNodeCountryOverride as setNodeCountryOverrideForManager,
  setNodeGroup as setNodeGroupForManager,
  syncAutoCountryNodeGroups as syncAutoCountryNodeGroupsForManager,
  updateNodeGroup as updateNodeGroupForManager,
  updateNodeGroupNodes as updateNodeGroupNodesForManager
} from './core-manager/node-group-manager.js';

import {
  NODE_GROUP_AUTO_TEST_TICK_MS,
  ROUTING_HIT_READ_LIMIT,
  SYSTEM_PROXY_AUTO_SWITCH_TICK_MS,
  createHttpError
} from './core-manager/state-utils.js';

export { assignStableLocalPorts } from './core-manager/state-utils.js';

export class CoreManager {
  constructor(paths, store, options = {}) {
    this.paths = paths;
    this.store = store;
    this.options = options;
    this.runtimeMode = options.env?.LEME_MODE === 'server' ? 'server' : 'desktop';
    this.state = {
      status: 'stopped',
      startedAt: null,
      lastError: null,
      executablePath: null,
      configPath: this.paths.configPath,
      binary: {
        status: 'missing',
        configuredPath: this.store.getSettings().singBoxBinaryPath,
        managedPath: this.paths.binDir,
        source: 'missing',
        lastError: null,
        version: null
      },
      systemProxy: {
        enabled: false,
        mode: 'unknown',
        provider: 'uninitialized',
        http: null,
        socks: null,
        lastError: null,
        supported: false,
        desiredEnabled: false
      },
      autoStart: {
        enabled: false,
        provider: 'uninitialized',
        supported: false,
        command: null,
        desiredEnabled: false
      }
    };

    this.binaryManager = new SingBoxBinaryManager(this.paths, {
      log: this.createLogger()
    });

    this.nativeManager = options.nativeManager || new SingBoxNativeManager(this.paths, {
      log: this.createLogger()
    });
    this.coreRuntimeFactory = options.coreRuntimeFactory || new CoreRuntimeFactory({
      nativeManager: this.nativeManager,
      log: this.createLogger()
    });

    this.state.binary = this.buildBinaryState();
    this.systemProxyManager = new SystemProxyManager();
    this.state.systemProxy = this.buildSystemProxyState();
    this.autoStartManager = new AutoStartManager({
      env: options.env,
      executablePath: options.autoStartExecutablePath
    });
    this.state.autoStart = this.buildAutoStartState();
    this.geoIpService = new GeoIpService(this.paths, {
      log: this.createLogger()
    });
    this.rulesetDatabaseService = new RulesetDatabaseService(this.paths, {
      log: this.createLogger()
    });
    // One random secret per process, shared by the generated config and both
    // Clash API clients, so only this app can drive the local controller.
    this.clashApiSecret = crypto.randomBytes(24).toString('hex');
    this.connectionsService = new ConnectionsService({ listenHost: this.store.getSettings().proxyListenHost, secret: this.clashApiSecret });
    this.clashApiService = new ClashApiService({ listenHost: this.store.getSettings().proxyListenHost, secret: this.clashApiSecret });
    const routingHitHistoryDir = this.paths.logsDir || this.paths.dataDir || this.paths.root;
    this.routingHitHistoryPath = path.join(routingHitHistoryDir, 'routing-hits.jsonl');
    if (!fs.existsSync(this.routingHitHistoryPath)) {
      fs.writeFileSync(this.routingHitHistoryPath, '');
    }

    this.proxyService = new ProxyService({
      configDir: this.paths.dataDir,
      projectRoot: this.paths.root,
      proxyListen: this.store.getSettings().proxyListenHost,
      basePort: this.store.getSettings().proxyBasePort,
      configFileName: this.paths.configPath.split(/[/\\]/).pop(),
      log: this.createLogger(),
      onRoutingHit: (hit) => this.appendRoutingHitHistory(hit),
      clashApiSecret: this.clashApiSecret
    });

    this._nodeApplyPendingNodes = null;
    this._nodeApplyPendingWaitNodeIds = null;
    this._nodeApplyTimer = null;
    this._nodeApplyRunning = false;
    this._nodeApplyLastError = null;
    this._nodeApplyLastAppliedAt = null;
    this._nodeApplyLastStartedAt = null;
    this._nodeApplyLastFailedAt = null;

    this._restartAttempts = 0;
    this._autoRestartTimer = null;
    this._expectedCoreExitProcess = null;
    this._lifecycleQueue = Promise.resolve();

    this._nodeGroupAutoTestBusy = false;
    this._nodeGroupLatencySwitchState = new Map();
    this._nodeGroupAutoTestTimer = setInterval(() => {
      void this.runNodeGroupAutoTestTick();
    }, NODE_GROUP_AUTO_TEST_TICK_MS);
    this._nodeGroupAutoTestTimer.unref?.();

    this._systemProxyAutoSwitchBusy = false;
    this._systemProxyGuardBusy = false;
    this._systemProxyAutoSwitchTimer = setInterval(() => {
      // Heal drifted OS proxy capture, then optional auto-switch.
      void this.runSystemProxyAutoSwitchTick();
    }, SYSTEM_PROXY_AUTO_SWITCH_TICK_MS);
    this._systemProxyAutoSwitchTimer.unref?.();
  }

  createLogger() {
    return {
      log: (message) => this.store.appendLog(message),
      error: (message) => this.store.appendLog(message),
      warn: (message) => this.store.appendLog(message)
    };
  }

  createRoutingHitDisplayContext(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes()) {
    return createRoutingHitContext(settings, nodes);
  }

  getRoutingHitGroupDisplayName(group) {
    return getRoutingHitGroupName(group, {
      resolveCountryName: (countryCode) => this.resolveCountryName(countryCode)
    });
  }

  decorateRoutingHitEntry(entry, context = this.createRoutingHitDisplayContext()) {
    return decorateRoutingHit(entry, context, {
      resolveCountryName: (countryCode) => this.resolveCountryName(countryCode)
    });
  }

  normalizeRoutingHitHistoryEntry(entry) {
    return normalizeRoutingHitEntry(entry);
  }

  readRoutingHitHistory(limit = ROUTING_HIT_READ_LIMIT) {
    return readRoutingHitHistoryEntries(this.routingHitHistoryPath, {
      context: this.createRoutingHitDisplayContext(),
      limit,
      resolveCountryName: (countryCode) => this.resolveCountryName(countryCode)
    });
  }

  appendRoutingHitHistory(entry) {
    try {
      appendRoutingHitHistoryEntry(this.routingHitHistoryPath, entry, {
        context: this.createRoutingHitDisplayContext(),
        resolveCountryName: (countryCode) => this.resolveCountryName(countryCode)
      });
    } catch (error) {
      this.store.appendLog(`[CoreManager] Failed to persist routing hit: ${error.message}`);
    }
  }

  getSettingsSnapshot() {
    return settingsManager.getSettingsSnapshot(this);
  }

  buildBinaryState(overrides = {}) {
    return statusManager.buildBinaryState(this, overrides);
  }

  buildSystemProxyState(overrides = {}) {
    return statusManager.buildSystemProxyState(this, overrides);
  }

  refreshConnectionsServiceBaseUrl(settings = this.getSettingsSnapshot()) {
    return statusManager.refreshConnectionsServiceBaseUrl(this, settings);
  }

  buildAutoStartState(overrides = {}) {
    return statusManager.buildAutoStartState(this, overrides);
  }

  resolveActiveNodeId(settings = this.store.getSettings(), nodes = this.store.getNodes()) {
    return selectorManager.resolveActiveNodeId(this, settings, nodes);
  }

  resolveSystemProxyDefaultNodeId(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes()) {
    return selectorManager.resolveSystemProxyDefaultNodeId(this, settings, nodes);
  }

  getActiveNodeSelectorTarget(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes()) {
    return selectorManager.getActiveNodeSelectorTarget(this, settings, nodes);
  }

  getNodeGroupSelectorTarget(group, nodes = this.store.getNodes()) {
    return selectorManager.getNodeGroupSelectorTarget(this, group, nodes);
  }

  async closeRunningConnections(reason = 'selector switch') {
    return selectorManager.closeRunningConnections(this, reason);
  }

  async applyRunningActiveNodeSelector(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes(), options = {}) {
    return selectorManager.applyRunningActiveNodeSelector(this, settings, nodes, options);
  }

  getEffectiveNodeGroupNodeIds(group, nodes = this.store.getNodes()) {
    return selectorManager.getEffectiveNodeGroupNodeIds(this, group, nodes);
  }

  async applyRunningNodeGroupSelector(group, nodes = this.store.getNodes()) {
    return selectorManager.applyRunningNodeGroupSelector(this, group, nodes);
  }

  async syncRunningSelectors(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes()) {
    return selectorManager.syncRunningSelectors(this, settings, nodes);
  }

  getNodeGroupLatencySwitchState(groupId) {
    return selectorManager.getNodeGroupLatencySwitchState(this, groupId);
  }

  getNodeGroupTestingSnapshot(settings = this.getSettingsSnapshot()) {
    return selectorManager.getNodeGroupTestingSnapshot(this, settings);
  }

  persistNodeGroupLatencyResults(results = [], options = {}) {
    return selectorManager.persistNodeGroupLatencyResults(this, results, options);
  }

  resolveLatencyPreferredNode(group, testResults = [], options = {}) {
    return selectorManager.resolveLatencyPreferredNode(this, group, testResults, options);
  }

  getSystemProxyAutoSwitchProfile(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes()) {
    return selectorManager.getSystemProxyAutoSwitchProfile(this, settings, nodes);
  }

  getProxyProfile() {
    return statusManager.getProxyProfile(this);
  }

  getBuiltinRulesets() {
    return statusManager.getBuiltinRulesets(this);
  }

  async refreshAutoStartState() {
    try {
      let status = await this.autoStartManager.getStatus();
      const desiredEnabled = !!this.getSettingsSnapshot().autoStart;

      if (desiredEnabled && (!status.enabled || !this.autoStartManager.matchesExpectedCommand(status.command))) {
        status = await this.autoStartManager.enable();
        this.store.appendLog('[CoreManager] Repaired auto-start command to match the current executable');
      }

      this.state.autoStart = this.buildAutoStartState(status);
    } catch (error) {
      this.store.appendLog(`[CoreManager] Failed to refresh auto-start state: ${error.message}`);
      this.state.autoStart = this.buildAutoStartState({
        enabled: false,
        command: null,
        lastError: error.message
      });
    }

    return this.state.autoStart;
  }

  getSubscriptions() {
    return getSubscriptionsForManager(this);
  }

  ensureStoredGroup(settings, groupName) {
    return ensureSubscriptionStoredGroup(settings, groupName);
  }

  allocateSubscriptionGroupName(settings, preferredName, subscriptionId = null) {
    return allocateSubscriptionGroupNameForManager(this, settings, preferredName, subscriptionId);
  }

  updateSubscriptionRecord(recordInput, options = {}) {
    return updateSubscriptionRecordForManager(this, recordInput, options);
  }

  updateSubscriptionRecordError(record, errorMessage) {
    return updateSubscriptionRecordErrorForManager(this, record, errorMessage);
  }

  findSubscriptionRecord(input, settings = this.getSettingsSnapshot()) {
    return findSubscriptionRecordFromSettings(input, settings);
  }

  async refreshSystemProxyState() {
    try {
      // Opportunistic heal when the UI/status polls: if capture is desired but
      // the OS proxy was cleared by another app, re-apply without a full toggle.
      await selectorManager.ensureSystemProxyCaptureHealthy(this).catch(() => false);
      const status = await this.systemProxyManager.getStatus();
      this.state.systemProxy = this.buildSystemProxyState(status);
    } catch (error) {
      this.state.systemProxy = this.buildSystemProxyState({
        lastError: error.message,
        mode: 'error'
      });
    }

    return this.state.systemProxy;
  }

  async cleanupSystemProxyAfterExit() {
    const desiredEnabled = !!this.getSettingsSnapshot().systemProxyCaptureEnabled;
    if (!desiredEnabled) {
      this.state.systemProxy = this.buildSystemProxyState(await this.systemProxyManager.getStatus().catch(() => this.buildSystemProxyState()));
      return this.state.systemProxy;
    }

    try {
      const disabled = await this.systemProxyManager.disable();
      this.state.systemProxy = this.buildSystemProxyState(disabled);
    } catch (error) {
      this.state.systemProxy = this.buildSystemProxyState({
        ...this.state.systemProxy,
        enabled: false,
        mode: 'error',
        lastError: error.message
      });
    }

    return this.state.systemProxy;
  }

  async applySystemProxy() {
    if (this.state.status !== 'running') {
      throw createHttpError('Core must be running before applying system proxy', 400);
    }

    let settings = this.getSettingsSnapshot();
    const needsTunOff = !!(settings.tunEnabled || settings.tunCaptureEnabled);
    const needsUnifiedEntry = !settings.systemProxyEnabled;
    if (needsTunOff || needsUnifiedEntry) {
      // tunEnabled and systemProxyEnabled are runtime-sensitive keys, so
      // updateSettings already rebuilds the running core. Only restart
      // ourselves if it somehow did not (e.g. no runtime change detected).
      const result = await this.updateSettings({
        ...(needsTunOff ? { tunEnabled: false, tunCaptureEnabled: false } : {}),
        ...(needsUnifiedEntry ? { systemProxyEnabled: true, systemProxyCaptureEnabled: false } : {})
      });
      if (!result.autoRestarted) {
        await this.restart();
      }
      settings = this.getSettingsSnapshot();
    }

    const status = await this.systemProxyManager.apply({
      host: settings.proxyListenHost,
      httpPort: settings.systemProxyHttpPort,
      socksPort: settings.systemProxySocksPort
    });

    if (!this.getSettingsSnapshot().systemProxyCaptureEnabled) {
      await this.updateSettings({ systemProxyCaptureEnabled: true });
    }
    this.state.systemProxy = this.buildSystemProxyState(status);
    return this.state.systemProxy;
  }

  async cleanupTunCaptureAfterExit() {
    const settings = this.getSettingsSnapshot();
    if (!settings.tunCaptureEnabled) {
      return statusManager.getTunStatus(this);
    }
    try {
      await this.updateSettings({ tunCaptureEnabled: false }, { backup: false });
    } catch {
      // best effort on crash/exit paths
    }
    return statusManager.getTunStatus(this);
  }

  async enableTun() {
    if (!statusManager.isTunSupportedPlatform()) {
      throw createHttpError(`TUN is not supported on ${process.platform}`, 400);
    }

    let settings = this.getSettingsSnapshot();
    if (settings.systemProxyCaptureEnabled) {
      await this.disableSystemProxy();
      settings = this.getSettingsSnapshot();
    }

    // Always re-apply safe Windows TUN defaults when enabling: stale settings from
    // early builds (stack=system, strict_route=true, mtu=9000) cause total blackout.
    const tunPatch = {
      tunEnabled: true,
      tunCaptureEnabled: false,
      systemProxyEnabled: false,
      systemProxyCaptureEnabled: false
    };
    if (process.platform === 'win32') {
      tunPatch.tunStack = 'mixed';
      tunPatch.tunStrictRoute = false;
      tunPatch.tunMtu = 1500;
    }
    if (!settings.tunEnabled || settings.systemProxyEnabled || settings.systemProxyCaptureEnabled
      || (process.platform === 'win32' && (settings.tunStack === 'system' || settings.tunStrictRoute !== false || Number(settings.tunMtu) > 1500))) {
      await this.updateSettings(tunPatch);
    }

    if (this.state.status === 'running') {
      await this.restart();
    } else {
      await this.start();
    }

    return statusManager.getTunStatus(this);
  }

  async disableTun() {
    const settings = this.getSettingsSnapshot();
    if (settings.tunEnabled || settings.tunCaptureEnabled) {
      await this.updateSettings({
        tunEnabled: false,
        tunCaptureEnabled: false
      });
    }

    if (this.state.status === 'running') {
      await this.restart();
    }

    return statusManager.getTunStatus(this);
  }

  isManagedSystemProxyStatus(status, settings = this.getSettingsSnapshot()) {
    if (!status?.enabled) {
      return false;
    }

    const expectedHttpPort = Number(settings.systemProxyHttpPort);
    const expectedSocksPort = Number(settings.systemProxySocksPort);
    return Number(status.http?.port) === expectedHttpPort || Number(status.socks?.port) === expectedSocksPort;
  }

  async disableSystemProxy() {
    const status = await this.systemProxyManager.disable();
    if (this.getSettingsSnapshot().systemProxyCaptureEnabled) {
      await this.updateSettings({ systemProxyCaptureEnabled: false });
    }
    this.state.systemProxy = this.buildSystemProxyState(status);
    return this.state.systemProxy;
  }

  async diagnoseSystemProxy() {
    const settings = this.getSettingsSnapshot();
    if (!settings.systemProxyEnabled || !settings.systemProxyCaptureEnabled || typeof this.systemProxyManager.diagnose !== 'function') {
      return null;
    }

    return this.systemProxyManager.diagnose({
      host: settings.proxyListenHost,
      httpPort: settings.systemProxyHttpPort,
      socksPort: settings.systemProxySocksPort
    });
  }

  getRuntimeOptions(settings = this.getSettingsSnapshot(), nodes = this.store.getNodes()) {
    return statusManager.getRuntimeOptions(this, settings, nodes);
  }

  async updateSettings(patch, options = {}) {
    return settingsManager.updateSettings(this, patch, options);
  }

  getStatus() {
    return statusManager.getStatus(this);
  }

  async runSystemProxyAutoSwitchTick() {
    return selectorManager.runSystemProxyAutoSwitchTick(this);
  }

  async runNodeGroupAutoTestTick() {
    return selectorManager.runNodeGroupAutoTestTick(this);
  }

  async initializeGeoIp() {
    await this.geoIpService.initialize();
  }

  async initializeRulesetDatabase() {
    await this.rulesetDatabaseService.initialize();
  }

  getGeoIpStatus() {
    return this.geoIpService.getStatus();
  }

  async refreshGeoIp() {
    await this.geoIpService.refreshNow();
    return this.getGeoIpStatus();
  }

  getRulesetDatabaseStatus() {
    return this.rulesetDatabaseService.getStatus();
  }

  async refreshRulesetDatabase() {
    await this.rulesetDatabaseService.refreshNow();
    return this.getRulesetDatabaseStatus();
  }

  async getRoutingHits() {
    return statusManager.getRoutingHits(this);
  }

  async getTrafficSnapshot() {
    return statusManager.getTrafficSnapshot(this);
  }

  async getNodeRecords(options = {}) {
    return statusManager.getNodeRecords(this, options);
  }

  resolveCountryName(countryCode) {
    return statusManager.resolveCountryName(countryCode);
  }

  getNodeById(nodeId) {
    return this.store.getNodes().find((node) => node.id === nodeId) || null;
  }

  getRestartRequired() {
    return this.state.status === 'running';
  }

  normalizeFrontProxyRefs(nodes = []) {
    return nodeManager.normalizeFrontProxyRefs(this, nodes);
  }

  async applyNodeChanges(savedNodes, options = {}) {
    return nodeManager.applyNodeChanges(this, savedNodes, options);
  }

  async queueNodeChangesApply(savedNodes, options = {}) {
    return nodeManager.queueNodeChangesApply(this, savedNodes, options);
  }

  async runNodeChangesApplyQueue() {
    return nodeManager.runNodeChangesApplyQueue(this);
  }

  getNodeApplyStatus() {
    return nodeManager.getNodeApplyStatus(this);
  }

  shouldApplyNodeRuntimeChanges(previousNodes, nextNodes) {
    return nodeManager.shouldApplyNodeRuntimeChanges(this, previousNodes, nextNodes);
  }

  async buildSavedNodeChangeResult() {
    return nodeManager.buildSavedNodeChangeResult(this);
  }

  normalizeNodes(nodes) {
    return nodeManager.normalizeNodes(this, nodes);
  }

  saveNodes(nodes) {
    return nodeManager.saveNodes(this, nodes);
  }

  createValidationProxyService(settings = this.getSettingsSnapshot()) {
    return nodeManager.createValidationProxyService(this, settings);
  }

  resolveValidationBinaryPath(settings = this.getSettingsSnapshot()) {
    return nodeManager.resolveValidationBinaryPath(this, settings);
  }

  async validateSingleNodeConfig(node, options = {}) {
    return nodeManager.validateSingleNodeConfig(this, node, options);
  }

  async filterValidNodes(nodes, options = {}) {
    return nodeManager.filterValidNodes(this, nodes, options);
  }

  async validateRuntimeConfig(nodes, settings = this.getSettingsSnapshot()) {
    return nodeManager.validateRuntimeConfig(this, nodes, settings);
  }

  mergeAndSaveNodes(incomingNodes) {
    return nodeManager.mergeAndSaveNodes(this, incomingNodes);
  }

  async importProxyLink(link, group = null) {
    return nodeManager.importProxyLink(this, link, group);
  }

  async importRawNode(rawNode) {
    return nodeManager.importRawNode(this, rawNode);
  }

  async updateNode(nodeId, patch) {
    return nodeManager.updateNode(this, nodeId, patch);
  }

  async deleteNode(nodeId) {
    return nodeManager.deleteNode(this, nodeId);
  }

  async deleteNodes(nodeIds) {
    return nodeManager.deleteNodes(this, nodeIds);
  }

  getGroups() {
    return getGroupsForManager(this);
  }

  async createGroup(name) {
    return createGroupForManager(this, name);
  }

  async setNodeGroup(nodeIds, group) {
    return setNodeGroupForManager(this, nodeIds, group);
  }

  async renameGroup(oldName, newName) {
    return renameGroupForManager(this, oldName, newName);
  }

  async deleteGroup(groupName) {
    return deleteGroupForManager(this, groupName);
  }

  async groupNodesByCountry() {
    return groupNodesByCountryForManager(this);
  }

  async setNodeCountryOverride(nodeId, countryCode) {
    return setNodeCountryOverrideForManager(this, nodeId, countryCode);
  }

  syncAutoCountryNodeGroups(nodes, countryByNodeId = null, options = {}) {
    return syncAutoCountryNodeGroupsForManager(this, nodes, countryByNodeId, options);
  }

  getNodeGroups() {
    return getNodeGroupsForManager(this);
  }

  async getNodeGroupsResolved() {
    return getNodeGroupsResolvedForManager(this);
  }

  async reorderNodeGroups(orderedIds = []) {
    return reorderNodeGroupsForManager(this, orderedIds);
  }

  async createNodeGroup(payload = {}) {
    return createNodeGroupForManager(this, payload);
  }

  async updateNodeGroup(groupId, patch = {}) {
    return updateNodeGroupForManager(this, groupId, patch);
  }

  async deleteNodeGroup(groupId) {
    return deleteNodeGroupForManager(this, groupId);
  }

  async updateNodeGroupNodes(groupId, nodeIds) {
    return updateNodeGroupNodesForManager(this, groupId, nodeIds);
  }

  async selectNodeGroupNode(groupId, selectedNodeId) {
    return selectNodeGroupNodeForManager(this, groupId, selectedNodeId);
  }

  async deleteSubscription(id) {
    return deleteSubscriptionForManager(this, id);
  }

  async syncSubscription(input) {
    return syncSubscriptionForManager(this, input);
  }

  bindProcessState() {
    return lifecycleManager.bindProcessState(this);
  }

  queueLifecycleTask(task) {
    const run = this._lifecycleQueue.catch(() => {}).then(task);
    this._lifecycleQueue = run.catch(() => {});
    return run;
  }

  async start(options = {}) {
    return this.queueLifecycleTask(() => lifecycleManager.start(this, options));
  }

  async stop() {
    return this.queueLifecycleTask(() => lifecycleManager.stop(this));
  }

  async restart(options = {}) {
    return this.queueLifecycleTask(() => lifecycleManager.restart(this, options));
  }

  async testNode(nodeId) {
    return latencyManager.testNode(this, nodeId);
  }

  async measureNodeLatencies(nodeIds = [], options = {}) {
    return latencyManager.measureNodeLatencies(this, nodeIds, options);
  }

  async testNodes(nodeIds = [], options = {}) {
    return latencyManager.testNodes(this, nodeIds, options);
  }

  async testNodeGroups(groupIds = [], options = {}) {
    return latencyManager.testNodeGroups(this, groupIds, options);
  }
}
