import { formatHostPort, resolveLoopbackHost } from '../shared/network.js';
import { buildDnsConfig } from './dns-config.js';
import { buildNodeOutbound } from './protocols.js';
import { buildRouteConfig } from './route-config.js';
import { ACTIVE_NODE_SELECTOR_TAG, createNodeGroupOutboundTag as getNodeGroupOutboundTag } from './routing-observability.js';

const UUID_REQUIRED_NODE_TYPES = new Set(['vmess', 'vless', 'tuic']);
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const isValidUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

const filterValidNodes = (context) => (context.nodes || []).filter((node) => {
  if (!node) {
    return false;
  }

  if (UUID_REQUIRED_NODE_TYPES.has(node.type)) {
    const uuid = node.uuid || '';
    if (!isValidUuid(uuid)) {
      const label = node.name || node.id || node.type;
      context.log.error(`[ProxyService] Skipping node ${label}: invalid uuid "${uuid}"`);
      return false;
    }
  }

  return true;
});

const normalizeNodeGroups = (nodeGroups = [], validNodeIdSet = new Set()) => (nodeGroups || [])
  .filter((group) => group && typeof group === 'object' && group.id)
  .map((group) => {
    const nodeIds = [...new Set(
      (Array.isArray(group.nodeIds) ? group.nodeIds : [])
        .map((nodeId) => String(nodeId || '').trim())
        .filter((nodeId) => validNodeIdSet.has(nodeId))
    )];
    const selectedNodeId = nodeIds.includes(String(group.selectedNodeId || '').trim())
      ? String(group.selectedNodeId || '').trim()
      : (nodeIds[0] || null);
    return {
      ...group,
      nodeIds,
      selectedNodeId
    };
  })
  .filter((group) => group.nodeIds.length > 0);

const buildNodeInbounds = (context, validNodes) => validNodes.map((node, index) => ({
  type: 'socks',
  tag: `in-${node.id}`,
  listen: context.proxyListen,
  listen_port: context.nodePortMap.get(node.id) || (context.basePort + index)
}));

const appendSystemProxyInbounds = (inbounds, context, {
  systemProxyEnabled = false,
  systemProxyHttpPort,
  systemProxySocksPort
}) => {
  if (systemProxyEnabled && systemProxySocksPort) {
    inbounds.push({
      type: 'socks',
      tag: 'system-socks',
      listen: context.proxyListen,
      listen_port: systemProxySocksPort
    });
  }

  if (systemProxyEnabled && systemProxyHttpPort) {
    inbounds.push({
      type: 'http',
      tag: 'system-http',
      listen: context.proxyListen,
      listen_port: systemProxyHttpPort
    });
  }
};

const buildActiveSelectorOutbound = (validNodes, effectiveNodeId) => validNodes.length
  ? {
      type: 'selector',
      tag: ACTIVE_NODE_SELECTOR_TAG,
      outbounds: [...new Set([
        ...(effectiveNodeId ? [`out-${effectiveNodeId}`] : []),
        ...validNodes.map((node) => `out-${node.id}`)
      ].filter(Boolean))],
      interrupt_exist_connections: true
    }
  : null;

export const generateProxyConfig = (context, options = {}) => {
  const {
    activeNodeId = null,
    systemDefaultNodeId = null,
    systemProxyAutoSwitchEnabled = false,
    systemProxyAutoSwitchGroupId = null,
    proxyMode = 'rule',
    customRules = [],
    rulesets = [],
    routingItems = [],
    nodeGroups = [],
    dnsRemoteServer = 'https://cloudflare-dns.com/dns-query',
    dnsDirectServer = 'https://dns.alidns.com/dns-query',
    dnsBootstrapServer = '223.5.5.5',
    dnsFinal = 'dns-remote',
    dnsStrategy = 'prefer_ipv4',
    tlsFragmentEnabled = false,
    systemProxyEnabled = false,
    systemProxyHttpPort,
    systemProxySocksPort
  } = options;

  const validNodes = filterValidNodes(context);

  const validNodeMap = new Map(validNodes.map((node) => [node.id, node]));
  const validNodeIdSet = new Set(validNodeMap.keys());
  const effectiveNodeId = context.resolveDefaultNodeId(validNodes, activeNodeId);
  const effectiveSystemNodeId = context.resolveDefaultNodeId(validNodes, systemDefaultNodeId || activeNodeId);

  const inbounds = buildNodeInbounds(context, validNodes);
  const outbounds = validNodes.map((node) => buildNodeOutbound(node, {
    validNodeMap,
    tlsFragmentEnabled
  }));

  const normalizedNodeGroups = normalizeNodeGroups(nodeGroups, validNodeIdSet);
  const activeSelectorOutbound = buildActiveSelectorOutbound(validNodes, effectiveNodeId);
  const nodeGroupOutbounds = normalizedNodeGroups.map((group) => ({
    type: 'selector',
    tag: getNodeGroupOutboundTag(group.id),
    outbounds: group.nodeIds.map((nodeId) => `out-${nodeId}`),
    interrupt_exist_connections: false
  }));

  appendSystemProxyInbounds(inbounds, context, {
    systemProxyEnabled,
    systemProxyHttpPort,
    systemProxySocksPort
  });

  const activeOutbound = effectiveNodeId ? `out-${effectiveNodeId}` : 'direct';
  const activeSelectorOutboundTag = activeSelectorOutbound?.tag || activeOutbound;
  const nodeGroupMap = new Map(normalizedNodeGroups.map((group) => [group.id, group]));
  const autoSwitchGroup = systemProxyAutoSwitchEnabled
    ? nodeGroupMap.get(String(systemProxyAutoSwitchGroupId || '').trim())
    : null;
  const systemDefaultOutbound = autoSwitchGroup?.nodeIds?.length
    ? getNodeGroupOutboundTag(autoSwitchGroup.id)
    : effectiveSystemNodeId
      ? (effectiveSystemNodeId === effectiveNodeId ? activeSelectorOutboundTag : `out-${effectiveSystemNodeId}`)
      : activeSelectorOutboundTag;

  const {
    route,
    dnsRouting,
    routingHitMap,
    routingRuleIndexMap
  } = buildRouteConfig({
    rulesDir: context.rulesDir,
    validNodes,
    inbounds,
    customRules,
    rulesets,
    routingItems,
    nodeGroupMap,
    systemDefaultOutbound,
    activeSelectorOutboundTag,
    systemProxyEnabled,
    proxyMode
  });
  context.routingHitMap = routingHitMap;
  context.routingRuleIndexMap = routingRuleIndexMap;

  const dns = buildDnsConfig({
    validNodes,
    dnsRemoteServer,
    dnsDirectServer,
    dnsBootstrapServer,
    dnsFinal,
    dnsStrategy,
    activeSelectorOutboundTag,
    systemDefaultOutbound,
    systemProxyEnabled,
    systemInbounds: dnsRouting.systemInbounds,
    proxyMode,
    localDirectDomains: dnsRouting.localDirectDomains,
    localDirectDomainSuffixes: dnsRouting.localDirectDomainSuffixes,
    storeSigninRules: dnsRouting.storeSigninRules,
    systemStoreSigninRuleSetTag: dnsRouting.systemStoreSigninRuleSetTag,
    orderedDnsRules: dnsRouting.orderedDnsRules,
    builtInCnDirectRuleSetTags: dnsRouting.builtInCnDirectRuleSetTags,
    resolveDnsServerForOutbound: dnsRouting.resolveDnsServerForOutbound
  });

  return {
    log: { level: 'warn' },
    inbounds,
    outbounds: [
      ...outbounds,
      ...(activeSelectorOutbound ? [activeSelectorOutbound] : []),
      ...nodeGroupOutbounds,
      { type: 'direct', tag: 'direct' }
    ],
    dns,
    route,
    experimental: {
      clash_api: {
        external_controller: formatHostPort(resolveLoopbackHost(context.proxyListen), 9095),
        secret: '',
        default_mode: proxyMode
      }
    }
  };
};
