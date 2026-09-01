import fs from 'fs';
import path from 'path';

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_PROXY_BASE_PORT,
  DEFAULT_PROXY_LISTEN_HOST
} from '../shared/constants.js';
import { normalizeHost, resolveLoopbackHost } from '../shared/network.js';
import {
  normalizeConfigNode as normalizeProtocolConfigNode,
  parseProxyLink as parseProtocolProxyLink,
  parseProxyLinks as parseProtocolProxyLinks,
  toShareLink as protocolToShareLink
} from './protocols.js';
import {
  extractConfigNodes as extractSubscriptionConfigNodes,
  normalizeManualImportContent as normalizeSubscriptionManualImportContent,
  normalizeSubscriptionContent as normalizeRawSubscriptionContent,
  parseStructuredSubscription as parseSubscriptionStructuredContent,
  resolveSubscriptionInternalProxy as resolveSubscriptionInternalProxyForContext,
  syncSubscription as syncSubscriptionForContext
} from './subscriptions.js';
import {
  buildSpeedtestRuntimeOptions as buildSpeedtestRuntimeOptionsForContext,
  createSpeedtestService as createSpeedtestServiceForContext,
  measureSpeedtestLatency as measureSpeedtestLatencyForContext,
  resolveSpeedtestNodes as resolveSpeedtestNodesForContext,
  testNode as testSpeedtestNodeForContext,
  testNodes as testSpeedtestNodesForContext,
  withSpeedtestRuntime as withSpeedtestRuntimeForContext
} from './speedtest.js';
import {
  ACTIVE_NODE_SELECTOR_TAG,
  buildRoutingObservabilityLines,
  createNodeGroupOutboundTag,
  handleProxyRuntimeLine as handleProxyRuntimeLineForContext,
  resolveRoutingHit as resolveRoutingHitFromMap
} from './routing-observability.js';
import { generateProxyConfig } from './config-generator.js';
import {
  reserveEphemeralPort as reserveEphemeralPortForContext,
  resolveExecutablePath as resolveRuntimeExecutablePath,
  restartProxyRuntime,
  startProxyRuntime,
  stopProcess as stopRuntimeProcess,
  stopProxyRuntime,
  collectRuntimeReadyPorts as collectRuntimeReadyPortsForContext,
  validateConfig as validateRuntimeConfig,
  waitForPortReady as waitForRuntimePortReady,
  waitForRuntimeReady as waitForRuntimeReadyForContext,
  writeConfig as writeRuntimeConfig
} from './runtime.js';
import {
  getLocalPort as getNodeLocalPort,
  resolveDefaultNodeId as resolveDefaultProxyNodeId,
  setNodes as setProxyNodes,
  updatePortMap as updateProxyPortMap
} from './node-state.js';
import { ProcessCoreRuntime } from './runtime/ProcessCoreRuntime.js';

const stripAnsi = (value = '') => String(value).replace(/\u001b\[[0-9;]*m/gu, '');

export { ACTIVE_NODE_SELECTOR_TAG };
export const getNodeGroupOutboundTag = createNodeGroupOutboundTag;

export class ProxyService {
  static getNodeGroupOutboundTag(groupId) {
    return getNodeGroupOutboundTag(groupId);
  }

  constructor(options = {}) {
    const {
      configDir,
      projectRoot,
      proxyListen = process.env.PROXY_LISTEN || DEFAULT_PROXY_LISTEN_HOST,
      basePort = DEFAULT_PROXY_BASE_PORT,
      configFileName = DEFAULT_CONFIG_FILE,
      log = console,
      onRoutingHit = null,
      clashApiSecret = '',
      coreRuntime = null
    } = typeof options === 'string' ? { configDir: options } : options;

    this.clashApiSecret = clashApiSecret;

    this.proxyProcess = null;
    this.nodes = [];
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
    this.proxyListen = normalizeHost(proxyListen, DEFAULT_PROXY_LISTEN_HOST);
    this.basePort = basePort;
    this.log = log;
    this.onRoutingHit = typeof onRoutingHit === 'function' ? onRoutingHit : null;
    this.binName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';
    this.executablePath = null;
    this.runtimeOptions = {};
    this.nodePortMap = new Map();
    this.routingHitMap = new Map();
    this.routingRuleIndexMap = new Map();
    this.connectionTraceMap = new Map();
    this.configDir = path.resolve(configDir || path.join(this.projectRoot, 'data'));
    this.rulesDir = path.join(this.configDir, 'rules');

    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }

    this.configPath = path.join(this.configDir, configFileName);
    this.coreRuntime = coreRuntime || new ProcessCoreRuntime(this);
  }

  setCoreRuntime(coreRuntime) {
    if (!coreRuntime) {
      throw new Error('ProxyService requires a core runtime');
    }
    this.coreRuntime = coreRuntime;
    return this.coreRuntime;
  }

  getCoreRuntimeStatus() {
    return this.coreRuntime?.getStatus?.() || {
      mode: 'process',
      status: this.proxyProcess ? 'running' : 'stopped'
    };
  }

  setNodes(nodes) {
    return setProxyNodes(this, nodes);
  }

  resolveDefaultNodeId(validNodes, requestedNodeId) {
    return resolveDefaultProxyNodeId(validNodes, requestedNodeId);
  }

  updatePortMap() {
    return updateProxyPortMap(this);
  }

  getLocalPort(nodeId) {
    return getNodeLocalPort(this, nodeId);
  }

  getNodeGroupOutboundTag(groupId) {
    return getNodeGroupOutboundTag(groupId);
  }

  stripAnsi(value = '') {
    return stripAnsi(value);
  }

  generateConfig(options = {}) {
    return generateProxyConfig(this, options);
  }

  getRoutingObservabilityLines(runtime = {}) {
    return buildRoutingObservabilityLines(runtime, this.generateConfig(runtime));
  }

  resolveRoutingHit(ruleTag, host, outboundTag, options = {}) {
    return resolveRoutingHitFromMap(this.routingHitMap, ruleTag, host, outboundTag, options);
  }

  resolveExecutablePath(explicitPath) {
    return resolveRuntimeExecutablePath(explicitPath);
  }

  writeConfig(config, targetPath = this.configPath) {
    return writeRuntimeConfig(config, targetPath);
  }

  async validateConfig(config, options = {}) {
    if (this.coreRuntime?.checkConfig) {
      return this.coreRuntime.checkConfig(config, options);
    }
    return validateRuntimeConfig(this, config, options);
  }

  waitForPortReady(port, timeoutMs = 15000, host = this.proxyListen, processRef = null) {
    return waitForRuntimePortReady(this, port, timeoutMs, host, processRef);
  }

  collectRuntimeReadyPorts(runtime = {}, options = {}) {
    return collectRuntimeReadyPortsForContext(this, runtime, options);
  }

  async waitForRuntimeReady(runtime = {}, host = this.proxyListen, processRef = this.proxyProcess, options = {}) {
    return waitForRuntimeReadyForContext(this, runtime, host, processRef, options);
  }

  async reserveEphemeralPort(host = resolveLoopbackHost(this.proxyListen)) {
    return reserveEphemeralPortForContext(this, host);
  }

  buildSpeedtestRuntimeOptions(options = {}) {
    return buildSpeedtestRuntimeOptionsForContext(this, options);
  }

  createSpeedtestService(nodes, options = {}) {
    return createSpeedtestServiceForContext(this, nodes, options);
  }

  resolveSpeedtestNodes(nodes = []) {
    return resolveSpeedtestNodesForContext(this, nodes);
  }

  async stopProcess(processRef) {
    return stopRuntimeProcess(processRef);
  }

  async withSpeedtestRuntime(nodes, options = {}, callback) {
    return withSpeedtestRuntimeForContext(this, nodes, options, callback);
  }

  async measureSpeedtestLatency(localPort, options = {}) {
    return measureSpeedtestLatencyForContext(this, localPort, options);
  }

  handleProxyRuntimeLine(line, options = {}) {
    return handleProxyRuntimeLineForContext(this, line, options);
  }

  async start(options = {}) {
    if (!this.coreRuntime || this.coreRuntime instanceof ProcessCoreRuntime) {
      return this.coreRuntime
        ? this.coreRuntime.start(options)
        : startProxyRuntime(this, options);
    }

    const config = this.generateConfig(options);
    await this.coreRuntime.checkConfig(config, options);
    this.writeConfig(config);

    const currentStatus = this.coreRuntime.getStatus?.();
    if (currentStatus?.status === 'running') {
      await this.coreRuntime.reload(config, options);
    } else {
      await this.coreRuntime.start(config, options);
    }

    await this.waitForRuntimeReady(options, this.proxyListen, null, options);
    const status = this.coreRuntime.getStatus?.() || {};
    return {
      started: true,
      mode: status.mode || 'embedded',
      configPath: this.configPath,
      executablePath: null,
      libraryPath: status.libraryPath || null,
      ...status
    };
  }

  async stop() {
    if (this.coreRuntime?.stop) {
      return this.coreRuntime.stop();
    }
    return stopProxyRuntime(this);
  }

  async restart(nodes, options = {}) {
    if (!this.coreRuntime || this.coreRuntime instanceof ProcessCoreRuntime) {
      return this.coreRuntime
        ? this.coreRuntime.restart(nodes, options)
        : restartProxyRuntime(this, nodes, options);
    }

    if (Array.isArray(nodes)) {
      this.setNodes(nodes);
    }
    return this.start(options);
  }

  parseProxyLink(link) {
    return parseProtocolProxyLink(link, { log: this.log });
  }

  parseProxyLinks(input) {
    return parseProtocolProxyLinks(input, { log: this.log });
  }

  extractConfigNodes(payload) {
    return extractSubscriptionConfigNodes(payload);
  }

  normalizeConfigNode(node, index = 0) {
    return normalizeProtocolConfigNode(node, index);
  }

  parseStructuredSubscription(content) {
    return parseSubscriptionStructuredContent(content, {
      log: this.log,
      normalizeNode: (node, index) => this.normalizeConfigNode(node, index)
    });
  }

  normalizeSubscriptionContent(content) {
    return normalizeRawSubscriptionContent(content);
  }

  normalizeManualImportContent(content) {
    return normalizeSubscriptionManualImportContent(content);
  }

  toShareLink(node) {
    return protocolToShareLink(node);
  }

  async syncSubscription(url, options = {}) {
    return syncSubscriptionForContext(this, url, options);
  }

  resolveSubscriptionInternalProxy(options = {}) {
    return resolveSubscriptionInternalProxyForContext(this, options);
  }

  async testNode(nodeId, options = {}) {
    return testSpeedtestNodeForContext(this, nodeId, options);
  }

  async testNodes(nodeIds = [], options = {}) {
    return testSpeedtestNodesForContext(this, nodeIds, options);
  }
}
