import {
  BUILTIN_RULESETS,
  REMOTE_RULESET_CATALOG
} from '../shared/constants.js';
import { LOCALHOST_DNS_SERVER_TAG, PLATFORM_LOCAL_DNS_SERVER_TAG } from './dns-config.js';
import { buildNormalizedRoutingItems } from './route-items.js';
import {
  buildLocalDatabaseRuleSets,
  buildLocalRuleSetConfig,
  resolveExistingFilePath
} from './route-ruleset-files.js';
import { createNodeGroupOutboundTag as getNodeGroupOutboundTag } from './routing-observability.js';

const BUILTIN_RULESET_MAP = new Map(BUILTIN_RULESETS.map((ruleset) => [ruleset.id, ruleset]));
const REMOTE_RULESET_MAP = new Map(REMOTE_RULESET_CATALOG.map((ruleset) => [ruleset.id, ruleset]));
const LOCAL_DIRECT_RULESET_TAG = 'builtin-local-bypass';
const SYSTEM_STORE_SIGNIN_RULESET_TAG = 'builtin-microsoft-store-signin';
const SYSTEM_STORE_SIGNIN_PRESET_ID = 'microsoft-store-signin';
const LOCAL_DIRECT_IP_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10'
];
const LOCAL_DIRECT_DOMAINS = ['localhost', 'localhost.'];
const LOCAL_DIRECT_DOMAIN_SUFFIXES = ['local', 'lan', 'home.arpa', 'localdomain'];

export const CAPTURE_INBOUND_TAGS = ['system-socks', 'system-http', 'tun-in'];

export const buildRouteConfig = ({
  rulesDir,
  validNodes = [],
  inbounds = [],
  customRules = [],
  rulesets = [],
  routingItems = [],
  nodeGroupMap = new Map(),
  systemDefaultOutbound = 'direct',
  activeSelectorOutboundTag = 'direct',
  systemProxyEnabled = false,
  tunEnabled = false,
  proxyMode = 'rule'
} = {}) => {
  const routingHitMap = new Map();
  const registerRoutingHit = (tag, meta) => {
    routingHitMap.set(tag, meta);
    return tag;
  };
  const localDatabaseRuleSets = buildLocalDatabaseRuleSets(rulesDir, REMOTE_RULESET_CATALOG);
  const resolveManualRuleOutbound = (rule) => {
    if (rule.action === 'direct') return 'direct';
    if (rule.action === 'node' && rule.nodeId && validNodes.some((node) => node.id === rule.nodeId)) {
      return `out-${rule.nodeId}`;
    }
    if (rule.action === 'node_group' && rule.nodeGroupId) {
      const group = nodeGroupMap.get(rule.nodeGroupId);
      if (group?.nodeIds?.length) {
        return getNodeGroupOutboundTag(group.id);
      }
    }
    return systemDefaultOutbound;
  };
  const buildRulesetOutbound = (ruleset) => {
    if (ruleset.target === 'direct') return 'direct';
    if (ruleset.target === 'default') return systemDefaultOutbound;
    if (ruleset.target === 'node' && ruleset.nodeId && validNodes.some((node) => node.id === ruleset.nodeId)) {
      return `out-${ruleset.nodeId}`;
    }
    if (ruleset.target === 'node_group' && ruleset.groupId) {
      const group = nodeGroupMap.get(ruleset.groupId);
      if (group?.nodeIds?.length) {
        return getNodeGroupOutboundTag(group.id);
      }
    }
    return systemDefaultOutbound;
  };
  const resolveDnsServerForOutbound = (outbound) => outbound === 'direct' ? 'dns-local' : 'dns-remote';
  const normalizedRoutingItems = buildNormalizedRoutingItems({ routingItems, customRules, rulesets });

  const orderedInlineRuleSets = [];
  const orderedRouteRules = [];
  const orderedDnsRules = [];
  const customRulesetBuckets = new Map();
  const captureInbounds = CAPTURE_INBOUND_TAGS.filter((tag) => inbounds.some((inbound) => inbound.tag === tag));
  // Backward-compatible alias used by older call sites / tests.
  const systemInbounds = captureInbounds;
  const captureRoutingEnabled = Boolean(systemProxyEnabled || tunEnabled);
  const builtInCnDirectRuleSetTags = ['geosite-cn', 'geoip-cn']
    .filter((tag) => Boolean(resolveExistingFilePath(localDatabaseRuleSets[tag])));
  const localBypassRuleSetTag = registerRoutingHit(LOCAL_DIRECT_RULESET_TAG, {
    kind: 'builtin',
    name: 'Local Bypass',
    target: 'direct',
    descriptor: 'localhost / lan'
  });

  orderedInlineRuleSets.push({
    type: 'inline',
    tag: localBypassRuleSetTag,
    rules: [
      { domain: LOCAL_DIRECT_DOMAINS },
      { domain_suffix: LOCAL_DIRECT_DOMAIN_SUFFIXES }
    ]
  });

  const storeSigninBuiltin = BUILTIN_RULESET_MAP.get(SYSTEM_STORE_SIGNIN_PRESET_ID);
  const storeSigninRules = Array.isArray(storeSigninBuiltin?.entries)
    ? storeSigninBuiltin.entries.map((entry) => ({ [entry.type]: [entry.value] }))
    : [];
  if (storeSigninRules.length) {
    registerRoutingHit(SYSTEM_STORE_SIGNIN_RULESET_TAG, {
      kind: 'builtin',
      name: storeSigninBuiltin.name || 'Microsoft Store 鐧诲綍',
      target: systemDefaultOutbound,
      descriptor: storeSigninBuiltin.name || 'Microsoft Store 鐧诲綍',
      rulesetPresetId: SYSTEM_STORE_SIGNIN_PRESET_ID
    });
    orderedInlineRuleSets.push({
      type: 'inline',
      tag: SYSTEM_STORE_SIGNIN_RULESET_TAG,
      rules: storeSigninRules
    });
  }

  normalizedRoutingItems.forEach((item, index) => {
    if (!item || item.enabled === false) return;

    if (item.kind === 'rule') {
      const outbound = resolveManualRuleOutbound(item);
      const tag = registerRoutingHit(`usr-rule-${item.id || index + 1}`, {
        kind: 'rule',
        name: item.note || `${item.type}=${item.value}`,
        target: outbound,
        descriptor: `${item.type}=${item.value}`,
        matchType: item.type,
        matchValue: item.value
      });
      orderedInlineRuleSets.push({
        type: 'inline',
        tag,
        rules: [{ [item.type]: [item.value] }]
      });
      orderedRouteRules.push({ inbound: captureInbounds, rule_set: tag, outbound });
      orderedDnsRules.push({ inbound: captureInbounds, rule_set: tag, server: resolveDnsServerForOutbound(outbound) });
      return;
    }

    if (item.kind === 'builtin_ruleset') {
      const builtin = BUILTIN_RULESET_MAP.get(item.presetId);
      if (!builtin) return;
      const outbound = buildRulesetOutbound(item);
      const inlineTagName = `usr-rs-${item.id || index + 1}`;
      const remoteRuleSetTags = (builtin.remoteRuleSetIds || [])
        .map((id) => REMOTE_RULESET_MAP.get(id)?.tag || null)
        .filter((tag) => tag && Boolean(resolveExistingFilePath(localDatabaseRuleSets[tag])));
      const inlineTag = registerRoutingHit(inlineTagName, {
        kind: 'ruleset',
        name: builtin.name || item.presetId,
        target: outbound,
        descriptor: builtin.name || item.presetId,
        rulesetId: item.id || null,
        rulesetPresetId: item.presetId || null
      });
      remoteRuleSetTags.forEach((tag) => {
        registerRoutingHit(tag, {
          kind: 'ruleset',
          name: builtin.name || item.presetId,
          target: outbound,
          descriptor: builtin.name || item.presetId,
          rulesetId: item.id || null,
          rulesetPresetId: item.presetId || null
        });
      });
      if (remoteRuleSetTags.length) {
        orderedRouteRules.push({ inbound: captureInbounds, rule_set: remoteRuleSetTags, outbound });
        orderedDnsRules.push({ inbound: captureInbounds, rule_set: remoteRuleSetTags, server: resolveDnsServerForOutbound(outbound) });
      }
      orderedRouteRules.push({ inbound: captureInbounds, rule_set: inlineTagName, outbound });
      orderedDnsRules.push({ inbound: captureInbounds, rule_set: inlineTagName, server: resolveDnsServerForOutbound(outbound) });
      if (Array.isArray(builtin.entries) && builtin.entries.length) {
        orderedInlineRuleSets.push({
          type: 'inline',
          tag: inlineTag,
          rules: builtin.entries.map((entry) => ({ [entry.type]: [entry.value] }))
        });
      }
      return;
    }

    if (item.kind === 'remote') {
      const outbound = buildRulesetOutbound(item);
      const tag = `usr-rs-${item.id || index + 1}`;
      registerRoutingHit(tag, {
        kind: 'ruleset',
        name: item.name || item.url,
        target: outbound,
        descriptor: item.url,
        rulesetId: item.id || null
      });
      orderedInlineRuleSets.push({
        type: 'remote',
        tag,
        format: item.format || 'binary',
        url: item.url,
        download_detour: 'direct',
        update_interval: '24h'
      });
      orderedRouteRules.push({ inbound: captureInbounds, rule_set: tag, outbound });
      orderedDnsRules.push({ inbound: captureInbounds, rule_set: tag, server: resolveDnsServerForOutbound(outbound) });
      return;
    }

    if (item.kind === 'custom_entry') {
      const outbound = buildRulesetOutbound(item);
      const rulesetTagBase = item.rulesetId || item.id || index + 1;
      const tag = `usr-rs-${rulesetTagBase}`;
      const existingBucket = customRulesetBuckets.get(tag);

      if (existingBucket) {
        existingBucket.rules.push({ [item.type]: [item.value] });
        return;
      }

      registerRoutingHit(tag, {
        kind: 'ruleset',
        name: item.rulesetName || item.note || `${item.type}=${item.value}`,
        target: outbound,
        descriptor: `${item.type}=${item.value}`,
        rulesetId: item.rulesetId || null,
        matchType: item.type,
        matchValue: item.value
      });
      const bucket = {
        type: 'inline',
        tag,
        rules: [{ [item.type]: [item.value] }]
      };
      customRulesetBuckets.set(tag, bucket);
      orderedInlineRuleSets.push(bucket);
      orderedRouteRules.push({ inbound: captureInbounds, rule_set: tag, outbound });
      orderedDnsRules.push({ inbound: captureInbounds, rule_set: tag, server: resolveDnsServerForOutbound(outbound) });
    }
  });

  const finalOutbound = !captureRoutingEnabled || proxyMode === 'rule'
    ? 'direct'
    : proxyMode === 'direct'
      ? 'direct'
      : activeSelectorOutboundTag;

  const routeRules = [
    ...validNodes.map((node) => ({
      inbound: [`in-${node.id}`],
      outbound: `out-${node.id}`
    }))
  ];

  routeRules.unshift({
    ip_is_private: true,
    outbound: 'direct'
  });
  routeRules.unshift({
    ip_cidr: LOCAL_DIRECT_IP_CIDRS,
    outbound: 'direct'
  });
  routeRules.unshift({
    rule_set: localBypassRuleSetTag,
    outbound: 'direct'
  });
  routeRules.unshift({
    domain_suffix: LOCAL_DIRECT_DOMAIN_SUFFIXES,
    action: 'resolve',
    server: PLATFORM_LOCAL_DNS_SERVER_TAG
  });
  routeRules.unshift({
    domain: LOCAL_DIRECT_DOMAINS,
    action: 'resolve',
    server: LOCALHOST_DNS_SERVER_TAG
  });

  routeRules.unshift({ action: 'sniff' });

  // TUN must hijack plain DNS. auto_route points Windows DNS at the TUN gateway
  // (e.g. 172.19.0.2); without hijack, OS DNS times out → total blackout.
  // Keep hijack immediately after sniff (sing-box recommended order).
  if (tunEnabled) {
    routeRules.splice(1, 0,
      { protocol: 'dns', action: 'hijack-dns' },
      { port: 53, action: 'hijack-dns' }
    );
  }

  if (captureRoutingEnabled) {
    if (captureInbounds.length && (proxyMode === 'global' || proxyMode === 'direct')) {
      const systemOutbound = proxyMode === 'direct' ? 'direct' : systemDefaultOutbound;
      routeRules.push({
        inbound: captureInbounds,
        outbound: systemOutbound
      });
    } else if (captureInbounds.length && proxyMode === 'rule') {
      if (storeSigninRules.length) {
        routeRules.push({
          inbound: captureInbounds,
          rule_set: SYSTEM_STORE_SIGNIN_RULESET_TAG,
          outbound: systemDefaultOutbound
        });
      }

      orderedRouteRules.forEach((rule) => routeRules.push(rule));

      if (builtInCnDirectRuleSetTags.length) {
        routeRules.push({
          inbound: captureInbounds,
          rule_set: builtInCnDirectRuleSetTags,
          outbound: 'direct'
        });
      }

      routeRules.push({
        inbound: captureInbounds,
        outbound: systemDefaultOutbound
      });
    }
  }

  const routingRuleIndexMap = new Map();
  routeRules.forEach((rule, index) => {
    const ruleSetTags = Array.isArray(rule.rule_set) ? rule.rule_set : [rule.rule_set].filter(Boolean);
    const matchedTag = ruleSetTags.find((tag) => routingHitMap.has(tag));
    if (matchedTag) {
      routingRuleIndexMap.set(String(index), {
        ruleTag: matchedTag,
        meta: routingHitMap.get(matchedTag)
      });
    }
  });

  const ruleSetConfig = [
    ...buildLocalRuleSetConfig(localDatabaseRuleSets, REMOTE_RULESET_CATALOG),
    ...orderedInlineRuleSets
  ];

  return {
    route: {
      rule_set: ruleSetConfig,
      rules: routeRules,
      auto_detect_interface: true,
      default_domain_resolver: 'dns-local',
      final: finalOutbound
    },
    dnsRouting: {
      captureInbounds,
      systemInbounds,
      localDirectDomains: LOCAL_DIRECT_DOMAINS,
      localDirectDomainSuffixes: LOCAL_DIRECT_DOMAIN_SUFFIXES,
      storeSigninRules,
      systemStoreSigninRuleSetTag: SYSTEM_STORE_SIGNIN_RULESET_TAG,
      orderedDnsRules,
      builtInCnDirectRuleSetTags,
      resolveDnsServerForOutbound
    },
    routingHitMap,
    routingRuleIndexMap
  };
};
