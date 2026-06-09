import fs from 'fs';

import { BUILTIN_RULESETS } from '../../../shared/constants.js';
import { formatHostPort, formatUrlWithHost } from '../../../shared/network.js';
import { geoFlagFromCountryCode } from '../GeoIpService.js';
import {
  ROUTING_HIT_READ_LIMIT,
  normalizeCountryCode,
  pickConnectionBytes,
  pickConnectionTimestamp
} from './state-utils.js';

export const buildBinaryState = (manager, overrides = {}) => {
  const settings = manager.store.getSettings();
  const status = manager.binaryManager.getStatus(settings.singBoxBinaryPath);

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
};

export const buildSystemProxyState = (manager, overrides = {}) => {
  const settings = manager.store.getSettings();
  const capabilities = manager.systemProxyManager.getCapabilities();

  return {
    enabled: false,
    mode: capabilities.supported ? 'off' : 'unsupported',
    provider: capabilities.provider,
    http: null,
    socks: null,
    lastError: null,
    supported: capabilities.supported,
    desiredEnabled: !!settings.systemProxyCaptureEnabled,
    ...overrides
  };
};

export const refreshConnectionsServiceBaseUrl = (manager, settings = manager.getSettingsSnapshot()) => {
  if (typeof manager.connectionsService?.setListenHost === 'function') {
    manager.connectionsService.setListenHost(settings?.proxyListenHost);
  }
  if (typeof manager.clashApiService?.setListenHost === 'function') {
    manager.clashApiService.setListenHost(settings?.proxyListenHost);
  }
};

export const buildAutoStartState = (manager, overrides = {}) => {
  const settings = manager.store.getSettings();
  const capabilities = manager.autoStartManager.getCapabilities();

  return {
    enabled: false,
    provider: capabilities.provider,
    supported: capabilities.supported,
    command: null,
    lastError: null,
    desiredEnabled: !!settings.autoStart,
    ...overrides
  };
};

export const getProxyProfile = (manager) => {
  const settings = manager.getSettingsSnapshot();
  const nodes = manager.store.getNodes();
  const activeNodeId = manager.resolveActiveNodeId(settings, nodes);
  const systemDefaultNodeId = manager.resolveSystemProxyDefaultNodeId(settings, nodes);
  const systemProxyAutoSwitch = manager.getSystemProxyAutoSwitchProfile(settings, nodes);
  const listenHost = settings.proxyListenHost;
  const unifiedSocksPort = settings.systemProxySocksPort;
  const unifiedHttpPort = settings.systemProxyHttpPort;

  return {
    mode: settings.routingMode,
    systemProxyEnabled: !!settings.systemProxyEnabled,
    systemProxyCaptureEnabled: !!settings.systemProxyCaptureEnabled,
    activeNodeId,
    systemDefaultNodeId,
    unifiedHttpPort,
    unifiedSocksPort,
    manualPortRangeStart: settings.proxyBasePort,
    listenHost,
    systemDefaultEndpoint: {
      protocol: 'http',
      host: listenHost,
      port: unifiedHttpPort,
      url: formatUrlWithHost('http', listenHost, unifiedHttpPort)
    },
    httpCompatibilityEndpoint: {
      protocol: 'socks5',
      host: listenHost,
      port: unifiedSocksPort,
      url: formatUrlWithHost('socks5', listenHost, unifiedSocksPort)
    },
    systemSocksEndpoint: {
      protocol: 'socks5',
      host: listenHost,
      port: unifiedSocksPort,
      url: formatUrlWithHost('socks5', listenHost, unifiedSocksPort)
    },
    customRules: settings.customRules,
    rulesets: settings.rulesets || [],
    routingItems: settings.routingItems || [],
    nodeGroups: settings.nodeGroups || [],
    activeNode: nodes.find((node) => node.id === activeNodeId) || null,
    systemDefaultNode: nodes.find((node) => node.id === systemDefaultNodeId) || null,
    systemProxyAutoSwitch
  };
};

export const getBuiltinRulesets = () => [
  ...BUILTIN_RULESETS.map((ruleset) => ({
    id: ruleset.id,
    name: ruleset.name,
    kind: 'builtin',
    remoteRuleSetIds: Array.isArray(ruleset.remoteRuleSetIds) ? [...ruleset.remoteRuleSetIds] : [],
    entries: ruleset.entries.map((entry, index) => ({
      id: `${ruleset.id}-entry-${index + 1}`,
      type: entry.type,
      value: entry.value,
      note: entry.note || ''
    }))
  }))
];

export const getRuntimeOptions = (manager, settings = null, nodes = manager.store.getNodes()) => {
  const snapshot = settings || manager.getSettingsSnapshot();
  return {
    activeNodeId: manager.resolveActiveNodeId(snapshot, nodes),
    systemDefaultNodeId: manager.resolveSystemProxyDefaultNodeId(snapshot, nodes),
    systemProxyAutoSwitchEnabled: !!snapshot.systemProxyAutoSwitchEnabled,
    systemProxyAutoSwitchGroupId: snapshot.systemProxyAutoSwitchGroupId,
    customRules: snapshot.customRules,
    rulesets: snapshot.rulesets || [],
    routingItems: snapshot.routingItems || [],
    nodeGroups: snapshot.nodeGroups || [],
    dnsRemoteServer: snapshot.dnsRemoteServer,
    dnsDirectServer: snapshot.dnsDirectServer,
    dnsBootstrapServer: snapshot.dnsBootstrapServer,
    dnsFinal: snapshot.dnsFinal,
    dnsStrategy: snapshot.dnsStrategy,
    speedtestUrl: snapshot.speedtestUrl,
    tlsFragmentEnabled: !!snapshot.tlsFragmentEnabled,
    proxyMode: snapshot.routingMode,
    systemProxyEnabled: !!snapshot.systemProxyEnabled,
    systemProxyCaptureEnabled: !!snapshot.systemProxyCaptureEnabled,
    systemProxyHttpPort: snapshot.systemProxyHttpPort,
    systemProxySocksPort: snapshot.systemProxySocksPort
  };
};

export const getStatus = (manager) => {
  const binary = manager.buildBinaryState(manager.state.binary);

  return {
    ...manager.state,
    binary: { ...binary },
    proxy: manager.getProxyProfile(),
    systemProxy: { ...manager.state.systemProxy },
    autoStart: { ...manager.state.autoStart },
    geoIp: manager.getGeoIpStatus(),
    rulesetDatabase: manager.getRulesetDatabaseStatus(),
    nodeApply: manager.getNodeApplyStatus(),
    settings: manager.getSettingsSnapshot(),
    paths: {
      root: manager.paths.root,
      runtimeRoot: manager.paths.runtimeRoot,
      dataDir: manager.paths.dataDir,
      configPath: manager.paths.configPath,
      settingsPath: manager.paths.settingsPath,
      rulesDir: manager.paths.rulesDir,
      rulesetMetaPath: manager.paths.rulesetMetaPath
    },
    hasConfig: fs.existsSync(manager.paths.configPath),
    nodeCount: manager.store.getNodes().length,
    nodes: manager.store.getNodes(),
    recentLogs: manager.store.getRecentLogs(200)
  };
};

export const getRoutingHits = async (manager) => {
  const history = manager.readRoutingHitHistory();
  if (manager.state.status !== 'running') return history;
  const settings = manager.store.getSettings();
  if (!settings.systemProxyEnabled || settings.routingMode !== 'rule') return history;

  manager.refreshConnectionsServiceBaseUrl(settings);
  const nodes = manager.store.getNodes();
  const context = manager.createRoutingHitDisplayContext(manager.getSettingsSnapshot(), nodes);
  const connections = await manager.connectionsService.getConnections();
  const liveHits = connections
    .map((connection) => {
      const metadata = connection.metadata || {};
      const host = metadata.host || metadata.destinationIP || metadata.destination || '';
      const chains = Array.isArray(connection.chains) ? connection.chains : [];
      const outboundTag = chains[chains.length - 1] || '';
      const hit = manager.proxyService.resolveRoutingHit(connection.rule || connection.rulePayload || null, host, outboundTag, { allowHeuristic: false });
      if (!hit) return null;
      return manager.decorateRoutingHitEntry({
        id: connection.id || `${host}-${outboundTag}`,
        timestamp: pickConnectionTimestamp(connection),
        host,
        port: metadata.destinationPort || metadata.dstPort || null,
        outbound: outboundTag,
        kind: hit.kind,
        name: hit.name,
        target: hit.target,
        descriptor: hit.descriptor,
        matchedTag: hit.matchedTag || null,
        matchedBy: hit.matchedBy || null,
        matchType: hit.matchType || null,
        matchValue: hit.matchValue || null,
        persisted: false,
        chains,
        rule: connection.rule || null,
        rulePayload: connection.rulePayload || null
      }, context);
    })
    .filter(Boolean);

  return [...liveHits, ...history].slice(0, ROUTING_HIT_READ_LIMIT);
};

export const getTrafficSnapshot = async (manager) => {
  if (manager.state.status !== 'running') {
    return {
      timestamp: new Date().toISOString(),
      uploadBytes: 0,
      downloadBytes: 0,
      connectionCount: 0
    };
  }

  manager.refreshConnectionsServiceBaseUrl();
  const connections = await manager.connectionsService.getConnections();
  const totals = connections.reduce((acc, connection) => {
    acc.uploadBytes += pickConnectionBytes(connection, ['upload', 'uploadBytes', 'up', 'upBytes', 'sent', 'tx']);
    acc.downloadBytes += pickConnectionBytes(connection, ['download', 'downloadBytes', 'down', 'downBytes', 'received', 'rx']);
    return acc;
  }, { uploadBytes: 0, downloadBytes: 0 });

  return {
    timestamp: new Date().toISOString(),
    uploadBytes: Math.round(totals.uploadBytes),
    downloadBytes: Math.round(totals.downloadBytes),
    connectionCount: connections.length
  };
};

export const getNodeRecords = async (manager) => {
  const settings = manager.getSettingsSnapshot();
  const nodes = manager.store.getNodes();

  manager.proxyService.proxyListen = settings.proxyListenHost;
  manager.proxyService.basePort = settings.proxyBasePort;
  manager.proxyService.setNodes(nodes);

  const records = nodes.map((node) => ({
    ...node,
    localPort: manager.proxyService.getLocalPort(node.id),
    listenHost: settings.proxyListenHost,
    shareLink: manager.proxyService.toShareLink ? manager.proxyService.toShareLink(node) : null,
    endpoint: {
      protocol: 'socks5',
      host: settings.proxyListenHost,
      port: manager.proxyService.getLocalPort(node.id),
      url: formatUrlWithHost('socks5', settings.proxyListenHost, manager.proxyService.getLocalPort(node.id))
    },
    copyText: formatHostPort(settings.proxyListenHost, manager.proxyService.getLocalPort(node.id)),
    isRunning: manager.state.status === 'running'
  }));

  const enriched = await manager.geoIpService.enrichNodes(records);
  return enriched.map((node) => {
    const countryCodeOverride = normalizeCountryCode(node.countryCodeOverride);
    if (!countryCodeOverride) {
      return {
        ...node,
        countryOverridden: false
      };
    }

    return {
      ...node,
      countryCode: countryCodeOverride,
      countryName: manager.resolveCountryName(countryCodeOverride) || node.countryName || countryCodeOverride,
      flagEmoji: geoFlagFromCountryCode(countryCodeOverride),
      countryCodeOverride,
      countryOverridden: true
    };
  });
};

export const resolveCountryName = (countryCode) => {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) {
    return null;
  }

  try {
    return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'region' }).of(normalized) || normalized;
  } catch {
    return normalized;
  }
};
