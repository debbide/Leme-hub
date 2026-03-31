import fs from 'fs';

import { SingBoxBinaryManager } from '../../proxy/SingBoxBinaryManager.js';
import { ProxyService } from '../../proxy/ProxyService.js';
import { CUSTOM_RULE_ACTIONS, CUSTOM_RULE_TYPES, ROUTING_MODES } from '../../shared/constants.js';
import { AutoStartManager } from './AutoStartManager.js';
import { GeoIpService } from './GeoIpService.js';
import { SystemProxyManager } from './SystemProxyManager.js';

const createHttpError = (message, status) => Object.assign(new Error(message), { status });

const createNodeId = () => Math.random().toString(36).slice(2, 10);

const getNodeSignature = (node) => [
  node.type || '',
  node.server || '',
  node.port || '',
  node.uuid || '',
  node.password || '',
  node.method || ''
].join('|');

const validatePort = (value, fieldName) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw createHttpError(`${fieldName} must be a valid TCP port`, 400);
  }

  return parsed;
};

const normalizeCustomRule = (rule, index) => {
  if (!rule || typeof rule !== 'object') {
    throw createHttpError(`customRules[${index}] must be an object`, 400);
  }

  const type = String(rule.type || '').trim();
  const action = String(rule.action || '').trim();
  const value = String(rule.value || '').trim();

  if (!CUSTOM_RULE_TYPES.includes(type)) {
    throw createHttpError(`customRules[${index}] has invalid type`, 400);
  }

  if (!CUSTOM_RULE_ACTIONS.includes(action)) {
    throw createHttpError(`customRules[${index}] has invalid action`, 400);
  }

  if (!value) {
    throw createHttpError(`customRules[${index}] must include a value`, 400);
  }

  return {
    id: rule.id || `rule-${index + 1}`,
    type,
    action,
    value,
    note: typeof rule.note === 'string' ? rule.note.trim() : ''
  };
};

const normalizeSubscriptionRecord = (record, index) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const url = String(record.url || '').trim();
  if (!url) {
    return null;
  }

  return {
    id: record.id || `subscription-${index + 1}`,
    url,
    name: String(record.name || '').trim() || url,
    groupName: String(record.groupName || '').trim() || null,
    importedCount: Number.parseInt(record.importedCount, 10) || 0,
    lastSyncedAt: record.lastSyncedAt || null,
    lastNodeCount: Number.parseInt(record.lastNodeCount, 10) || 0
  };
};

export const assignStableLocalPorts = (nodes, basePort) => {
  const occupied = new Set();
  let nextPort = basePort;

  for (const node of nodes) {
    const parsed = Number.parseInt(node.local_port, 10);
    if (Number.isInteger(parsed) && parsed > 0 && !occupied.has(parsed)) {
      occupied.add(parsed);
    }
  }

  return nodes.map((node) => {
    const parsed = Number.parseInt(node.local_port, 10);
    if (Number.isInteger(parsed) && parsed > 0 && !occupied.has(parsed)) {
      occupied.add(parsed);
      return { ...node, local_port: parsed };
    }

    if (Number.isInteger(parsed) && parsed > 0) {
      return { ...node, local_port: parsed };
    }

    while (occupied.has(nextPort)) {
      nextPort += 1;
    }

    const assigned = nextPort;
    occupied.add(assigned);
    nextPort += 1;
    return { ...node, local_port: assigned };
  });
};

const mergeUniqueNodes = (existingNodes, incomingNodes) => {
  const seen = new Set(existingNodes.map((node) => node.id));
  const seenSignatures = new Set(existingNodes.map(getNodeSignature));
  const merged = [...existingNodes];

  for (const node of incomingNodes) {
    const withId = node.id ? node : { ...node, id: createNodeId() };
    const signature = getNodeSignature(withId);
    if (!seen.has(withId.id) && !seenSignatures.has(signature)) {
      merged.push(withId);
      seen.add(withId.id);
      seenSignatures.add(signature);
    }
  }

  return merged;
};

export class CoreManager {
  constructor(paths, store, options = {}) {
    this.paths = paths;
    this.store = store;
    this.options = options;
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

    this.proxyService = new ProxyService({
      configDir: this.paths.dataDir,
      projectRoot: this.paths.root,
      proxyListen: this.store.getSettings().proxyListenHost,
      basePort: this.store.getSettings().proxyBasePort,
      configFileName: this.paths.configPath.split(/[/\\]/).pop(),
      log: this.createLogger()
    });
  }

  createLogger() {
    return {
      log: (message) => this.store.appendLog(message),
      error: (message) => this.store.appendLog(message),
      warn: (message) => this.store.appendLog(message)
    };
  }

  getSettingsSnapshot() {
    const settings = this.store.getSettings();
    const normalizedSubscriptions = Array.isArray(settings.subscriptions)
      ? settings.subscriptions.map(normalizeSubscriptionRecord).filter(Boolean)
      : [];

    if (settings.customRules === undefined) {
      return {
        ...settings,
        customRules: [],
        subscriptions: normalizedSubscriptions
      };
    }

    if (!Array.isArray(settings.customRules)) {
      this.store.appendLog('[CoreManager] Invalid customRules persisted in settings; resetting to []');
      return this.store.saveSettings({
        ...settings,
        customRules: []
      });
    }

    try {
      const normalizedRules = settings.customRules.map((rule, index) => normalizeCustomRule(rule, index));
      if (JSON.stringify(settings.customRules) !== JSON.stringify(normalizedRules)) {
        return this.store.saveSettings({
          ...settings,
          customRules: normalizedRules,
          subscriptions: normalizedSubscriptions
        });
      }

      return {
        ...settings,
        customRules: normalizedRules,
        subscriptions: normalizedSubscriptions
      };
    } catch (error) {
      this.store.appendLog(`[CoreManager] Invalid persisted customRules ignored: ${error.message}`);
      return this.store.saveSettings({
        ...settings,
        customRules: [],
        subscriptions: normalizedSubscriptions
      });
    }
  }

  buildBinaryState(overrides = {}) {
    const settings = this.getSettingsSnapshot();
    const status = this.binaryManager.getStatus(settings.singBoxBinaryPath);

    return {
      status: status.ready ? 'ready' : 'missing',
      configuredPath: status.configuredPath,
      managedPath: status.managedPath,
      resolvedPath: status.configuredExists ? status.configuredPath : (status.managedExists ? status.managedPath : null),
      source: status.source,
      lastError: null,
      version: null,
      ...overrides
    };
  }

  buildSystemProxyState(overrides = {}) {
    const settings = this.getSettingsSnapshot();
    const capabilities = this.systemProxyManager.getCapabilities();

    return {
      enabled: false,
      mode: capabilities.supported ? 'off' : 'unsupported',
      provider: capabilities.provider,
      http: null,
      socks: null,
      lastError: null,
      supported: capabilities.supported,
      desiredEnabled: !!settings.systemProxyEnabled,
      ...overrides
    };
  }

  buildAutoStartState(overrides = {}) {
    const settings = this.getSettingsSnapshot();
    const capabilities = this.autoStartManager.getCapabilities();

    return {
      enabled: false,
      provider: capabilities.provider,
      supported: capabilities.supported,
      command: null,
      desiredEnabled: !!settings.autoStart,
      ...overrides
    };
  }

  resolveActiveNodeId(settings = this.store.getSettings(), nodes = this.store.getNodes()) {
    if (settings.activeNodeId && nodes.some((node) => node.id === settings.activeNodeId)) {
      return settings.activeNodeId;
    }

    return nodes[0]?.id || null;
  }

  getProxyProfile() {
    const settings = this.getSettingsSnapshot();
    const nodes = this.store.getNodes();
    const activeNodeId = this.resolveActiveNodeId(settings, nodes);
    const listenHost = settings.proxyListenHost;
    const unifiedSocksPort = settings.systemProxySocksPort;
    const unifiedHttpPort = settings.systemProxyHttpPort;

    return {
      mode: settings.routingMode,
      systemProxyEnabled: !!settings.systemProxyEnabled,
      activeNodeId,
      unifiedHttpPort,
      unifiedSocksPort,
      manualPortRangeStart: settings.proxyBasePort,
      listenHost,
      systemDefaultEndpoint: {
        protocol: 'http',
        host: listenHost,
        port: unifiedHttpPort,
        url: `http://${listenHost}:${unifiedHttpPort}`
      },
      httpCompatibilityEndpoint: {
        protocol: 'socks5',
        host: listenHost,
        port: unifiedSocksPort,
        url: `socks5://${listenHost}:${unifiedSocksPort}`
      },
      systemSocksEndpoint: {
        protocol: 'socks5',
        host: listenHost,
        port: unifiedSocksPort,
        url: `socks5://${listenHost}:${unifiedSocksPort}`
      },
      customRules: settings.customRules,
      activeNode: nodes.find((node) => node.id === activeNodeId) || null
    };
  }

  async refreshAutoStartState() {
    try {
      const status = await this.autoStartManager.getStatus();
      this.state.autoStart = this.buildAutoStartState(status);
    } catch (error) {
      this.state.autoStart = this.buildAutoStartState({
        enabled: false,
        command: null,
        error: error.message
      });
    }

    return this.state.autoStart;
  }

  updateSubscriptionRecord(url, importedCount, nodes) {
    const settings = this.getSettingsSnapshot();
    const now = new Date().toISOString();
    const nextRecord = {
      id: settings.subscriptions.find((item) => item.url === url)?.id || `subscription-${Date.now()}`,
      url,
      name: url,
      importedCount,
      lastSyncedAt: now,
      lastNodeCount: nodes.filter((node) => node.subscriptionUrl === url).length
    };

    const subscriptions = [
      ...settings.subscriptions.filter((item) => item.url !== url),
      nextRecord
    ];

    this.store.saveSettings({
      ...settings,
      subscriptions
    });

    return nextRecord;
  }

  async refreshSystemProxyState() {
    try {
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
    const desiredEnabled = !!this.getSettingsSnapshot().systemProxyEnabled;
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

    const settings = this.getSettingsSnapshot();
    const status = await this.systemProxyManager.apply({
      host: settings.proxyListenHost,
      httpPort: settings.systemProxyHttpPort,
      socksPort: settings.systemProxySocksPort
    });

    if (!settings.systemProxyEnabled) {
      await this.updateSettings({ systemProxyEnabled: true });
    }
    this.state.systemProxy = this.buildSystemProxyState(status);
    return this.state.systemProxy;
  }

  async disableSystemProxy() {
    const status = await this.systemProxyManager.disable();
    if (this.getSettingsSnapshot().systemProxyEnabled) {
      await this.updateSettings({ systemProxyEnabled: false });
    }
    this.state.systemProxy = this.buildSystemProxyState(status);
    return this.state.systemProxy;
  }

  getRuntimeOptions(settings = this.store.getSettings(), nodes = this.store.getNodes()) {
    return {
      activeNodeId: this.resolveActiveNodeId(settings, nodes),
      customRules: settings.customRules,
      proxyMode: settings.routingMode,
      systemProxyEnabled: !!settings.systemProxyEnabled,
      systemProxyHttpPort: settings.systemProxyHttpPort,
      systemProxySocksPort: settings.systemProxySocksPort
    };
  }

  async updateSettings(patch) {
    const current = this.getSettingsSnapshot();
    const next = {
      ...current,
      ...patch
    };

    if (next.routingMode && !ROUTING_MODES.includes(next.routingMode)) {
      throw createHttpError('Invalid routing mode', 400);
    }

    const proxyBasePort = validatePort(next.proxyBasePort, 'proxyBasePort');
    const systemProxySocksPort = validatePort(next.systemProxySocksPort, 'systemProxySocksPort');
    const systemProxyHttpPort = validatePort(next.systemProxyHttpPort, 'systemProxyHttpPort');
    if (Object.prototype.hasOwnProperty.call(patch, 'customRules') && !Array.isArray(next.customRules)) {
      throw createHttpError('customRules must be an array', 400);
    }
    const customRules = Array.isArray(next.customRules)
      ? next.customRules.map((rule, index) => normalizeCustomRule(rule, index))
      : current.customRules;

    if (systemProxySocksPort === systemProxyHttpPort) {
      throw createHttpError('systemProxySocksPort and systemProxyHttpPort must be different', 400);
    }

    const nodes = this.store.getNodes();
    const normalizedNodes = assignStableLocalPorts(nodes, proxyBasePort);
    const occupiedManualPorts = new Set(normalizedNodes.map((node) => Number.parseInt(node.local_port, 10)).filter((port) => Number.isInteger(port)));

    if (occupiedManualPorts.has(systemProxySocksPort) || systemProxySocksPort === proxyBasePort) {
      throw createHttpError('systemProxySocksPort conflicts with manual proxy ports', 400);
    }

    if (occupiedManualPorts.has(systemProxyHttpPort) || systemProxyHttpPort === proxyBasePort) {
      throw createHttpError('systemProxyHttpPort conflicts with manual proxy ports', 400);
    }

    const activeNodeId = this.resolveActiveNodeId(next, nodes);
    let autoStart = this.state.autoStart;
    if (Object.prototype.hasOwnProperty.call(patch, 'autoStart')) {
      autoStart = patch.autoStart
        ? await this.autoStartManager.enable()
        : await this.autoStartManager.disable();
    }

    const saved = this.store.saveSettings({
      ...next,
      proxyBasePort,
      systemProxySocksPort,
      systemProxyHttpPort,
      customRules,
      activeNodeId,
      autoStart: !!next.autoStart
    });
    this.state.autoStart = this.buildAutoStartState(autoStart);

    const runtimeSensitiveKeys = ['activeNodeId', 'routingMode', 'customRules'];
    const shouldAutoRestart = this.state.status === 'running'
      && runtimeSensitiveKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));

    let core = this.getStatus();
    if (shouldAutoRestart) {
      core = await this.restart();
    }

    return {
      settings: { ...saved },
      proxy: this.getProxyProfile(),
      restartRequired: shouldAutoRestart ? false : this.getRestartRequired(),
      autoRestarted: shouldAutoRestart,
      core
    };
  }

  getStatus() {
    const binary = this.buildBinaryState(this.state.binary);

    return {
      ...this.state,
      binary: { ...binary },
      proxy: this.getProxyProfile(),
      systemProxy: { ...this.state.systemProxy },
      autoStart: { ...this.state.autoStart },
      geoIp: this.getGeoIpStatus(),
      settings: this.getSettingsSnapshot(),
      hasConfig: fs.existsSync(this.paths.configPath),
      nodeCount: this.store.getNodes().length,
      nodes: this.store.getNodes(),
      recentLogs: this.store.getRecentLogs(12)
    };
  }

  async initializeGeoIp() {
    await this.geoIpService.initialize();
  }

  getGeoIpStatus() {
    return this.geoIpService.getStatus();
  }

  async refreshGeoIp() {
    await this.geoIpService.refreshNow();
    return this.getGeoIpStatus();
  }

  async getNodeRecords() {
    const settings = this.getSettingsSnapshot();
    const nodes = this.store.getNodes();

    this.proxyService.proxyListen = settings.proxyListenHost;
    this.proxyService.basePort = settings.proxyBasePort;
    this.proxyService.setNodes(nodes);

    const records = nodes.map((node) => ({
      ...node,
      localPort: this.proxyService.getLocalPort(node.id),
      listenHost: settings.proxyListenHost,
      endpoint: {
        protocol: 'socks5',
        host: settings.proxyListenHost,
        port: this.proxyService.getLocalPort(node.id),
        url: `socks5://${settings.proxyListenHost}:${this.proxyService.getLocalPort(node.id)}`
      },
      copyText: `${settings.proxyListenHost}:${this.proxyService.getLocalPort(node.id)}`,
      isRunning: this.state.status === 'running'
    }));

    return this.geoIpService.enrichNodes(records);
  }

  getNodeById(nodeId) {
    return this.store.getNodes().find((node) => node.id === nodeId) || null;
  }

  getRestartRequired() {
    return this.state.status === 'running';
  }

  async applyNodeChanges(savedNodes) {
    if (this.state.status !== 'running') {
      const nodes = await this.getNodeRecords();
      return {
        nodes,
        restartRequired: false,
        autoRestarted: false,
        core: this.getStatus()
      };
    }

    const core = await this.restart();
    return {
      nodes: await this.getNodeRecords(),
      restartRequired: false,
      autoRestarted: true,
      core
    };
  }

  normalizeNodes(nodes) {
    return assignStableLocalPorts(nodes, this.getSettingsSnapshot().proxyBasePort);
  }

  saveNodes(nodes) {
    const savedNodes = this.store.saveNodes(this.normalizeNodes(nodes));
    const settings = this.getSettingsSnapshot();
    this.store.saveSettings({
      ...settings,
      activeNodeId: this.resolveActiveNodeId(settings, savedNodes)
    });
    return savedNodes;
  }

  mergeAndSaveNodes(incomingNodes) {
    return this.saveNodes(mergeUniqueNodes(this.store.getNodes(), incomingNodes));
  }

  async importProxyLink(link, group = null) {
    const parsedNodes = this.proxyService.parseProxyLinks
      ? this.proxyService.parseProxyLinks(link)
      : [this.proxyService.parseProxyLink(link)].filter(Boolean);
    if (!parsedNodes.length) {
      throw createHttpError('Invalid proxy link', 400);
    }

    const nodes = parsedNodes.map((parsedNode) => ({
      ...(parsedNode.id ? parsedNode : { ...parsedNode, id: createNodeId() }),
      ...(group ? { group } : {})
    }));
    const savedNodes = this.mergeAndSaveNodes(nodes);
    const applied = await this.applyNodeChanges(savedNodes);
    return {
      node: applied.nodes.find((item) => item.id === nodes[0].id),
      importedCount: nodes.length,
      ...applied
    };
  }

  async importRawNode(rawNode) {
    const savedNodes = this.mergeAndSaveNodes([rawNode]);
    return this.applyNodeChanges(savedNodes);
  }

  async updateNode(nodeId, patch) {
    const nodes = this.store.getNodes();
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index === -1) {
      throw createHttpError('Node not found', 404);
    }

    nodes[index] = {
      ...nodes[index],
      ...patch,
      id: nodeId
    };

    const savedNodes = this.saveNodes(nodes);
    const applied = await this.applyNodeChanges(savedNodes);
    return {
      node: applied.nodes.find((item) => item.id === nodeId),
      ...applied
    };
  }

  async deleteNode(nodeId) {
    const nodes = this.store.getNodes();
    const remainingNodes = nodes.filter((node) => node.id !== nodeId);
    if (remainingNodes.length === nodes.length) {
      throw createHttpError('Node not found', 404);
    }

    return this.applyNodeChanges(this.saveNodes(remainingNodes));
  }

  getGroups() {
    const nodes = this.store.getNodes();
    const stored = this.getSettingsSnapshot().groups || [];
    const seen = new Set(stored);
    const groups = [...stored];
    for (const node of nodes) {
      const g = node.group ? String(node.group).trim() : null;
      if (g && !seen.has(g)) {
        seen.add(g);
        groups.push(g);
      }
    }
    return groups;
  }

  async createGroup(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw createHttpError('Group name cannot be empty', 400);
    const settings = this.getSettingsSnapshot();
    const groups = settings.groups || [];
    if (groups.includes(trimmed)) return { groups: this.getGroups() };
    this.store.saveSettings({ ...settings, groups: [...groups, trimmed] });
    return { groups: this.getGroups() };
  }

  async setNodeGroup(nodeIds, group) {
    const normalizedGroup = group ? String(group).trim() || null : null;
    const nodes = this.store.getNodes().map((node) =>
      nodeIds.includes(node.id) ? { ...node, group: normalizedGroup } : node
    );
    const savedNodes = this.saveNodes(nodes);
    return this.applyNodeChanges(savedNodes);
  }

  async renameGroup(oldName, newName) {
    const trimmedNew = String(newName || '').trim();
    if (!trimmedNew) throw createHttpError('Group name cannot be empty', 400);
    const nodes = this.store.getNodes().map((node) =>
      node.group === oldName ? { ...node, group: trimmedNew } : node
    );
    const settings = this.getSettingsSnapshot();
    const groups = (settings.groups || []).map(g => g === oldName ? trimmedNew : g);
    this.store.saveSettings({ ...settings, groups });
    const savedNodes = this.saveNodes(nodes);
    return this.applyNodeChanges(savedNodes);
  }

  async deleteGroup(groupName) {
    const nodes = this.store.getNodes().map((node) =>
      node.group === groupName ? { ...node, group: null } : node
    );
    const settings = this.getSettingsSnapshot();
    const groups = (settings.groups || []).filter(g => g !== groupName);
    this.store.saveSettings({ ...settings, groups });
    const savedNodes = this.saveNodes(nodes);
    return this.applyNodeChanges(savedNodes);
  }

  async syncSubscription(url) {
    const importedNodes = await this.proxyService.syncSubscription(url);
    if (!importedNodes.length) {
      throw createHttpError('Subscription returned no usable nodes', 400);
    }

    const settings = this.getSettingsSnapshot();
    const subRecord = settings.subscriptions.find((s) => s.url === url);
    const groupName = subRecord?.groupName || null;

    const existingNodes = this.store.getNodes().filter((node) => node.subscriptionUrl !== url);
    const savedNodes = this.saveNodes(mergeUniqueNodes(existingNodes, importedNodes.map((node) => ({
      ...node,
      source: 'subscription',
      subscriptionUrl: url,
      ...(groupName ? { group: groupName } : {})
    }))));

    const applied = await this.applyNodeChanges(savedNodes);
    const subscription = this.updateSubscriptionRecord(url, importedNodes.length, applied.nodes);

    return {
      importedCount: importedNodes.length,
      subscription,
      ...applied
    };
  }

  bindProcessState() {
    if (!this.proxyService.proxyProcess) {
      return;
    }

    this.proxyService.proxyProcess.once('exit', async (code, signal) => {
      await this.cleanupSystemProxyAfterExit();
      const isClean = code === 0 || signal === 'SIGTERM';
      this.state = {
        ...this.state,
        status: isClean ? 'stopped' : 'error',
        lastError: isClean
          ? null
          : `sing-box exited unexpectedly${code !== null ? ` with code ${code}` : ''}`,
        startedAt: null,
        executablePath: null
      };

      if (!isClean) {
        const MAX_RESTART_ATTEMPTS = 5;
        this._restartAttempts = (this._restartAttempts || 0) + 1;
        if (this._restartAttempts > MAX_RESTART_ATTEMPTS) {
          this.store.appendLog(`[CoreManager] sing-box crashed ${MAX_RESTART_ATTEMPTS} times, giving up`);
          this.state = { ...this.state, status: 'crashed', lastError: 'sing-box crashed too many times, manual restart required' };
          return;
        }
        const delay = Math.min(1000 * 2 ** (this._restartAttempts - 1), 30000);
        this.store.appendLog(`[CoreManager] sing-box crashed, restarting in ${delay}ms (attempt ${this._restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
        setTimeout(async () => {
          try {
            await this.start();
            this._restartAttempts = 0;
          } catch (err) {
            this.store.appendLog(`[CoreManager] Auto-restart failed: ${err.message}`);
          }
        }, delay);
      } else {
        this._restartAttempts = 0;
      }
    });
  }

  async start() {
    let binary = null;

    try {
      const settings = this.getSettingsSnapshot();
      binary = await this.binaryManager.ensureAvailable(settings.singBoxBinaryPath);
      const nodes = this.store.getNodes();
      this.proxyService.setNodes(nodes);
      const result = await this.proxyService.start({
        binPath: binary.executablePath,
        runtime: this.getRuntimeOptions(settings, nodes)
      });
      const systemProxy = settings.systemProxyEnabled
        ? await this.systemProxyManager.apply({
            host: settings.proxyListenHost,
            httpPort: settings.systemProxyHttpPort,
            socksPort: settings.systemProxySocksPort
          })
        : await this.systemProxyManager.getStatus().catch(() => this.buildSystemProxyState());
      this.state = {
        ...this.state,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastError: null,
        executablePath: result.executablePath,
        configPath: result.configPath,
        binary: this.buildBinaryState({
          status: 'ready',
          resolvedPath: binary.executablePath,
          source: binary.source,
          lastError: null,
          version: binary.version || this.state.binary.version
        }),
        systemProxy: this.buildSystemProxyState(systemProxy)
      };
      this.bindProcessState();
      return this.getStatus();
    } catch (error) {
      if (binary && this.proxyService?.proxyProcess) {
        this.proxyService.stop();
      }

      const binaryState = binary
        ? this.buildBinaryState({
            status: 'ready',
            resolvedPath: binary.executablePath,
            source: binary.source,
            lastError: null,
            version: binary.version || this.state.binary.version
          })
        : this.buildBinaryState({
            status: 'error',
            lastError: error.message
          });

      this.state = {
        ...this.state,
        status: 'error',
        lastError: error.message,
        binary: binaryState,
        systemProxy: this.buildSystemProxyState({
          ...this.state.systemProxy,
          lastError: this.state.systemProxy?.lastError || null
        })
      };
      throw error;
    }
  }

  async stop() {
    this._restartAttempts = 0;
    this.proxyService.stop();
    const systemProxy = this.getSettingsSnapshot().systemProxyEnabled
      ? await this.systemProxyManager.disable().catch((error) => this.buildSystemProxyState({
          ...this.state.systemProxy,
          lastError: error.message,
          mode: 'error'
        }))
      : await this.systemProxyManager.getStatus().catch(() => this.buildSystemProxyState());
    this.state = {
      ...this.state,
      status: 'stopped',
      startedAt: null,
      lastError: null,
      executablePath: null,
      binary: this.buildBinaryState({
        status: this.state.binary?.status === 'error' ? 'error' : this.buildBinaryState().status,
        lastError: this.state.binary?.status === 'error' ? this.state.binary.lastError : null,
        version: this.state.binary?.version || null,
        resolvedPath: this.state.binary?.resolvedPath || this.buildBinaryState().resolvedPath,
        source: this.state.binary?.source || this.buildBinaryState().source
      }),
      systemProxy: this.buildSystemProxyState(systemProxy)
    };
    return this.getStatus();
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  async testNode(nodeId) {
    if (!this.getNodeById(nodeId)) {
      throw createHttpError('Node not found', 404);
    }

    let autoStarted = false;
    if (this.state.status !== 'running') {
      await this.start();
      autoStarted = true;
    }

    const latencyMs = await this.proxyService.testNode(nodeId);
    return {
      node: this.getNodeById(nodeId),
      latencyMs,
      core: this.getStatus(),
      autoStarted
    };
  }

  async testNodes(nodeIds = []) {
    const requestedIds = Array.isArray(nodeIds) && nodeIds.length
      ? [...new Set(nodeIds)]
      : this.store.getNodes().map((node) => node.id);

    if (!requestedIds.length) {
      throw createHttpError('No nodes available for latency tests', 400);
    }

    const unknownId = requestedIds.find((nodeId) => !this.getNodeById(nodeId));
    if (unknownId) {
      throw createHttpError(`Node not found: ${unknownId}`, 404);
    }

    let autoStarted = false;
    if (this.state.status !== 'running') {
      await this.start();
      autoStarted = true;
    }

    const CONCURRENCY = 5;
    const results = [];
    for (let i = 0; i < requestedIds.length; i += CONCURRENCY) {
      const batch = requestedIds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (nodeId) => {
        const node = this.getNodeById(nodeId);
        try {
          const latencyMs = await this.proxyService.testNode(nodeId);
          return { id: nodeId, ok: true, latencyMs, node };
        } catch (error) {
          return { id: nodeId, ok: false, error: error.message, node };
        }
      }));
      results.push(...batchResults);
    }

    return {
      results,
      core: this.getStatus(),
      autoStarted
    };
  }
}
