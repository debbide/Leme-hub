import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

import {
  BUILTIN_RULESETS,
  DEFAULT_CONFIG_FILE,
  DEFAULT_PROXY_BASE_PORT,
  DEFAULT_PROXY_LISTEN_HOST,
  REMOTE_RULESET_CATALOG
} from '../shared/constants.js';
import { formatHostForUrl, formatHostPort, isIpLiteralHost, normalizeHost, resolveLoopbackHost } from '../shared/network.js';

const BUILTIN_RULESET_MAP = new Map(BUILTIN_RULESETS.map((ruleset) => [ruleset.id, ruleset]));
const REMOTE_RULESET_MAP = new Map(REMOTE_RULESET_CATALOG.map((ruleset) => [ruleset.id, ruleset]));
const LOCAL_DIRECT_RULESET_TAG = 'builtin-local-bypass';
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
const LOCALHOST_DNS_SERVER_TAG = 'dns-hosts';
const PLATFORM_LOCAL_DNS_SERVER_TAG = 'dns-platform';

const resolveExistingFilePath = (candidatePath) => {
  const resolved = path.resolve(candidatePath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  if (process.platform !== 'win32') {
    return null;
  }

  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    return null;
  }

  const targetName = path.basename(resolved).toLowerCase();
  try {
    const match = fs.readdirSync(parentDir).find((entry) => String(entry || '').toLowerCase() === targetName);
    return match ? path.join(parentDir, match) : null;
  } catch {
    return null;
  }
};

const toInt = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const toList = (value) => Array.isArray(value)
  ? value.filter(Boolean)
  : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const applyIfPresent = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
};

const parsePluginString = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return {};
  }

  const [plugin, ...rest] = raw.split(';');
  return {
    plugin: plugin || undefined,
    plugin_opts: rest.length ? rest.join(';') : undefined
  };
};

const SUBSCRIPTION_USER_AGENT = 'Leme-Hub/0.1';
const PROXY_LINK_SCHEME_RE = /^(vmess|vless|trojan|ss|shadowsocks|socks|socks5|http|https|tuic|hy2|hysteria2):\/\//u;

const trimBase64Padding = (value) => value.replace(/=+$/u, '');

const looksLikeBase64Payload = (value) => {
  const normalized = String(value || '').trim().replace(/\s+/gu, '');
  if (!normalized || normalized.length < 16) {
    return false;
  }

  if (/[^A-Za-z0-9+/=_-]/u.test(normalized)) {
    return false;
  }

  const sanitized = trimBase64Padding(normalized).replace(/-/gu, '+').replace(/_/gu, '/');
  if (!sanitized || sanitized.length % 4 === 1) {
    return false;
  }

  try {
    const decoded = Buffer.from(sanitized, 'base64').toString('utf8');
    const decodedTrimmed = decoded.trim();
    return Boolean(decodedTrimmed) && (
      decodedTrimmed.includes('://')
      || decodedTrimmed.startsWith('{')
      || decodedTrimmed.startsWith('[')
      || decodedTrimmed.includes('proxies:')
      || decodedTrimmed.includes('outbounds')
    );
  } catch {
    return false;
  }
};

const decodeBase64Payload = (value) => {
  const normalized = trimBase64Padding(String(value || '').trim().replace(/\s+/gu, ''));
  return Buffer.from(normalized.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString('utf8');
};

const toBase64 = (value) => Buffer.from(String(value || ''), 'utf8').toString('base64');

const encodeShareName = (value, fallback = '') => encodeURIComponent(String(value || fallback || '').trim());

const buildQuery = (params) => {
  const search = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    if (typeof rawValue === 'boolean') {
      if (rawValue) {
        search.set(key, '1');
      }
      continue;
    }

    search.set(key, String(rawValue));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

const normalizeImportedProxyLink = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || PROXY_LINK_SCHEME_RE.test(trimmed) || !/%[0-9A-Fa-f]{2}/u.test(trimmed)) {
    return trimmed;
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    return PROXY_LINK_SCHEME_RE.test(decoded) ? decoded : trimmed;
  } catch {
    return trimmed;
  }
};

const buildRoutingObservabilityLines = (runtime = {}, config = {}) => {
  const {
    activeNodeId = null,
    proxyMode = 'rule',
    customRules = [],
    rulesets = [],
    routingItems = [],
    systemProxyEnabled = false
  } = runtime;

  const route = config.route || {};
  const rules = Array.isArray(route.rules) ? route.rules : [];
  const systemRule = rules.find((rule) => Array.isArray(rule.inbound)
    && rule.inbound.includes('system-socks')
    && rule.inbound.includes('system-http'));
  const systemFallback = rules[rules.length - 1];
  const activeOutbound = activeNodeId ? `out-${activeNodeId}` : 'direct';
  const lines = [];

  if (!systemProxyEnabled) {
    lines.push('[Routing] rule routing inactive: system proxy disabled');
  } else if (proxyMode !== 'rule') {
    lines.push(`[Routing] rule routing inactive: mode=${proxyMode}`);
  } else {
    const hasRoutingItems = Array.isArray(routingItems) && routingItems.length > 0;
    const routingItemCount = hasRoutingItems
      ? routingItems.length
      : customRules.length + rulesets.length;
    const label = hasRoutingItems ? 'routing item(s)' : 'manual rule(s)';
    lines.push(`[Routing] rule routing active: ${routingItemCount} ${label}, active outbound ${activeOutbound}`);
  }

  if (systemProxyEnabled) {
    const defaultOutbound = proxyMode === 'direct' ? 'direct' : activeOutbound;
    const fallbackOutbound = systemFallback?.outbound || systemRule?.outbound || route.final || defaultOutbound;
    lines.push(`[Routing] unmatched system traffic -> ${fallbackOutbound}`);
  }

  if (Array.isArray(routingItems) && routingItems.length) {
    routingItems.forEach((item, index) => {
      if (item.kind === 'rule') {
        lines.push(`[Routing] item ${index + 1}: rule ${item.type}=${item.value} -> ${item.action}${item.note ? ` (${item.note})` : ''}`);
      } else if (item.kind === 'builtin_ruleset') {
        const targetLabel = item.target === 'node' ? `node:${item.nodeId}` : item.target === 'node_group' ? `node_group:${item.groupId}` : item.target;
        lines.push(`[Routing] item ${index + 1}: builtin ${item.presetId} -> ${targetLabel}`);
      } else if (item.kind === 'custom_entry') {
        const targetLabel = item.target === 'node' ? `node:${item.nodeId}` : item.target === 'node_group' ? `node_group:${item.groupId}` : item.target;
        lines.push(`[Routing] item ${index + 1}: custom ${item.type}=${item.value} -> ${targetLabel}`);
      }
    });
  } else {
    if (Array.isArray(customRules) && customRules.length) {
      customRules.forEach((rule, index) => {
        lines.push(`[Routing] rule ${index + 1}: ${rule.type}=${rule.value} -> ${rule.action}${rule.note ? ` (${rule.note})` : ''}`);
      });
    } else {
      lines.push('[Routing] no manual rules configured');
    }

    if (Array.isArray(rulesets) && rulesets.length) {
      rulesets.filter((ruleset) => ruleset.enabled !== false).forEach((ruleset) => {
        const targetLabel = ruleset.target === 'node' ? `node:${ruleset.nodeId}` : ruleset.target;
        lines.push(`[Routing] ruleset ${ruleset.name || ruleset.id} -> ${targetLabel}`);
      });
    } else {
      lines.push('[Routing] no rulesets configured');
    }
  }

  return lines;
};

export class ProxyService {
  constructor(options = {}) {
    const {
      configDir,
      projectRoot,
      proxyListen = process.env.PROXY_LISTEN || DEFAULT_PROXY_LISTEN_HOST,
      basePort = DEFAULT_PROXY_BASE_PORT,
      configFileName = DEFAULT_CONFIG_FILE,
      log = console,
      onRoutingHit = null
    } = typeof options === 'string' ? { configDir: options } : options;

    this.proxyProcess = null;
    this.nodes = [];
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
    this.proxyListen = normalizeHost(proxyListen, DEFAULT_PROXY_LISTEN_HOST);
    this.basePort = basePort;
    this.log = log;
    this.onRoutingHit = typeof onRoutingHit === 'function' ? onRoutingHit : null;
    this.binName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';
    this.nodePortMap = new Map();
    this.routingHitMap = new Map();
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
  }

  setNodes(nodes) {
    this.nodes = Array.isArray(nodes) ? nodes : [];
    this.updatePortMap();
  }

  resolveDefaultNodeId(validNodes, requestedNodeId) {
    if (requestedNodeId && validNodes.some((node) => node.id === requestedNodeId)) {
      return requestedNodeId;
    }

    return validNodes[0]?.id || null;
  }

  updatePortMap() {
    this.nodePortMap.clear();
    const usedPorts = new Set();
    const reservedPorts = new Set([18998, 18999]);

    reservedPorts.forEach((port) => {
      if (Number.isInteger(port) && port > 0) {
        usedPorts.add(port);
      }
    });

    this.nodes.forEach((node, index) => {
      let desiredPort = null;

      if (node && node.local_port !== undefined && node.local_port !== null) {
        const parsed = parseInt(node.local_port, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          desiredPort = parsed;
        }
      }

      if (!desiredPort || usedPorts.has(desiredPort)) {
        desiredPort = this.basePort + index;
        while (usedPorts.has(desiredPort)) {
          desiredPort += 1;
        }
      }

      usedPorts.add(desiredPort);
      this.nodePortMap.set(node.id, desiredPort);
    });
  }

  getLocalPort(nodeId) {
    return this.nodePortMap.get(nodeId);
  }

  generateConfig(options = {}) {
    const {
      activeNodeId = null,
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
      systemProxyEnabled = false,
      systemProxyHttpPort,
      systemProxySocksPort
    } = options;
    const uuidRequired = new Set(['vmess', 'vless', 'tuic']);
    const isValidUuid = (value) => typeof value === 'string'
      && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

    const validNodes = (this.nodes || []).filter((node) => {
      if (!node) {
        return false;
      }

      if (uuidRequired.has(node.type)) {
        const uuid = node.uuid || '';
        if (!isValidUuid(uuid)) {
          const label = node.name || node.id || node.type;
          this.log.error(`[ProxyService] Skipping node ${label}: invalid uuid "${uuid}"`);
          return false;
        }
      }

      return true;
    });

    this.nodes = validNodes;
    this.updatePortMap();
    const effectiveNodeId = this.resolveDefaultNodeId(validNodes, activeNodeId);

    const inbounds = validNodes.map((node, index) => ({
      type: 'socks',
      tag: `in-${node.id}`,
      listen: this.proxyListen,
      listen_port: this.nodePortMap.get(node.id) || (this.basePort + index)
    }));

    const outbounds = validNodes.map((node) => {
      const serverHost = normalizeHost(node.server);
      const outbound = {
        type: node.type,
        tag: `out-${node.id}`,
        server: serverHost,
        server_port: node.port
      };

      if (serverHost && !isIpLiteralHost(serverHost)) {
        outbound.domain_resolver = 'dns-local';
      }

      if (node.password) {
        outbound.password = node.password;
      }

      if (node.type === 'socks' || node.type === 'http') {
        if (node.username) {
          outbound.username = node.username;
        }
        if (node.password) {
          outbound.password = node.password;
        }
        if (node.type === 'socks') {
          outbound.version = node.version || '5';
        }
      }

      if (node.uuid) {
        let uuid = node.uuid;
        if (uuid.includes('%3A') || uuid.includes(':')) {
          uuid = decodeURIComponent(uuid).split(':')[0];
        }
        outbound.uuid = uuid;
      }

      if (node.type === 'vmess') {
        outbound.security = node.security || 'none';
        outbound.alter_id = parseInt(node.alterId || 0, 10);
        outbound.packet_encoding = node.packet_encoding || 'packetaddr';
      } else if (node.type === 'shadowsocks') {
        outbound.method = node.method || 'aes-256-gcm';
        applyIfPresent(outbound, 'plugin', node.plugin);
        applyIfPresent(outbound, 'plugin_opts', node.plugin_opts);
      } else if (node.type === 'vless') {
        outbound.packet_encoding = node.packet_encoding || 'xudp';
      }

      applyIfPresent(outbound, 'network', node.network);
      applyIfPresent(outbound, 'ip', node.ip);

      const isTls = node.security === 'tls' || node.security === 'reality' || node.tls === true;

      if (isTls || node.sni) {
        outbound.tls = {
          enabled: true,
          server_name: normalizeHost(node.sni) || node.wsHost || serverHost,
          insecure: !!node.insecure,
          utls: {
            enabled: true,
            fingerprint: node.fp || 'chrome'
          }
        };

        if (node.record_fragment !== undefined) {
          outbound.tls.record_fragment = !!node.record_fragment;
        }

        if (node.alpn) {
          outbound.tls.alpn = toList(node.alpn);
        } else if (node.transport === 'ws') {
          outbound.tls.alpn = ['http/1.1'];
        }

        applyIfPresent(outbound.tls, 'min_version', node.tls_min_version);
        applyIfPresent(outbound.tls, 'max_version', node.tls_max_version);
        if (node.tls_cipher_suites) {
          outbound.tls.cipher_suites = toList(node.tls_cipher_suites);
        }
        if (node.certificate_public_key_sha256) {
          outbound.tls.certificate_public_key_sha256 = toList(node.certificate_public_key_sha256);
        }

        if (node.security === 'reality') {
          outbound.tls.reality = {
            enabled: true,
            public_key: node.pbk,
            short_id: node.sid
          };
          if (node.spx) {
            outbound.tls.reality.spider_x = node.spx;
          }
          if (node.reality_next_protocol) {
            outbound.tls.reality.next_protocol = toList(node.reality_next_protocol);
          }
        }
      }

      if (node.transport === 'ws') {
        let cleanPath = node.wsPath || '/';
        let maxEarlyData = node.max_early_data;

        if (cleanPath.includes('ed=')) {
          const match = cleanPath.match(/[?&]ed=(\d+)/);
          if (match && match[1]) {
            if (maxEarlyData === undefined) {
              maxEarlyData = parseInt(match[1], 10);
            }
            cleanPath = cleanPath.replace(/[?&]ed=\d+/, '');
            cleanPath = cleanPath.replace(/\?$/, '').replace(/&$/, '');
            if (!cleanPath) {
              cleanPath = '/';
            }
          }
        }

        outbound.transport = {
          type: 'ws',
          path: cleanPath,
          headers: {}
        };

        const hostHeader = node.wsHost || normalizeHost(node.sni) || serverHost;
        if (hostHeader && !isIpLiteralHost(hostHeader)) {
          outbound.transport.headers.Host = hostHeader;
          if (outbound.tls && !outbound.tls.server_name) {
            outbound.tls.server_name = hostHeader;
          }
        }

        if (maxEarlyData !== undefined) {
          outbound.transport.max_early_data = parseInt(maxEarlyData, 10);
          outbound.transport.early_data_header_name = node.early_data_header_name || 'Sec-WebSocket-Protocol';
        }

        if (node.headers && typeof node.headers === 'object') {
          outbound.transport.headers = {
            ...outbound.transport.headers,
            ...node.headers
          };
        }
      } else if (node.transport === 'grpc') {
        outbound.transport = {
          type: 'grpc',
          service_name: node.serviceName || ''
        };

        if (node.grpc_idle_timeout !== undefined) {
          outbound.transport.idle_timeout = `${node.grpc_idle_timeout}s`;
        }
        if (node.grpc_ping_timeout !== undefined) {
          outbound.transport.ping_timeout = `${node.grpc_ping_timeout}s`;
        }
        if (node.grpc_permit_without_stream !== undefined) {
          outbound.transport.permit_without_stream = !!node.grpc_permit_without_stream;
        }
      }

      if (node.type === 'vless' && node.flow) {
        outbound.flow = node.flow;
      }

      if (node.type === 'hysteria2') {
        outbound.password = node.password;
        if (node.obfs) {
          outbound.obfs = {
            type: node.obfs,
            password: node.obfs_password || ''
          };
        }
        applyIfPresent(outbound, 'up_mbps', node.up_mbps);
        applyIfPresent(outbound, 'down_mbps', node.down_mbps);
        applyIfPresent(outbound, 'heartbeat', node.heartbeat);
        applyIfPresent(outbound, 'udp_over_stream', node.udp_over_stream);
        applyIfPresent(outbound, 'zero_rtt_handshake', node.zero_rtt_handshake);
      }

      if (node.type === 'tuic') {
        outbound.uuid = node.uuid;
        outbound.password = node.password;
        outbound.congestion_control = node.congestion_control || 'bbr';
        outbound.udp_relay_mode = node.udp_relay_mode || 'quic-rfc';
        applyIfPresent(outbound, 'ip', node.ip);
        applyIfPresent(outbound, 'heartbeat', node.heartbeat);
        applyIfPresent(outbound, 'udp_over_stream', node.udp_over_stream);
        applyIfPresent(outbound, 'zero_rtt_handshake', node.zero_rtt_handshake);

        if (!outbound.tls) {
          outbound.tls = {
            enabled: true,
            server_name: normalizeHost(node.sni) || serverHost,
            insecure: !!node.insecure
          };
          if (node.alpn) {
            outbound.tls.alpn = Array.isArray(node.alpn) ? node.alpn : [node.alpn];
          }
        }

        if (outbound.tls && outbound.tls.utls) {
          delete outbound.tls.utls;
        }
      }

      if (node.type === 'hysteria2' && outbound.tls && outbound.tls.utls) {
        delete outbound.tls.utls;
      }

      return outbound;
    });

    if (systemProxyEnabled && systemProxySocksPort) {
      inbounds.push({
        type: 'socks',
        tag: 'system-socks',
        listen: this.proxyListen,
        listen_port: systemProxySocksPort
      });
    }

    if (systemProxyEnabled && systemProxyHttpPort) {
      inbounds.push({
        type: 'http',
        tag: 'system-http',
        listen: this.proxyListen,
        listen_port: systemProxyHttpPort
      });
    }

    const activeOutbound = effectiveNodeId ? `out-${effectiveNodeId}` : 'direct';
    const nodeGroupMap = new Map((nodeGroups || []).map((group) => [group.id, group]));
    this.routingHitMap = new Map();
    const registerRoutingHit = (tag, meta) => {
      this.routingHitMap.set(tag, meta);
      return tag;
    };
    const localDatabaseRuleSets = Object.fromEntries(REMOTE_RULESET_CATALOG.map((ruleset) => {
      const expectedPath = path.join(this.rulesDir, `${ruleset.tag}.${ruleset.format === 'source' ? 'json' : 'srs'}`);
      return [ruleset.tag, resolveExistingFilePath(expectedPath) || expectedPath];
    }));
    const resolveManualRuleOutbound = (rule) => {
      if (rule.action === 'direct') return 'direct';
      if (rule.action === 'node' && rule.nodeId && validNodes.some((node) => node.id === rule.nodeId)) {
        return `out-${rule.nodeId}`;
      }
      if (rule.action === 'node_group' && rule.nodeGroupId) {
        const group = nodeGroupMap.get(rule.nodeGroupId);
        if (group?.selectedNodeId && validNodes.some((node) => node.id === group.selectedNodeId)) {
          return `out-${group.selectedNodeId}`;
        }
      }
      return activeOutbound;
    };
    const buildRulesetOutbound = (ruleset) => {
      if (ruleset.target === 'direct') return 'direct';
      if (ruleset.target === 'default') return activeOutbound;
      if (ruleset.target === 'node' && ruleset.nodeId && validNodes.some((node) => node.id === ruleset.nodeId)) {
        return `out-${ruleset.nodeId}`;
      }
      if (ruleset.target === 'node_group' && ruleset.groupId) {
        const group = nodeGroupMap.get(ruleset.groupId);
        if (group?.selectedNodeId && validNodes.some((node) => node.id === group.selectedNodeId)) {
          return `out-${group.selectedNodeId}`;
        }
      }
      return activeOutbound;
    };

    const normalizedRoutingItems = Array.isArray(routingItems) && routingItems.length
      ? routingItems
      : [
        ...customRules.map((rule) => ({ ...rule, kind: 'rule' })),
        ...rulesets.flatMap((ruleset) => ruleset.kind === 'builtin'
          ? [{ ...ruleset, kind: 'builtin_ruleset' }]
          : (ruleset.entries || []).map((entry) => ({
            id: entry.id,
            rulesetId: ruleset.id,
            rulesetName: ruleset.name,
            kind: 'custom_entry',
            type: entry.type,
            value: entry.value,
            target: ruleset.target,
            nodeId: ruleset.nodeId,
            groupId: ruleset.groupId,
            enabled: ruleset.enabled !== false,
            note: entry.note || ruleset.note || ''
          })))
      ];

    const orderedInlineRuleSets = [];
    const orderedRouteRules = [];
    const customRulesetBuckets = new Map();
    const systemInbounds = ['system-socks', 'system-http'].filter((tag) => inbounds.some((inbound) => inbound.tag === tag));
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
        orderedRouteRules.push({ inbound: systemInbounds, rule_set: tag, outbound });
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
          orderedRouteRules.push({ inbound: systemInbounds, rule_set: remoteRuleSetTags, outbound });
        }
        orderedRouteRules.push({ inbound: systemInbounds, rule_set: inlineTagName, outbound });
        if (Array.isArray(builtin.entries) && builtin.entries.length) {
          orderedInlineRuleSets.push({
            type: 'inline',
            tag: inlineTag,
            rules: builtin.entries.map((entry) => ({ [entry.type]: [entry.value] }))
          });
        }
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
        orderedRouteRules.push({ inbound: systemInbounds, rule_set: tag, outbound });
      }
    });

    const finalOutbound = !systemProxyEnabled || proxyMode === 'rule'
      ? 'direct'
      : proxyMode === 'direct'
        ? 'direct'
        : activeOutbound;

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

    routeRules.unshift({ action: 'sniff' });

    if (systemProxyEnabled) {
      if (systemInbounds.length && (proxyMode === 'global' || proxyMode === 'direct')) {
        const systemOutbound = proxyMode === 'direct' ? 'direct' : activeOutbound;
        routeRules.push({
          inbound: systemInbounds,
          outbound: systemOutbound
        });
      } else if (systemInbounds.length && proxyMode === 'rule') {
        const builtInDatabaseTags = ['geosite-cn', 'geoip-cn']
          .filter((tag) => Boolean(resolveExistingFilePath(localDatabaseRuleSets[tag])));

        if (builtInDatabaseTags.length) {
          routeRules.push({
            inbound: systemInbounds,
            rule_set: builtInDatabaseTags,
            outbound: 'direct'
          });
        }

        orderedRouteRules.forEach((rule) => routeRules.push(rule));

        routeRules.push({
          inbound: systemInbounds,
          outbound: activeOutbound
        });
      }
    }

    const buildDnsServer = (tag, raw, detour = '', domainResolver = '') => {
      const value = String(raw || '').trim();
      if (!value) {
        return { type: 'local', tag };
      }
      try {
        const parsed = new URL(value);
        const scheme = String(parsed.protocol || '').replace(':', '').toLowerCase();
        const host = normalizeHost(parsed.hostname);
        const port = parsed.port ? Number.parseInt(parsed.port, 10) : (scheme === 'https' ? 443 : 53);
        if (scheme === 'https') {
          const server = {
            type: 'https',
            tag,
            server: host,
            server_port: port,
            path: parsed.pathname || '/dns-query'
          };
          if (detour) server.detour = detour;
          if (domainResolver) server.domain_resolver = domainResolver;
          return server;
        }
        const server = {
          type: 'udp',
          tag,
          server: host,
          server_port: port || 53
        };
        if (detour) server.detour = detour;
        if (domainResolver) server.domain_resolver = domainResolver;
        return server;
      } catch {
        const fallbackValue = normalizeHost(value);
        const ipv6Literal = isIpLiteralHost(fallbackValue) && fallbackValue.includes(':');
        const [host, portText] = (!ipv6Literal && fallbackValue.includes(':')) ? fallbackValue.split(':') : [fallbackValue, '53'];
        return {
          type: 'udp',
          tag,
          server: host,
          server_port: Number.parseInt(portText, 10) || 53
        };
      }
    };

    const dnsRuleSetTags = ['geosite-cn', 'geoip-cn'].filter((tag) => Boolean(resolveExistingFilePath(localDatabaseRuleSets[tag])));
    const dnsRules = [
      {
        domain: LOCAL_DIRECT_DOMAINS,
        server: LOCALHOST_DNS_SERVER_TAG
      },
      {
        domain_suffix: LOCAL_DIRECT_DOMAIN_SUFFIXES,
        server: PLATFORM_LOCAL_DNS_SERVER_TAG
      }
    ];

    if (dnsRuleSetTags.length) {
      dnsRules.push({ rule_set: dnsRuleSetTags, server: 'dns-local' });
    }

    return {
      log: { level: proxyMode === 'rule' ? 'debug' : 'info' },
      inbounds,
      outbounds: [...outbounds, { type: 'direct', tag: 'direct' }],
      dns: {
        servers: [
          {
            type: 'hosts',
            tag: LOCALHOST_DNS_SERVER_TAG,
            predefined: {
              localhost: ['127.0.0.1', '::1']
            }
          },
          {
            type: 'local',
            tag: PLATFORM_LOCAL_DNS_SERVER_TAG
          },
          buildDnsServer('dns-bootstrap', dnsBootstrapServer),
          buildDnsServer('dns-remote', dnsRemoteServer, String(activeOutbound || '').trim(), 'dns-bootstrap'),
          buildDnsServer('dns-local', dnsDirectServer, '', 'dns-bootstrap')
        ],
        rules: dnsRules,
        final: String(dnsFinal || '').trim() === 'dns-local' ? 'dns-local' : 'dns-remote',
        strategy: ['prefer_ipv4', 'ipv4_only', 'prefer_ipv6', 'ipv6_only'].includes(String(dnsStrategy || '').trim()) ? String(dnsStrategy || '').trim() : 'prefer_ipv4',
        independent_cache: true
      },
      route: {
        rule_set: [
          ...Object.entries(localDatabaseRuleSets)
            .map(([tag, filePath]) => [tag, resolveExistingFilePath(filePath)])
            .filter(([, filePath]) => Boolean(filePath))
            .map(([tag, filePath]) => ({
              type: 'local',
              tag,
              format: REMOTE_RULESET_CATALOG.find((ruleset) => ruleset.tag === tag)?.format || 'binary',
              path: filePath
            })),
          ...orderedInlineRuleSets
        ],
        rules: routeRules,
        auto_detect_interface: true,
        default_domain_resolver: 'dns-remote',
        final: finalOutbound
      },
      experimental: {
        clash_api: {
          external_controller: formatHostPort(resolveLoopbackHost(this.proxyListen), 9095),
          secret: '',
          default_mode: proxyMode
        }
      }
    };
  }

  getRoutingObservabilityLines(runtime = {}) {
    return buildRoutingObservabilityLines(runtime, this.generateConfig(runtime));
  }

  resolveRoutingHit(ruleTag, host, outboundTag, options = {}) {
    const allowHeuristic = Boolean(options.allowHeuristic);
    const rawTag = String(ruleTag || '').trim();
    if (rawTag) {
      const tokens = rawTag.split(/[\s,|;]+/u).filter(Boolean);
      for (const token of tokens) {
        const direct = this.routingHitMap.get(token);
        if (direct) {
          return {
            ...direct,
            matchedTag: token,
            matchedBy: 'tag'
          };
        }

        for (const [registeredTag, meta] of this.routingHitMap.entries()) {
          if (token.includes(registeredTag) || registeredTag.includes(token)) {
            return {
              ...meta,
              matchedTag: registeredTag,
              matchedBy: 'tag-fuzzy'
            };
          }
        }
      }
    }

    if (!allowHeuristic) {
      return null;
    }

    const value = String(host || '').toLowerCase();
    if (!value) return null;

    for (const [, meta] of this.routingHitMap.entries()) {
      if (meta.kind === 'rule') {
        const descriptor = meta.descriptor || '';
        const [type, expectedRaw] = descriptor.split('=');
        const expected = String(expectedRaw || '').toLowerCase();
        if (!expected) continue;
        const outboundMatches = meta.target === 'direct' ? outboundTag === 'direct' : outboundTag === meta.target;
        if (!outboundMatches) continue;

        if ((type === 'domain' && value === expected)
          || (type === 'domain_suffix' && (value === expected || value.endsWith(`.${expected}`)))
          || (type === 'domain_keyword' && value.includes(expected))) {
          return {
            ...meta,
            matchedBy: 'host-heuristic'
          };
        }
      }

      if (meta.kind === 'ruleset') {
        const outboundMatches = meta.target === 'direct' ? outboundTag === 'direct' : outboundTag === meta.target;
        if (!outboundMatches) continue;
        if (String(meta.descriptor || '').toLowerCase().includes('youtube') && value.includes('youtube')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('google') && value.includes('google')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('github') && value.includes('github')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('telegram') && value.includes('telegram')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('tiktok') && value.includes('tiktok')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('netflix') && value.includes('netflix')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('paypal') && value.includes('paypal')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('steam') && value.includes('steam')) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('microsoft') && (value.includes('microsoft') || value.includes('live.com'))) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('onedrive') && (value.includes('onedrive') || value.includes('1drv.com'))) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('apple') && (value.includes('apple') || value.includes('icloud'))) return { ...meta, matchedBy: 'host-heuristic' };
        if (String(meta.descriptor || '').toLowerCase().includes('ai') && (value.includes('openai') || value.includes('anthropic') || value.includes('claude.ai') || value.includes('midjourney'))) return { ...meta, matchedBy: 'host-heuristic' };
      }
    }

    return null;
  }

  resolveExecutablePath(explicitPath) {
    if (!explicitPath) {
      throw new Error('ProxyService.start requires a resolved sing-box executable path');
    }

    const candidate = path.resolve(explicitPath);
    if (!fs.existsSync(candidate)) {
      throw new Error(`Resolved sing-box executable does not exist: ${candidate}`);
    }

    return candidate;
  }

  writeConfig(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  waitForPortReady(port, timeoutMs = 15000) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const attempt = () => {
        const socket = new net.Socket();

        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });

        socket.once('error', () => {
          socket.destroy();
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error(`Timed out waiting for sing-box to listen on ${this.proxyListen}:${port}`));
            return;
          }

          setTimeout(attempt, 200);
        });

        socket.connect(port, this.proxyListen);
      };

      attempt();
    });
  }

  async waitForRuntimeReady(runtime = {}) {
    const ports = new Set((this.nodes || []).map((node) => this.getLocalPort(node.id)).filter(Boolean));

    if (runtime.systemProxyEnabled && runtime.systemProxySocksPort) {
      ports.add(runtime.systemProxySocksPort);
    }

    if (runtime.systemProxyEnabled && runtime.systemProxyHttpPort) {
      ports.add(runtime.systemProxyHttpPort);
    }

    if (!ports.size) {
      return;
    }

    await Promise.all([...ports].map((port) => this.waitForPortReady(port)));
  }

  async start(options = {}) {
    if (this.nodes.length === 0) {
      throw new Error('No proxy nodes configured');
    }

    const config = this.generateConfig(options.runtime || {});
    this.writeConfig(config);
    buildRoutingObservabilityLines(options.runtime || {}, config)
      .forEach((line) => this.log.log(line));
    this.stop();

    const execPath = this.resolveExecutablePath(options.binPath);
    this.proxyProcess = spawn(execPath, ['run', '-c', this.configPath]);

    this.proxyProcess.stdout.on('data', (data) => {
      data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => {
        const inboundMatch = line.match(/\[(\d+)\]\s+inbound\/(?:http|mixed|socks)\[(system-http|system-socks)\]: inbound connection to ([^:]+):(\d+)/);
        if (inboundMatch) {
          const [, connId, inboundTag, host, port] = inboundMatch;
          this.connectionTraceMap.set(connId, {
            inboundTag,
            host,
            port,
            ruleTag: null,
            createdAt: Date.now()
          });
        }

        const ruleMatch = line.match(/\[(\d+)\].*match(?:ed)?\s+rule(?:[_\s-]?set)?[^\[]*\[([^\]]+)\]/iu);
        if (ruleMatch) {
          const [, connId, ruleTag] = ruleMatch;
          const trace = this.connectionTraceMap.get(connId);
          if (trace) {
            trace.ruleTag = String(ruleTag || '').trim();
            this.connectionTraceMap.set(connId, trace);
          }
        }

        const outboundMatch = line.match(/\[(\d+)\].*outbound\/[^\[]+\[(out-[^\]]+)\]: outbound connection to ([^:]+):(\d+)/);
        if (outboundMatch) {
          const [, connId, outboundTag, host] = outboundMatch;
          const trace = this.connectionTraceMap.get(connId);
          if (trace && trace.inboundTag && ['system-http', 'system-socks'].includes(trace.inboundTag)) {
            const hit = this.resolveRoutingHit(trace.ruleTag, trace.host || host, outboundTag, { allowHeuristic: false });
            if (hit) {
              const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
              this.log.log(`[${ts}] [Routing Hit] ${hit.kind}:${hit.name} -> ${hit.target} | ${hit.descriptor}`);
              if (this.onRoutingHit) {
                try {
                  this.onRoutingHit({
                    timestamp: new Date().toISOString(),
                    host: trace.host || host || null,
                    port: trace.port ? Number(trace.port) : null,
                    outbound: outboundTag,
                    kind: hit.kind,
                    name: hit.name,
                    target: hit.target,
                    descriptor: hit.descriptor,
                    matchedTag: hit.matchedTag || null,
                    matchedBy: hit.matchedBy || null,
                    matchType: hit.matchType || null,
                    matchValue: hit.matchValue || null
                  });
                } catch {
                  // ignore hook failures to keep proxy runtime stable
                }
              }
            }
          }
          this.connectionTraceMap.delete(connId);
        }

        this.log.log(`[Proxy Log] ${line}`);
      });
    });

    this.proxyProcess.stderr.on('data', (data) => {
      this.log.error(`[Proxy STDERR] ${data.toString().trim()}`);
    });

    this.proxyProcess.on('error', (error) => {
      this.log.error(`[ProxyService] Failed to start sing-box process: ${error.message}`);
    });

    await this.waitForRuntimeReady(options.runtime || {});

    return {
      started: true,
      configPath: this.configPath,
      executablePath: execPath
    };
  }

  stop() {
    if (this.proxyProcess) {
      this.proxyProcess.kill();
      this.proxyProcess = null;
    }
  }

  async restart(nodes, options = {}) {
    this.setNodes(nodes);
    return this.start(options);
  }

  parseProxyLink(link) {
    try {
      const value = normalizeImportedProxyLink(link);
      if (value.startsWith('{') && value.endsWith('}')) {
        return null;
      }

      if (value.startsWith('vmess://')) {
        const b64 = value.replace('vmess://', '');
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
        return {
          id: Math.random().toString(36).substring(2, 9),
          name: json.ps || 'VMess',
          type: 'vmess',
          server: normalizeHost(json.add),
          port: parseInt(json.port, 10),
          uuid: json.id,
          security: json.scy || 'auto',
          alterId: parseInt(json.aid || 0, 10),
          transport: json.net === 'ws' ? 'ws' : (json.net === 'grpc' ? 'grpc' : 'tcp'),
          wsPath: json.path || '',
          wsHost: json.host || '',
          tls: json.tls === 'tls',
          sni: normalizeHost(json.sni || json.host || ''),
          serviceName: json.path || '',
          alpn: json.alpn || '',
          fp: json.fp || '',
          packet_encoding: json.packetEncoding || json.packet_encoding || ''
        };
      }

      const url = new URL(value);
      const protocol = url.protocol.slice(0, -1).toLowerCase();
      const nodeId = Math.random().toString(36).substring(2, 9);
      const name = decodeURIComponent(url.hash.slice(1)) || `${protocol}_${nodeId}`;
      const params = new URLSearchParams(url.search);

      const config = {
        id: nodeId,
        name,
        type: protocol,
        server: normalizeHost(url.hostname),
        port: parseInt(url.port, 10)
      };

      if (Number.isNaN(config.port)) {
        config.port = (params.get('security') === 'tls' || params.get('tls') === '1') ? 443 : 80;
      }

      if (params.get('sni')) config.sni = normalizeHost(params.get('sni'));
      if (params.get('security')) config.security = params.get('security');
      if (['tls', '1', 'true'].includes(params.get('tls'))) config.tls = true;
      if (params.get('alpn')) config.alpn = params.get('alpn');
      if (params.get('type') === 'grpc' && !params.get('serviceName') && params.get('path')) {
        config.serviceName = params.get('path');
      }
      if (params.get('path')) config.wsPath = params.get('path');
      config.wsHost = params.get('host') || params.get('wsHost') || '';
      config.transport = params.get('type') || params.get('transport') || params.get('net') || 'tcp';

      if (params.get('serviceName')) config.serviceName = params.get('serviceName');
      if (params.get('service_name')) config.serviceName = params.get('service_name');
      if (params.get('fp')) config.fp = params.get('fp');
      if (params.get('pbk')) config.pbk = params.get('pbk');
      if (params.get('sid')) config.sid = params.get('sid');
      if (params.get('short_id') && !config.sid) config.sid = params.get('short_id');
      if (params.get('spx')) config.spx = params.get('spx');
      if (params.get('flow')) config.flow = params.get('flow');
      if (params.get('packet_encoding')) config.packet_encoding = params.get('packet_encoding');
      if (params.get('ed')) config.max_early_data = params.get('ed');
      if (params.get('eh')) config.early_data_header_name = params.get('eh');
      if (params.get('network')) config.network = params.get('network');
      if (params.get('plugin')) {
        Object.assign(config, parsePluginString(params.get('plugin')));
      }
      if (params.get('plugin-opts') && !config.plugin_opts) config.plugin_opts = params.get('plugin-opts');
      if (params.get('plugin_opts') && !config.plugin_opts) config.plugin_opts = params.get('plugin_opts');
      if (params.get('ip')) config.ip = normalizeHost(params.get('ip'));
      if (params.get('obfs-password')) config.obfs_password = params.get('obfs-password');
      if (params.get('obfs_password')) config.obfs_password = params.get('obfs_password');
      if (params.get('upmbps')) config.up_mbps = toInt(params.get('upmbps'));
      if (params.get('up')) config.up_mbps = toInt(params.get('up'), config.up_mbps);
      if (params.get('downmbps')) config.down_mbps = toInt(params.get('downmbps'));
      if (params.get('down')) config.down_mbps = toInt(params.get('down'), config.down_mbps);
      if (params.get('congestion_control')) config.congestion_control = params.get('congestion_control');
      if (params.get('udp_relay_mode')) config.udp_relay_mode = params.get('udp_relay_mode');
      if (params.get('heartbeat')) config.heartbeat = params.get('heartbeat');
      if (params.get('udp_over_stream')) config.udp_over_stream = toBool(params.get('udp_over_stream'));
      if (params.get('zero_rtt_handshake')) config.zero_rtt_handshake = toBool(params.get('zero_rtt_handshake'));
      if (params.get('tls_min_version')) config.tls_min_version = params.get('tls_min_version');
      if (params.get('tls_max_version')) config.tls_max_version = params.get('tls_max_version');
      if (params.get('tls_cipher_suites')) config.tls_cipher_suites = params.get('tls_cipher_suites');
      if (params.get('certificate_public_key_sha256')) config.certificate_public_key_sha256 = params.get('certificate_public_key_sha256');
      if (params.get('reality_next_protocol')) config.reality_next_protocol = params.get('reality_next_protocol');
      if (params.get('idle_timeout')) config.grpc_idle_timeout = toInt(params.get('idle_timeout'));
      if (params.get('ping_timeout')) config.grpc_ping_timeout = toInt(params.get('ping_timeout'));
      if (params.get('permit_without_stream')) config.grpc_permit_without_stream = toBool(params.get('permit_without_stream'));

      if (['1', 'true'].includes(params.get('record_fragment'))) config.record_fragment = true;
      if (toBool(params.get('insecure')) || toBool(params.get('allowInsecure')) || toBool(params.get('allow_insecure'))) {
        config.insecure = true;
      }

      const rawUser = decodeURIComponent(url.username || '');
      const rawPass = decodeURIComponent(url.password || '');

      if (protocol === 'tuic') {
        if (rawUser.includes(':')) {
          const [uuid, password] = rawUser.split(':', 2);
          config.uuid = uuid;
          config.password = password;
        } else {
          config.uuid = rawUser;
          config.password = rawPass;
        }
      } else if (protocol === 'hysteria2' || protocol === 'hy2') {
        config.type = 'hysteria2';
        config.password = rawUser || rawPass;
        config.obfs = params.get('obfs');
        config.tls = true;
        config.security = config.security || 'tls';
        if (!config.sni) {
          config.sni = config.server;
        }
        if (!url.port) {
          config.port = 443;
        }
        if (params.get('obfs-password') || params.get('obfs_password')) {
          config.obfs_password = params.get('obfs-password') || params.get('obfs_password');
        }
      } else if (protocol === 'vless') {
        config.uuid = rawUser || rawPass;
      } else if (protocol === 'trojan') {
        config.password = rawUser;
        config.tls = true;
        config.security = config.security || 'tls';
        if (!config.sni) {
          config.sni = config.server;
        }
        if (!url.port) {
          config.port = 443;
        }
      } else if (protocol === 'ss' || protocol === 'shadowsocks') {
        config.type = 'shadowsocks';
        if (rawUser && !rawPass && !rawUser.includes(':')) {
          try {
            const decoded = Buffer.from(rawUser, 'base64').toString('utf-8');
            if (decoded.includes(':')) {
              const [method, password] = decoded.split(':', 2);
              config.method = method;
              config.password = password;
            } else {
              config.method = rawUser;
            }
          } catch (error) {
            config.method = rawUser;
          }
        } else {
          config.method = rawUser;
          config.password = rawPass;
        }

        if (params.get('plugin')) {
          Object.assign(config, parsePluginString(params.get('plugin')));
        }
      } else if (['socks5', 'socks', 'http'].includes(protocol)) {
        config.type = protocol === 'http' ? 'http' : 'socks';
        config.username = rawUser;
        config.password = rawPass;
      } else {
        return null;
      }

      return config;
    } catch (error) {
      this.log.error(`[ProxyService] Link parse error: ${error.message}`);
      return null;
    }
  }

  parseProxyLinks(input) {
    return String(input || '')
      .split(/\r?\n|\s+(?=(?:vmess|vless|trojan|ss|shadowsocks|socks|socks5|http|https|tuic|hy2|hysteria2):\/\/)/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => this.parseProxyLink(item))
      .filter(Boolean);
  }

  extractConfigNodes(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload.filter((item) => item && typeof item === 'object');
    }

    const candidates = [];
    if (Array.isArray(payload.outbounds)) {
      candidates.push(...payload.outbounds);
    }
    if (Array.isArray(payload.proxies)) {
      candidates.push(...payload.proxies);
    }

    return candidates.filter((item) => item && typeof item === 'object');
  }

  normalizeConfigNode(node, index = 0) {
    const type = String(node.type || '').toLowerCase();
    if (!type || ['direct', 'block', 'dns', 'selector', 'urltest'].includes(type)) {
      return null;
    }

    const normalized = {
      id: node.id || Math.random().toString(36).substring(2, 9),
      name: node.name || node.tag || `${type}-${index + 1}`,
      type,
      server: normalizeHost(node.server),
      port: toInt(node.port ?? node.server_port)
    };

    if (!normalized.server || !normalized.port) {
      return null;
    }

    const fieldMap = {
      uuid: node.uuid,
      password: node.password,
      username: node.username,
      method: node.method,
      security: node.security,
      flow: node.flow,
      network: node.network,
      transport: node.transport?.type || node.transport,
      plugin: node.plugin,
      plugin_opts: node.plugin_opts,
      obfs: node.obfs?.type || node.obfs,
      obfs_password: node.obfs?.password || node.obfs_password,
      up_mbps: node.up_mbps,
      down_mbps: node.down_mbps,
      congestion_control: node.congestion_control,
      udp_relay_mode: node.udp_relay_mode,
      heartbeat: node.heartbeat,
      packet_encoding: node.packet_encoding,
      serviceName: node.transport?.service_name || node.serviceName || node.service_name,
      wsPath: node.transport?.path || node.path,
      wsHost: node.transport?.headers?.Host || node.wsHost || node.host,
      max_early_data: node.transport?.max_early_data,
      early_data_header_name: node.transport?.early_data_header_name,
      fp: node.tls?.utls?.fingerprint || node.fp,
      pbk: node.tls?.reality?.public_key || node.pbk,
      sid: node.tls?.reality?.short_id || node.sid,
      spx: node.tls?.reality?.spider_x || node.spx,
      tls_min_version: node.tls?.min_version,
      tls_max_version: node.tls?.max_version,
      tls_cipher_suites: Array.isArray(node.tls?.cipher_suites) ? node.tls.cipher_suites.join(',') : node.tls?.cipher_suites,
      certificate_public_key_sha256: Array.isArray(node.tls?.certificate_public_key_sha256)
        ? node.tls.certificate_public_key_sha256.join(',')
        : node.tls?.certificate_public_key_sha256,
      alpn: Array.isArray(node.tls?.alpn) ? node.tls.alpn.join(',') : node.tls?.alpn,
      insecure: node.tls?.insecure ?? node.insecure,
      tls: node.tls?.enabled ?? node.tls,
      sni: node.tls?.server_name || node.sni,
      alterId: node.alter_id ?? node.alterId
    };

    Object.entries(fieldMap).forEach(([key, value]) => applyIfPresent(normalized, key, value));
    normalized.server = normalizeHost(normalized.server);
    normalized.sni = normalizeHost(normalized.sni);
    normalized.ip = normalizeHost(normalized.ip);

    if (normalized.type === 'shadowsocks' && normalized.plugin && !normalized.plugin_opts && node.plugin_opts) {
      normalized.plugin_opts = node.plugin_opts;
    }

    if (normalized.type === 'vmess' && normalized.transport === 'grpc' && !normalized.serviceName && node.path) {
      normalized.serviceName = node.path;
    }

    if (normalized.type === 'hysteria2') {
      normalized.tls = true;
      normalized.security = normalized.security || 'tls';
      normalized.sni = normalized.sni || normalized.server;
    }

    if (normalized.type === 'trojan') {
      normalized.tls = true;
      normalized.security = normalized.security || 'tls';
      normalized.sni = normalized.sni || normalized.server;
    }

    return normalized;
  }

  parseStructuredSubscription(content) {
    const trimmed = String(content || '').trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const payload = JSON.parse(trimmed);
        return this.extractConfigNodes(payload)
          .map((node, index) => this.normalizeConfigNode(node, index))
          .filter(Boolean);
      } catch (error) {
        this.log.warn?.(`[ProxyService] Failed to parse structured subscription JSON: ${error.message}`);
      }
    }

    if (/^\s*(mixed-port|port|proxies):/mu.test(trimmed)) {
      this.log.warn?.('[ProxyService] Clash-style YAML subscriptions are not supported yet');
    }

    return [];
  }

  normalizeSubscriptionContent(content) {
    const text = typeof content === 'string'
      ? content
      : Buffer.isBuffer(content)
        ? content.toString('utf8')
        : JSON.stringify(content);

    if (looksLikeBase64Payload(text)) {
      return decodeBase64Payload(text);
    }

    return text;
  }

  normalizeManualImportContent(content) {
    return this.normalizeSubscriptionContent(content);
  }

  toShareLink(node) {
    if (!node || !node.type || !node.server) {
      return null;
    }

    const type = String(node.type).toLowerCase();
    const serverHost = normalizeHost(node.server);
    const name = encodeShareName(node.name, serverHost);
    const urlHost = formatHostForUrl(serverHost);
    const port = node.port ? Number.parseInt(node.port, 10) : null;

    if (type === 'vmess') {
      const payload = {
        v: '2',
        ps: node.name || serverHost || 'VMess',
        add: serverHost,
        port: port || 443,
        id: node.uuid || '',
        aid: node.alterId || 0,
        scy: node.security || 'auto',
        net: node.transport || 'tcp',
        type: 'none',
        host: node.wsHost || '',
        path: node.transport === 'grpc' ? (node.serviceName || '') : (node.wsPath || ''),
        tls: node.tls || node.security === 'tls' || node.security === 'reality' ? 'tls' : '',
        sni: node.sni || '',
        alpn: node.alpn || '',
        fp: node.fp || ''
      };
      return `vmess://${toBase64(JSON.stringify(payload))}`;
    }

    if (type === 'shadowsocks') {
      if (!node.method || !node.password || !port) {
        return null;
      }
      const userInfo = toBase64(`${node.method}:${node.password}`);
      const query = buildQuery({
        plugin: node.plugin
          ? [node.plugin, node.plugin_opts].filter(Boolean).join(';')
          : undefined
      });
      return `ss://${userInfo}@${urlHost}:${port}${query}${name ? `#${name}` : ''}`;
    }

    if (type === 'trojan') {
      if (!node.password) {
        return null;
      }
      const query = buildQuery({
        security: node.security || (node.tls ? 'tls' : undefined),
        type: node.transport && node.transport !== 'tcp' ? node.transport : undefined,
        host: node.wsHost || undefined,
        path: node.wsPath || undefined,
        serviceName: node.serviceName || undefined,
        sni: node.sni || undefined,
        alpn: node.alpn || undefined,
        fp: node.fp || undefined,
        allowInsecure: node.insecure ? '1' : undefined
      });
      return `trojan://${encodeURIComponent(node.password)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
    }

    if (type === 'vless') {
      if (!node.uuid) {
        return null;
      }
      const query = buildQuery({
        encryption: 'none',
        security: node.security || (node.tls ? 'tls' : undefined),
        type: node.transport && node.transport !== 'tcp' ? node.transport : undefined,
        host: node.wsHost || undefined,
        path: node.wsPath || undefined,
        serviceName: node.serviceName || undefined,
        sni: node.sni || undefined,
        alpn: node.alpn || undefined,
        fp: node.fp || undefined,
        pbk: node.pbk || undefined,
        sid: node.sid || undefined,
        flow: node.flow || undefined,
        packet_encoding: node.packet_encoding || undefined,
        allowInsecure: node.insecure ? '1' : undefined
      });
      return `vless://${encodeURIComponent(node.uuid)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
    }

    if (type === 'hysteria2') {
      if (!node.password) {
        return null;
      }
      const query = buildQuery({
        obfs: node.obfs || undefined,
        'obfs-password': node.obfs_password || undefined,
        upmbps: node.up_mbps || undefined,
        downmbps: node.down_mbps || undefined,
        sni: node.sni || undefined,
        insecure: node.insecure ? '1' : undefined
      });
      return `hy2://${encodeURIComponent(node.password)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
    }

    if (type === 'tuic') {
      if (!node.uuid || !node.password) {
        return null;
      }
      const query = buildQuery({
        congestion_control: node.congestion_control || undefined,
        udp_relay_mode: node.udp_relay_mode || undefined,
        heartbeat: node.heartbeat || undefined,
        zero_rtt_handshake: node.zero_rtt_handshake,
        sni: node.sni || undefined,
        allow_insecure: node.insecure ? '1' : undefined
      });
      return `tuic://${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
    }

    if (type === 'socks' || type === 'http') {
      const scheme = type === 'http' ? 'http' : 'socks';
      const auth = node.username
        ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || '')}@`
        : '';
      return `${scheme}://${auth}${urlHost}:${port || (type === 'http' ? 80 : 1080)}${name ? `#${name}` : ''}`;
    }

    return null;
  }

  async syncSubscription(url) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid subscription URL: ${url}`);
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Subscription URL must use http or https`);
    }
    const hostname = normalizeHost(parsedUrl.hostname).toLowerCase();
    if (hostname === 'localhost' || hostname === '::' || hostname === '::1'
        || hostname.startsWith('127.') || hostname.startsWith('10.') || hostname.startsWith('192.168.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
        || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')) {
      throw new Error(`Subscription URL must not point to a private/local address`);
    }
    const headers = {
      'User-Agent': SUBSCRIPTION_USER_AGENT,
      Accept: 'text/plain, application/json;q=0.9, */*;q=0.8'
    };
    if (parsedUrl.username || parsedUrl.password) {
      headers.Authorization = `Basic ${Buffer.from(parsedUrl.username ? `${parsedUrl.username}:${parsedUrl.password}` : `:${parsedUrl.password}`).toString('base64')}`;
    }

    let response;
    try {
      response = await axios.get(url, {
        headers,
        responseType: 'text',
        transformResponse: [(data) => data],
        validateStatus: (status) => status >= 200 && status < 300
      });
    } catch (error) {
      const status = error?.response?.status;
      const detail = status ? `HTTP ${status}` : error.message;
      throw new Error(`Failed to download subscription: ${detail}`);
    }

    const content = this.normalizeSubscriptionContent(response.data);
    const structuredNodes = this.parseStructuredSubscription(content);
    if (structuredNodes.length) {
      return structuredNodes;
    }

    return this.parseProxyLinks(content);
  }

  async testNode(nodeId) {
    const localPort = this.getLocalPort(nodeId);
    if (!localPort) {
      throw new Error('Node not active in bridge');
    }

    const startTime = Date.now();
    const agent = new SocksProxyAgent(`socks5h://${this.proxyListen}:${localPort}`);
    await axios.get('http://cp.cloudflare.com/generate_204', {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: 15000,
      proxy: false
    });

    return Date.now() - startTime;
  }
}
