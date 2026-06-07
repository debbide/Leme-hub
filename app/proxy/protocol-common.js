export const FRAGMENTABLE_TLS_OUTBOUND_TYPES = new Set(['vmess', 'vless', 'trojan']);
export const FIXED_TLS_OUTBOUND_TYPES = new Set(['tuic', 'hysteria2', 'anytls']);
export const VMESS_TLS_SECURITY_MODES = new Set(['tls', 'reality']);

export const toInt = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const toBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

export const toList = (value) => Array.isArray(value)
  ? value.filter(Boolean)
  : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

export const applyIfPresent = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
};

export const normalizeHysteria2Obfs = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized && normalized !== 'none' ? normalized : null;
};

export const defaultTlsAlpnForNode = (node) => (
  ['tuic', 'hysteria2'].includes(String(node?.type || '').toLowerCase())
    ? ['h3']
    : []
);

export const normalizeVmessSecurity = (value, fallback = 'none') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return VMESS_TLS_SECURITY_MODES.has(normalized) ? fallback : normalized;
};

export const nodeUsesReality = (node = {}) => {
  const type = String(node?.type || '').trim().toLowerCase();
  const security = String(node?.security || '').trim().toLowerCase();
  return type === 'vless' && (
    security === 'reality'
    || !!node?.pbk
    || !!node?.tls?.reality?.public_key
    || !!node?.tls?.reality?.enabled
  );
};

export const nodeUsesTls = (node = {}) => {
  if (nodeUsesReality(node)) {
    return true;
  }

  const type = String(node?.type || '').trim().toLowerCase();
  const security = String(node?.security || '').trim().toLowerCase();
  if (FIXED_TLS_OUTBOUND_TYPES.has(type)) {
    return true;
  }
  if (type !== 'vmess' && security === 'none') {
    return false;
  }

  if (node?.tls === true) {
    return true;
  }

  if (type === 'vmess') {
    return security === 'tls';
  }

  return security === 'tls' || security === 'reality';
};
