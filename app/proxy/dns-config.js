import { isIpLiteralHost, normalizeHost } from '../shared/network.js';
import { isSingBoxVersionGte } from './runtime.js';

export const LOCALHOST_DNS_SERVER_TAG = 'dns-hosts';
export const PLATFORM_LOCAL_DNS_SERVER_TAG = 'dns-platform';

const SYSTEM_REMOTE_DNS_SERVER_TAG = 'dns-system-remote';

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

export const buildDnsConfig = ({
  validNodes = [],
  dnsRemoteServer = 'https://cloudflare-dns.com/dns-query',
  dnsDirectServer = 'https://dns.alidns.com/dns-query',
  dnsBootstrapServer = '223.5.5.5',
  dnsFinal = 'dns-remote',
  dnsStrategy = 'prefer_ipv4',
  activeSelectorOutboundTag = '',
  systemDefaultOutbound = 'direct',
  systemProxyEnabled = false,
  tunEnabled = false,
  captureInbounds = [],
  systemInbounds = [],
  proxyMode = 'rule',
  localDirectDomains = [],
  localDirectDomainSuffixes = [],
  storeSigninRules = [],
  systemStoreSigninRuleSetTag = '',
  orderedDnsRules = [],
  builtInCnDirectRuleSetTags = [],
  resolveDnsServerForOutbound = (outbound) => outbound === 'direct' ? 'dns-local' : 'dns-remote',
  singBoxVersion = null
} = {}) => {
  const effectiveCaptureInbounds = (Array.isArray(captureInbounds) && captureInbounds.length
    ? captureInbounds
    : systemInbounds).filter(Boolean);
  const captureRoutingEnabled = Boolean(systemProxyEnabled || tunEnabled);
  const upstreamServerDomains = [...new Set(validNodes
    .map((node) => normalizeHost(node?.server))
    .filter((host) => host && !isIpLiteralHost(host)))];

  const upstreamEchDomains = [...new Set(validNodes
    .flatMap((node) => [
      normalizeHost(node?.sni),
      normalizeHost(node?.host)
    ])
    .filter((host) => host && !isIpLiteralHost(host) && !upstreamServerDomains.includes(host)))];

  const dnsRules = [
    // 拒绝 HTTPS/SVCB 查询：这类记录只用于 ECH 服务发现，对分流无用，
    // 放行反而可能泄漏真实访问意图。放在最前面，全局生效。
    {
      query_type: ['HTTPS', 'SVCB'],
      action: 'reject'
    },
    ...(upstreamServerDomains.length
      ? [{
          domain: upstreamServerDomains,
          server: 'dns-bootstrap'
        }]
      : []),
    ...(upstreamEchDomains.length
      ? [{
          domain: upstreamEchDomains,
          server: 'dns-local'
        }]
      : []),
    {
      domain: localDirectDomains,
      server: LOCALHOST_DNS_SERVER_TAG
    },
    {
      domain_suffix: localDirectDomainSuffixes,
      server: PLATFORM_LOCAL_DNS_SERVER_TAG
    }
  ];

  if (captureRoutingEnabled && effectiveCaptureInbounds.length) {
    if (proxyMode === 'direct') {
      dnsRules.push({
        inbound: effectiveCaptureInbounds,
        server: 'dns-local'
      });
    } else if (proxyMode === 'global') {
      dnsRules.push({
        inbound: effectiveCaptureInbounds,
        server: systemDefaultOutbound === 'direct' ? 'dns-local' : SYSTEM_REMOTE_DNS_SERVER_TAG
      });
    } else if (proxyMode === 'rule') {
      if (storeSigninRules.length) {
        dnsRules.push({
          inbound: effectiveCaptureInbounds,
          rule_set: systemStoreSigninRuleSetTag,
          server: resolveDnsServerForOutbound(systemDefaultOutbound)
        });
      }

      orderedDnsRules.forEach((rule) => dnsRules.push(rule));

      // 1.14.0+ 禁止在 DNS 规则里直接引用纯 IP 段规则集（如 geoip-cn），
      // 必须走 evaluate + match_response。这里 DNS 选路只需要按域名判断
      // （geosite-cn），geoip-cn 留在路由规则里按目标 IP 分流。
      const dnsCnDomainRuleSetTags = builtInCnDirectRuleSetTags.filter(
        (tag) => !String(tag).startsWith('geoip-')
      );
      if (dnsCnDomainRuleSetTags.length) {
        dnsRules.push({
          inbound: effectiveCaptureInbounds,
          rule_set: dnsCnDomainRuleSetTags,
          server: 'dns-local'
        });
      }
      dnsRules.push({
        inbound: effectiveCaptureInbounds,
        server: systemDefaultOutbound === 'direct' ? 'dns-local' : SYSTEM_REMOTE_DNS_SERVER_TAG
      });
    }
  }

  return {
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
      buildDnsServer('dns-remote', dnsRemoteServer, String(activeSelectorOutboundTag || '').trim(), 'dns-bootstrap'),
      buildDnsServer(SYSTEM_REMOTE_DNS_SERVER_TAG, dnsRemoteServer, String(systemDefaultOutbound || '').trim(), 'dns-bootstrap'),
      buildDnsServer('dns-local', dnsDirectServer, '', 'dns-bootstrap')
    ],
    rules: dnsRules,
    final: String(dnsFinal || '').trim() === 'dns-local' ? 'dns-local' : 'dns-remote',
    strategy: ['prefer_ipv4', 'ipv4_only', 'prefer_ipv6', 'ipv6_only'].includes(String(dnsStrategy || '').trim()) ? String(dnsStrategy || '').trim() : 'prefer_ipv4',
    // optimistic 需要 sing-box >= 1.14.0，旧内核会报 unknown field 直接拒绝启动。
    // 过期记录先返回旧答案（0ms），后台刷新——消灭 TTL 过期时的周期性 DNS 卡顿。
    // 与 cache_file.store_dns 是 1.14 设计在一起的：落盘 + 乐观返回，重启后也秒回。
    ...(isSingBoxVersionGte(singBoxVersion, '1.14.0') ? { optimistic: true } : {})
  };
};
