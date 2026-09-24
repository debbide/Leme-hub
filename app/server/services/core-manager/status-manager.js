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
    tunEnabled: !!settings.tunEnabled,
    tunCaptureEnabled: !!settings.tunCaptureEnabled,
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
    systemProxySocksPort: snapshot.systemProxySocksPort,
    tunEnabled: !!snapshot.tunEnabled,
    tunCaptureEnabled: !!snapshot.tunCaptureEnabled,
    tunStack: snapshot.tunStack || 'system',
    tunStrictRoute: snapshot.tunStrictRoute !== false,
    tunInterfaceName: snapshot.tunInterfaceName || 'leme-tun',
    tunAddress: Array.isArray(snapshot.tunAddress) ? snapshot.tunAddress : ['172.19.0.1/30'],
    tunMtu: snapshot.tunMtu || 9000
  };
};

export const isTunSupportedPlatform = (platform = process.platform) => platform === 'win32' || platform === 'linux';

export const getTunStatus = (manager) => {
  const settings = manager.getSettingsSnapshot();
  return {
    supported: isTunSupportedPlatform(),
    enabled: !!settings.tunEnabled,
    captureEnabled: !!settings.tunCaptureEnabled,
    stack: settings.tunStack || 'system',
    strictRoute: settings.tunStrictRoute !== false,
    interfaceName: settings.tunInterfaceName || 'leme-tun',
    address: Array.isArray(settings.tunAddress) ? settings.tunAddress : ['172.19.0.1/30'],
    mtu: settings.tunMtu || 9000,
    platform: process.platform
  };
};

export const getStatus = (manager) => {
  const binary = manager.buildBinaryState(manager.state.binary);

  return {
    ...manager.state,
    binary: { ...binary },
    proxy: manager.getProxyProfile(),
    systemProxy: { ...manager.state.systemProxy },
    tun: getTunStatus(manager),
    autoStart: { ...manager.state.autoStart },
    geoIp: manager.getGeoIpStatus(),
    rulesetDatabase: manager.getRulesetDatabaseStatus(),
    nodeApply: manager.getNodeApplyStatus(),
    settings: manager.getSettingsSnapshot(),
    // NOTE: absolute paths and raw logs are intentionally NOT exposed here.
    // They can leak usernames/directory layout (paths) and credentials or
    // other secrets accidentally written to logs (recentLogs).
    hasConfig: fs.existsSync(manager.paths.configPath),
    nodeCount: manager.store.getNodes().length,
    nodes: manager.store.getNodes()
  };
};

export const getRoutingHits = async (manager) => {
  const history = manager.readRoutingHitHistory();
  if (manager.state.status !== 'running') return history;
  const settings = manager.store.getSettings();
  // Live hits come from Clash API /connections for both system proxy and TUN capture.
  if ((!settings.systemProxyEnabled && !settings.tunEnabled) || settings.routingMode !== 'rule') {
    return history;
  }

  manager.refreshConnectionsServiceBaseUrl(settings);
  const nodes = manager.store.getNodes();
  const context = manager.createRoutingHitDisplayContext(manager.getSettingsSnapshot(), nodes);
  let connections = [];
  try {
    connections = await manager.connectionsService.getConnections();
  } catch {
    return history;
  }
  const liveHits = connections
    .map((connection) => {
      const metadata = connection.metadata || {};
      const host = metadata.host || metadata.destinationIP || metadata.destination || '';
      const chains = Array.isArray(connection.chains) ? connection.chains : [];
      // Clash Meta chains are typically [leafOutbound, ...groups]; fall back to last entry.
      const outboundTag = chains.find((tag) => String(tag || '').startsWith('out-') || String(tag || '').startsWith('grp-') || String(tag || '').startsWith('selector-'))
        || chains[chains.length - 1]
        || '';
      const ruleText = [connection.rule, connection.rulePayload].filter(Boolean).join(' ');
      // Prefer tag/rule text; allow host heuristic so geosite/geoip rulesets can surface.
      const hit = manager.proxyService.resolveRoutingHit(ruleText || null, host, outboundTag, { allowHeuristic: true });
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

// Outbound tags are generated as `out-${node.id}` (see app/proxy/outbound-builder.js).
// Resolve them back to human-readable node names so the UI never shows a bare
// tag like "out-635416e". Best-effort: failures keep raw tags.
const OUTBOUND_TAG_PREFIX = 'out-';

const buildOutboundNameMap = async (manager) => {
  const map = new Map();
  try {
    let nodes = [];
    if (manager && typeof manager.getNodeRecords === 'function') {
      nodes = await manager.getNodeRecords({ enrichGeoIp: false });
    } else if (manager?.store && typeof manager.store.getNodes === 'function') {
      nodes = manager.store.getNodes();
    }
    for (const node of nodes || []) {
      if (node?.id) {
        map.set(`${OUTBOUND_TAG_PREFIX}${node.id}`, node.name || String(node.id));
      }
    }
  } catch {
    // Name resolution is best-effort; raw tags still display.
  }
  return map;
};

const resolveOutboundName = (tag, nameMap) => {
  if (typeof tag !== 'string' || !tag) return tag;
  return nameMap.get(tag) || tag;
};

// Build selector name -> currently selected node from the Clash /proxies API.
// Tolerant: any failure just means chains stay unresolved (old behavior).
const getSelectorNowMap = async (manager) => {
  const service = manager?.connectionsService;
  if (!service || typeof service.getProxies !== 'function') {
    return new Map();
  }

  let proxies = null;
  try {
    proxies = await service.getProxies();
  } catch {
    return new Map();
  }

  const map = new Map();
  const entries = proxies && typeof proxies === 'object' ? Object.values(proxies) : [];
  for (const proxy of entries) {
    if (proxy?.type === 'Selector'
      && typeof proxy?.name === 'string' && proxy.name
      && typeof proxy?.now === 'string' && proxy.now
      && proxy.now !== proxy.name) {
      map.set(proxy.name, proxy.now);
    }
  }
  return map;
};

// sing-box reports connection chains REVERSED (see
// common/trafficcontrol/tracker.go: the dial-order OutboundChain is reversed
// before marshalling). So chains[0] is the final outbound that actually
// dialled, and chains[last] is the outbound the routing rule named.
// Returns the chain in flow order (entry -> ... -> exit) plus the exit tag.
// The /proxies selector map is only a fallback for when the leaf itself is a
// selector whose selected node never made it into the chain.
export const resolveConnectionChain = (chains = [], selectorNow = new Map()) => {
  const raw = [...chains].filter(Boolean);
  if (!raw.length) {
    return { flowTags: [], exitTag: null };
  }
  let exitTag = raw[0];
  const extraHops = [];
  if (selectorNow.has(exitTag)) {
    const seen = new Set(raw);
    let current = exitTag;
    for (let depth = 0; depth < 8; depth++) {
      const next = selectorNow.get(current);
      if (typeof next !== 'string' || !next || seen.has(next)) {
        break;
      }
      seen.add(next);
      extraHops.push(next);
      current = next;
    }
    if (extraHops.length) {
      exitTag = extraHops[extraHops.length - 1];
    }
  }
  const flowTags = [...raw].reverse();
  for (const hop of extraHops) {
    flowTags.push(hop);
  }
  return { flowTags, exitTag };
};

export const getActiveConnections = async (manager) => {
  if (manager.state.status !== 'running') {
    return [];
  }

  manager.refreshConnectionsServiceBaseUrl();
  let connections = [];
  try {
    connections = await manager.connectionsService.getConnections();
  } catch {
    return [];
  }

  const selectorNow = await getSelectorNowMap(manager);
  const outboundNames = await buildOutboundNameMap(manager);

  return connections.map((connection) => {
    const metadata = connection?.metadata || {};
    const chains = Array.isArray(connection?.chains) ? connection.chains.filter(Boolean) : [];
    const { flowTags, exitTag } = resolveConnectionChain(chains, selectorNow);
    const resolvedChains = flowTags.map((tag) => resolveOutboundName(tag, outboundNames));
    const exitNode = exitTag ? resolveOutboundName(exitTag, outboundNames) : null;
    return {
      id: connection?.id || null,
      host: metadata.host || metadata.destinationIP || metadata.destination || '',
      destinationPort: metadata.destinationPort || metadata.dstPort || null,
      network: metadata.network || null,
      type: metadata.type || null,
      process: metadata.process || metadata.processPath || null,
      sourceIP: metadata.sourceIP || null,
      sourcePort: metadata.sourcePort || null,
      chains,
      resolvedChains,
      exitNode,
      exitNodeTag: exitTag && exitNode && exitTag !== exitNode ? exitTag : null,
      rule: connection?.rule || null,
      rulePayload: connection?.rulePayload || null,
      uploadBytes: pickConnectionBytes(connection, ['upload', 'uploadBytes', 'up', 'upBytes', 'sent', 'tx']),
      downloadBytes: pickConnectionBytes(connection, ['download', 'downloadBytes', 'down', 'downBytes', 'received', 'rx']),
      startedAt: pickConnectionTimestamp(connection)
    };
  });
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

const applyNodeCountryOverrides = (manager, nodes = []) => nodes.map((node) => {
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

export const getNodeRecords = async (manager, options = {}) => {
  const { enrichGeoIp = true } = options;
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

  if (!enrichGeoIp) {
    return applyNodeCountryOverrides(manager, records);
  }

  const enriched = await manager.geoIpService.enrichNodes(records);
  return applyNodeCountryOverrides(manager, enriched);
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
