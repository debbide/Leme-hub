import net from 'net';

export const stripHostBrackets = (value) => {
  const trimmed = String(value || '').trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const normalizeHost = (value, fallback = '') => stripHostBrackets(value) || fallback;

export const isIpLiteralHost = (value) => net.isIP(normalizeHost(value)) !== 0;

export const isIpv6Host = (value) => net.isIP(normalizeHost(value)) === 6;

export const formatHostForUrl = (value, fallback = '') => {
  const host = normalizeHost(value, fallback);
  return isIpv6Host(host) ? `[${host}]` : host;
};

export const formatHostPort = (value, port, fallback = '') => `${formatHostForUrl(value, fallback)}:${port}`;

export const formatUrlWithHost = (protocol, value, port, fallback = '') => `${protocol}://${formatHostPort(value, port, fallback)}`;

export const resolveLoopbackHost = (value = '') => (isIpv6Host(value) ? '::1' : '127.0.0.1');

export const resolvePublicOriginHost = (value = '') => {
  const host = normalizeHost(value);
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }
  if (host === '::') {
    return '::1';
  }
  return host || '127.0.0.1';
};
