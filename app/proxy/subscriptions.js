import axios from 'axios';
import dns from 'dns';
import http from 'http';
import https from 'https';
import yaml from 'js-yaml';
import { getProxyForUrl } from 'proxy-from-env';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { DEFAULT_PROXY_LISTEN_HOST } from '../shared/constants.js';
import { formatHostForUrl, normalizeHost, resolveLoopbackHost } from '../shared/network.js';
import { normalizeConfigNode } from './protocols.js';

const createHttpError = (message, status) => Object.assign(new Error(message), { status });

const SUBSCRIPTION_USER_AGENT = 'Leme-Hub/0.1';
const SUBSCRIPTION_V2RAYN_USER_AGENT = 'v2rayN/7.20.0';
const SUBSCRIPTION_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const SUBSCRIPTION_TIMEOUT_MS = 15000;
const SUBSCRIPTION_MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// SSRF protection for subscription downloads.
//
// The naive hostname-prefix check is bypassable via:
//   - cloud metadata endpoints (169.254.169.254),
//   - open redirects to intranet targets,
//   - DNS hostnames that resolve to private addresses,
//   - IPv6-mapped IPv4 literals such as ::ffff:127.0.0.1,
// so every redirect hop is re-validated against DNS-resolved addresses.
// ---------------------------------------------------------------------------

const ipv4ToInt = (ip) => {
  const parts = String(ip).split('.');
  if (parts.length !== 4) {
    return null;
  }
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    num = num * 256 + octet;
  }
  return num >>> 0;
};

// Non-public IPv4 ranges (RFC 1122/1918/3927/6598/6890 et al.), including the
// 169.254.0.0/16 link-local range used by cloud metadata services.
const BLOCKED_V4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0 }));

const isBlockedV4Int = (num) => BLOCKED_V4_RANGES.some(({ base, mask }) => (num & mask) === (base & mask));

const parseIpv6Hextets = (ip) => {
  const addr = String(ip).split('%')[0].toLowerCase();
  const halves = addr.split('::');
  if (halves.length > 2) {
    return null;
  }
  const parseGroup = (group) => group.split(':').map((hextet) => {
    if (!/^[0-9a-f]{1,4}$/.test(hextet)) {
      return null;
    }
    return Number.parseInt(hextet, 16);
  });
  const head = halves[0] ? parseGroup(halves[0]) : [];
  const tail = halves.length === 2 ? (halves[1] ? parseGroup(halves[1]) : []) : [];
  if (head.includes(null) || tail.includes(null)) {
    return null;
  }
  if (halves.length === 1 && head.length !== 8) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return null;
  }
  return [...head, ...new Array(missing).fill(0), ...tail];
};

export const isPublicIpAddress = (ip) => {
  const raw = String(ip || '').trim();
  if (!raw) {
    return false;
  }

  // IPv4-mapped IPv6 literal, e.g. ::ffff:127.0.0.1 — judge the embedded IPv4.
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) {
    return isPublicIpAddress(mapped[1]);
  }

  if (raw.includes('.') && !raw.includes(':')) {
    const num = ipv4ToInt(raw);
    if (num === null) {
      return false;
    }
    return !isBlockedV4Int(num);
  }

  if (raw.includes(':')) {
    const hextets = parseIpv6Hextets(raw);
    if (!hextets) {
      return false;
    }
    const [first, second, third, fourth, fifth, sixth, seventh, eighth] = hextets;
    if (first === 0) {
      return false; // ::/8 including ::1
    }
    if ((first & 0xffc0) === 0xfe80) {
      return false; // fe80::/10 link-local
    }
    if ((first & 0xfe00) === 0xfc00) {
      return false; // fc00::/7 unique local
    }
    if ((first & 0xff00) === 0xff00) {
      return false; // ff00::/8 multicast
    }
    if (first === 0x2001 && second === 0x0db8) {
      return false; // 2001:db8::/32 documentation
    }
    if (first === 0x0064 && second === 0xff9b && third === 0 && fourth === 0 && fifth === 0 && sixth === 0) {
      // 64:ff9b::/96 NAT64 well-known prefix — judge the embedded IPv4.
      return !isBlockedV4Int((((seventh << 16) | eighth) >>> 0));
    }
    return true;
  }

  return false;
};

// Resolve the host and require EVERY resolved address to be public. Returns
// the addresses so callers can pin connections to them (TOCTOU hardening).
// `options.lookup` may override DNS resolution (used by tests).
export const assertPublicSubscriptionUrl = async (url, options = {}) => {
  const lookupFn = options.lookup || ((hostname) => dns.promises.lookup(hostname, { all: true }));
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw createHttpError(`Invalid subscription URL: ${url}`, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createHttpError('Subscription URL must use http or https', 400);
  }
  const hostname = normalizeHost(parsed.hostname).toLowerCase();
  if (!hostname) {
    throw createHttpError('Subscription URL has an empty host', 400);
  }
  if (hostname === 'localhost') {
    throw createHttpError('Subscription URL must not point to a private/local address', 400);
  }

  let records;
  try {
    // dns.lookup with all:true also resolves plain IP literals without I/O.
    records = await lookupFn(hostname);
  } catch (error) {
    throw createHttpError(`Failed to resolve subscription host ${hostname}: ${error.message}`, 502);
  }
  if (!records.length) {
    throw createHttpError(`Subscription host ${hostname} did not resolve to any address`, 502);
  }
  for (const { address } of records) {
    if (!isPublicIpAddress(address)) {
      throw createHttpError(`Subscription URL must not point to a private/local address (${hostname} resolves to ${address})`, 400);
    }
  }
  return { parsed, hostname, addresses: records };
};

// Pin direct connections to the DNS-validated addresses so a rebinding race
// between validation and connect cannot swap in a private target.
const buildPinnedLookup = (addresses) => (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const pick = addresses.find((record) => !options.family || record.family === options.family) || addresses[0];
  if (!pick) {
    callback(new Error('No validated address available for subscription host'));
    return;
  }
  if (options.all) {
    callback(null, addresses.map((record) => ({ address: record.address, family: record.family })));
  } else {
    callback(null, pick.address, pick.family);
  }
};

// Follow redirects manually so every hop is re-validated; axios's built-in
// redirect follower would happily chase a 302 into the intranet.
export const fetchSubscriptionWithSafeRedirects = async (initialUrl, axiosConfig = {}, options = {}) => {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= SUBSCRIPTION_MAX_REDIRECTS; hop++) {
    const { addresses } = await assertPublicSubscriptionUrl(currentUrl, { lookup: options.lookup });
    const usesOwnAgent = axiosConfig.httpAgent || axiosConfig.httpsAgent;
    // Only pin DNS for true direct transports: when axios routes through a
    // system HTTP(S) proxy it connects to the *proxy* host, and a pinned
    // lookup would resolve the proxy hostname to the subscription server's
    // address. Proxied hops are still SSRF-checked above on every redirect.
    const routesViaSystemProxy = options.viaSystemProxy && axiosConfig.proxy !== false && !usesOwnAgent;
    const response = await axios.get(currentUrl, {
      ...axiosConfig,
      maxRedirects: 0,
      // Accept 3xx here so redirect hops can be validated instead of throwing.
      validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
      // Proxied transports resolve remotely; only pin direct connections.
      ...(routesViaSystemProxy || usesOwnAgent ? {} : {
        httpAgent: new http.Agent({ lookup: buildPinnedLookup(addresses) }),
        httpsAgent: new https.Agent({ lookup: buildPinnedLookup(addresses) })
      })
    });
    if (response.status >= 300 && response.status < 400 && response.headers?.location) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      // Mimic axios error shape so callers can keep inspecting error.response.
      const statusError = new Error(`Subscription request failed with status ${response.status}`);
      statusError.response = response;
      throw statusError;
    }
    return response;
  }
  throw createHttpError(`Too many redirects while fetching subscription (>${SUBSCRIPTION_MAX_REDIRECTS})`, 502);
};

const toInt = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const trimBase64Padding = (value) => value.replace(/=+$/u, '');

export const looksLikeBase64Payload = (value) => {
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

export const decodeBase64Payload = (value) => {
  const normalized = trimBase64Padding(String(value || '').trim().replace(/\s+/gu, ''));
  return Buffer.from(normalized.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString('utf8');
};

export const normalizeSubscriptionContent = (content) => {
  const text = typeof content === 'string'
    ? content
    : Buffer.isBuffer(content)
      ? content.toString('utf8')
      : JSON.stringify(content);

  if (looksLikeBase64Payload(text)) {
    return decodeBase64Payload(text);
  }

  return text;
};

export const normalizeManualImportContent = (content) => normalizeSubscriptionContent(content);

export const normalizeSubscriptionResponseSnippet = (value) => String(value || '').replace(/\s+/gu, ' ').trim().slice(0, 160);

export const detectSubscriptionResponseHint = (value) => {
  const normalized = normalizeSubscriptionResponseSnippet(value).toLowerCase();
  if (!normalized) {
    return '';
  }
  if (normalized.includes('cloudflare') || normalized.includes('attention required') || normalized.includes('just a moment') || normalized.includes('challenge')) {
    return 'Cloudflare challenge';
  }
  if (normalized.includes('forbidden') || normalized.includes('access denied') || normalized.includes('blocked')) {
    return 'Access blocked by subscription host';
  }
  return '';
};

export const extractConfigNodes = (payload) => {
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
};

// Clash YAML uses different field names than the internal node format.
// Map the common ones here, then let normalizeConfigNode do the rest.
const CLASH_IGNORED_PROXY_TYPES = new Set([
  'direct', 'reject', 'dns', 'selector', 'urltest', 'fallback', 'loadbalance', 'relay'
]);

export const normalizeClashProxy = (proxy, index = 0) => {
  if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy)) {
    return null;
  }

  const type = String(proxy.type || '').toLowerCase();
  if (!type || CLASH_IGNORED_PROXY_TYPES.has(type)) {
    return null;
  }

  const wsOpts = proxy['ws-opts'] && typeof proxy['ws-opts'] === 'object' ? proxy['ws-opts'] : {};
  const grpcOpts = proxy['grpc-opts'] && typeof proxy['grpc-opts'] === 'object' ? proxy['grpc-opts'] : {};
  const realityOpts = proxy['reality-opts'] && typeof proxy['reality-opts'] === 'object' ? proxy['reality-opts'] : {};
  const wsHeaders = wsOpts.headers && typeof wsOpts.headers === 'object' ? wsOpts.headers : {};

  return normalizeConfigNode({
    name: proxy.name,
    type,
    server: proxy.server,
    port: proxy.port,
    uuid: proxy.uuid,
    password: proxy.password ?? proxy['auth-str'] ?? proxy.token ?? null,
    username: proxy.username,
    method: proxy.cipher,
    alterId: proxy.alterId ?? proxy['alter-id'],
    tls: proxy.tls,
    sni: proxy.sni || proxy.servername,
    insecure: proxy['skip-cert-verify'],
    transport: proxy.network,
    path: wsOpts.path,
    wsHost: wsHeaders.Host || wsHeaders.host,
    serviceName: grpcOpts['grpc-service-name'],
    fp: proxy['client-fingerprint'] || proxy.fingerprint,
    alpn: proxy.alpn,
    pbk: realityOpts['public-key'],
    sid: realityOpts['short-id'],
    plugin: proxy.plugin,
    plugin_opts: proxy['plugin-opts'],
    obfs: proxy.obfs,
    obfs_password: proxy['obfs-password'],
    congestion_control: proxy['congestion-controller'] || proxy.congestion_control,
    udp_relay_mode: proxy['udp-relay-mode'] || proxy.udp_relay_mode,
    up_mbps: proxy.up ?? proxy['up-mbps'],
    down_mbps: proxy.down ?? proxy['down-mbps'],
    // tuic v5 style
    ip: proxy.ip
  }, index);
};

const MAX_YAML_SUBSCRIPTION_BYTES = 2 * 1024 * 1024;

export const parseClashYamlSubscription = (content, options = {}) => {
  const { log, normalizeNode = normalizeClashProxy } = options;
  const text = String(content || '');
  if (!text.trim() || Buffer.byteLength(text, 'utf8') > MAX_YAML_SUBSCRIPTION_BYTES) {
    return [];
  }

  let payload;
  try {
    // js-yaml v4's load() uses the default (safe) schema: no code execution.
    payload = yaml.load(text);
  } catch (error) {
    log?.warn?.(`[ProxyService] Failed to parse Clash YAML subscription: ${error.message}`);
    return [];
  }

  const proxies = extractConfigNodes(payload);
  if (!proxies.length) {
    return [];
  }

  return proxies
    .map((proxy, index) => {
      try {
        return normalizeNode(proxy, index);
      } catch (error) {
        log?.warn?.(`[ProxyService] Skipping Clash proxy ${proxy?.name || index}: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean);
};

export const parseStructuredSubscription = (content, options = {}) => {
  const { log, normalizeNode = normalizeConfigNode } = options;
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const payload = JSON.parse(trimmed);
      return extractConfigNodes(payload)
        .map((node, index) => normalizeNode(node, index))
        .filter(Boolean);
    } catch (error) {
      log?.warn?.(`[ProxyService] Failed to parse structured subscription JSON: ${error.message}`);
    }
  }

  if (/^\s*(mixed-port|port|proxies):/mu.test(trimmed)) {
    // Clash YAML entries need their own field mapping; the JSON normalizer
    // passed via options does not apply here.
    return parseClashYamlSubscription(content, { log });
  }

  return [];
};

export const resolveSubscriptionInternalProxy = (context, options = {}) => {
  if (!options.allowInternalProxy) {
    return null;
  }

  const nodeId = String(options.activeNodeId || '').trim();
  if (!nodeId) {
    return null;
  }

  const localPort = toInt(options.localPort ?? context.getLocalPort(nodeId));
  if (!Number.isInteger(localPort) || localPort <= 0) {
    return null;
  }

  const listenHost = normalizeHost(options.proxyListen || context.proxyListen, DEFAULT_PROXY_LISTEN_HOST);
  const connectHost = resolveLoopbackHost(listenHost);
  const proxyUrl = `socks5h://${formatHostForUrl(connectHost)}:${localPort}`;

  return {
    nodeId,
    host: connectHost,
    port: localPort,
    agent: new SocksProxyAgent(proxyUrl)
  };
};

export const syncSubscription = async (context, url, options = {}) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw createHttpError(`Invalid subscription URL: ${url}`, 400);
  }
  // Full SSRF validation: protocol, DNS-resolved addresses for every hop, and
  // redirect targets are all re-checked inside the safe fetcher below.
  const { hostname } = await assertPublicSubscriptionUrl(url, { lookup: options.dnsLookup });
  const explicitUserAgent = String(options.userAgent || '').trim();
  const authHeader = (parsedUrl.username || parsedUrl.password)
    ? `Basic ${Buffer.from(parsedUrl.username ? `${parsedUrl.username}:${parsedUrl.password}` : `:${parsedUrl.password}`).toString('base64')}`
    : '';
  const buildHeaders = (profile = {}) => {
    const headers = {
      'User-Agent': profile.userAgent || explicitUserAgent || SUBSCRIPTION_USER_AGENT,
      Accept: profile.accept || 'text/plain, application/json;q=0.9, */*;q=0.8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    if (authHeader) {
      headers.Authorization = authHeader;
    }
    if (profile.extraHeaders && typeof profile.extraHeaders === 'object') {
      Object.assign(headers, profile.extraHeaders);
    }
    return headers;
  };

  const requestOptions = {
    responseType: 'text',
    timeout: SUBSCRIPTION_TIMEOUT_MS,
    transformResponse: [(data) => data],
    validateStatus: (status) => status >= 200 && status < 300
  };
  const proxyUrl = getProxyForUrl(url);
  const internalProxy = context.resolveSubscriptionInternalProxy(options);
  const transports = [
    {
      mode: proxyUrl ? 'proxy-aware' : 'direct',
      // Axios resolves the system proxy from the environment itself; flag it
      // so the safe fetcher does not pin DNS (it would resolve the *proxy*
      // host to the subscription address).
      viaSystemProxy: Boolean(proxyUrl),
      config: {}
    },
    ...(proxyUrl
      ? [{
          mode: 'direct',
          config: { proxy: false }
        }]
      : []),
    ...(internalProxy
      ? [{
          mode: 'internal-socks',
          config: {
            httpAgent: internalProxy.agent,
            httpsAgent: internalProxy.agent,
            proxy: false
          }
        }]
      : [])
  ];
  context.log.log?.(`[ProxyService] Subscription sync start host=${hostname} viaProxy=${proxyUrl ? 'yes' : 'no'} internalFallback=${internalProxy ? 'yes' : 'no'}`);

  let response;
  let lastError;
  const tryDownload = async (transport, headerProfile) => {
    try {
      response = await fetchSubscriptionWithSafeRedirects(url, {
        ...requestOptions,
        ...transport.config,
        headers: buildHeaders(headerProfile)
      }, { lookup: options.dnsLookup, viaSystemProxy: transport.viaSystemProxy });
      context.log.log?.(`[ProxyService] Subscription download success host=${hostname} mode=${transport.mode} ua=${headerProfile.label}`);
      lastError = null;
      return true;
    } catch (error) {
      lastError = error;
      return false;
    }
  };

  if (!(await tryDownload(transports[0], { label: explicitUserAgent ? 'custom' : 'app' }))) {
    if (proxyUrl && transports[1]) {
      context.log.warn?.(`[ProxyService] Subscription download via proxy failed, retrying direct: ${lastError?.message || 'unknown error'}`);
      await tryDownload(transports[1], { label: explicitUserAgent ? 'custom' : 'app' });
    }
    if (!response && internalProxy) {
      context.log.warn?.(`[ProxyService] Subscription download failed before internal fallback, retrying via local proxy: ${lastError?.message || 'unknown error'}`);
      await tryDownload(transports[transports.length - 1], { label: explicitUserAgent ? 'custom' : 'app' });
    }
    if (!response && !explicitUserAgent && lastError?.response?.status === 403) {
      const compatTransport = transports[transports.length - 1];
      context.log.warn?.('[ProxyService] Subscription download returned HTTP 403, retrying with compatible user agents');
      for (const profile of [
        {
          label: 'v2rayn',
          userAgent: SUBSCRIPTION_V2RAYN_USER_AGENT,
          accept: '*/*'
        },
        {
          label: 'browser',
          userAgent: SUBSCRIPTION_BROWSER_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          extraHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
          }
        }
      ]) {
        if (await tryDownload(compatTransport, profile)) {
          break;
        }
      }
    }
  }
  if (!response) {
    const status = lastError?.response?.status;
    const bodyPreview = normalizeSubscriptionResponseSnippet(lastError?.response?.data);
    const hint = detectSubscriptionResponseHint(bodyPreview);
    const detail = status
      ? `HTTP ${status}${hint ? ` (${hint})` : ''}`
      : lastError?.message || 'Unknown error';
    if (bodyPreview) {
      context.log.warn?.(`[ProxyService] Subscription response preview host=${hostname} preview=${bodyPreview}`);
    }
    context.log.error?.(`[ProxyService] Subscription download failed host=${hostname} detail=${detail}`);
    throw createHttpError(`Failed to download subscription: ${detail}`, 502);
  }

  const content = context.normalizeSubscriptionContent(response.data);
  const structuredNodes = context.parseStructuredSubscription(content);
  if (structuredNodes.length) {
    return structuredNodes;
  }

  return context.parseProxyLinks(content);
};
