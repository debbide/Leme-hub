import axios from 'axios';
import { getProxyForUrl } from 'proxy-from-env';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { DEFAULT_PROXY_LISTEN_HOST } from '../shared/constants.js';
import { formatHostForUrl, normalizeHost, resolveLoopbackHost } from '../shared/network.js';
import { normalizeConfigNode } from './protocols.js';

const SUBSCRIPTION_USER_AGENT = 'Leme-Hub/0.1';
const SUBSCRIPTION_V2RAYN_USER_AGENT = 'v2rayN/7.20.0';
const SUBSCRIPTION_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const SUBSCRIPTION_TIMEOUT_MS = 15000;

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
    log?.warn?.('[ProxyService] Clash-style YAML subscriptions are not supported yet');
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
  const explicitUserAgent = String(options.userAgent || '').trim();
  const authHeader = (parsedUrl.username || parsedUrl.password)
    ? `Basic ${Buffer.from(parsedUrl.username ? `${parsedUrl.username}:${parsedUrl.password}` : `:${parsedUrl.password}`).toString('base64')}`
    : '';
  const buildHeaders = (profile = {}) => {
    const headers = {
      'User-Agent': profile.userAgent || explicitUserAgent || SUBSCRIPTION_USER_AGENT,
      Accept: profile.accept || 'text/plain, application/json;q=0.9, */*;q=0.8'
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
      response = await axios.get(url, {
        ...requestOptions,
        ...transport.config,
        headers: buildHeaders(headerProfile)
      });
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
    throw new Error(`Failed to download subscription: ${detail}`);
  }

  const content = context.normalizeSubscriptionContent(response.data);
  const structuredNodes = context.parseStructuredSubscription(content);
  if (structuredNodes.length) {
    return structuredNodes;
  }

  return context.parseProxyLinks(content);
};
