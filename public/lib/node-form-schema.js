const SUPPORTED_NODE_TYPES = new Set(['vmess', 'vless', 'trojan', 'tuic', 'hysteria2', 'shadowsocks', 'socks', 'http']);
const TYPES_WITH_TRANSPORT = new Set(['vmess', 'vless', 'trojan']);
const TYPES_WITH_SECURITY = new Set(['vmess', 'vless']);
const TYPES_WITH_FIXED_TLS = new Set(['trojan', 'tuic', 'hysteria2']);
const TYPES_WITH_FP = new Set(['vmess', 'vless', 'trojan']);

const FORM_EXCLUDED_KEYS = new Set([
  'id',
  'type',
  'name',
  'server',
  'port',
  'group',
  'countryCodeOverride',
  'uuid',
  'password',
  'username',
  'method',
  'security',
  'flow',
  'network',
  'transport',
  'plugin',
  'plugin_opts',
  'obfs',
  'obfs_password',
  'up_mbps',
  'down_mbps',
  'congestion_control',
  'udp_relay_mode',
  'heartbeat',
  'packet_encoding',
  'serviceName',
  'service_name',
  'wsPath',
  'wsHost',
  'path',
  'host',
  'max_early_data',
  'early_data_header_name',
  'fp',
  'pbk',
  'sid',
  'spx',
  'tls_min_version',
  'tls_max_version',
  'tls_cipher_suites',
  'certificate_public_key_sha256',
  'alpn',
  'insecure',
  'tls',
  'sni',
  'alterId',
  'alter_id',
  'version',
  'ip',
  'localPort',
  'local_port',
  'listenHost',
  'shareLink',
  'endpoint',
  'copyText',
  'isRunning',
  'countryCode',
  'countryName',
  'flagEmoji',
  'countryOverridden'
]);

export const DEFAULT_NODE_FORM_STATE = {
  type: 'vless',
  name: '',
  server: '',
  port: '443',
  group: '',
  countryCodeOverride: '',
  security: 'none',
  transport: 'tcp',
  uuid: '',
  password: '',
  username: '',
  method: '',
  version: '5',
  alterId: '0',
  flow: '',
  packet_encoding: 'xudp',
  sni: '',
  insecure: false,
  alpn: '',
  fp: 'chrome',
  wsPath: '/',
  wsHost: '',
  max_early_data: '',
  early_data_header_name: '',
  serviceName: '',
  pbk: '',
  sid: '',
  spx: '',
  tls_min_version: '',
  tls_max_version: '',
  tls_cipher_suites: '',
  certificate_public_key_sha256: '',
  plugin: '',
  plugin_opts: '',
  obfs: '',
  obfs_password: '',
  up_mbps: '',
  down_mbps: '',
  congestion_control: 'bbr',
  udp_relay_mode: 'quic-rfc',
  heartbeat: '',
  udp_over_stream: false,
  zero_rtt_handshake: false,
  ip: ''
};

const cloneJsonObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
};

const cleanString = (value) => String(value ?? '').trim();

const cleanOptionalString = (value) => {
  const trimmed = cleanString(value);
  return trimmed || undefined;
};

const toFormString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
};

const normalizeType = (value) => {
  const type = cleanString(value).toLowerCase();
  return SUPPORTED_NODE_TYPES.has(type) ? type : 'vless';
};

const normalizeSecurity = (type, value) => {
  if (type === 'trojan' || type === 'hysteria2' || type === 'tuic') {
    return 'tls';
  }
  const security = cleanString(value).toLowerCase();
  if (type === 'vmess' || type === 'vless') {
    return ['tls', 'reality', 'none'].includes(security) ? security : 'none';
  }
  return 'none';
};

const normalizeTransport = (type, value) => {
  if (!TYPES_WITH_TRANSPORT.has(type)) {
    return 'tcp';
  }
  const transport = cleanString(value).toLowerCase();
  return ['tcp', 'ws', 'grpc'].includes(transport) ? transport : 'tcp';
};

const usesTls = (type, security) => TYPES_WITH_FIXED_TLS.has(type) || ((type === 'vmess' || type === 'vless') && security !== 'none');

const deriveSecurity = (type, node) => {
  if (type === 'trojan' || type === 'hysteria2' || type === 'tuic') {
    return 'tls';
  }
  if (node?.security === 'reality') {
    return 'reality';
  }
  if (node?.security === 'tls' || node?.tls === true) {
    return 'tls';
  }
  return 'none';
};

const deriveTransport = (type, node) => {
  if (!TYPES_WITH_TRANSPORT.has(type)) {
    return 'tcp';
  }
  return normalizeTransport(type, node?.transport || node?.network || 'tcp');
};

const normalizeCountryCode = (value) => cleanString(value).toUpperCase();
const defaultAlpnForType = (type) => (type === 'tuic' ? 'h3' : '');
const normalizeAlpnForForm = (type, value) => {
  const text = Array.isArray(value) ? value.filter(Boolean).join(',') : toFormString(value);
  return text || defaultAlpnForType(type);
};

export const createManualNodeFormState = (currentGroup = '') => ({
  ...DEFAULT_NODE_FORM_STATE,
  group: cleanString(currentGroup),
});

export const extractAdvancedNodeFields = (node) => {
  const advanced = {};
  if (!node || typeof node !== 'object') {
    return advanced;
  }
  Object.entries(node).forEach(([key, value]) => {
    if (FORM_EXCLUDED_KEYS.has(key)) {
      return;
    }
    advanced[key] = value;
  });
  return advanced;
};

export const normalizeNodeForForm = (node) => {
  const type = normalizeType(node?.type);
  const security = deriveSecurity(type, node);
  const transport = deriveTransport(type, node);
  const packetEncoding = cleanString(node?.packet_encoding)
    || (type === 'vmess' ? 'packetaddr' : type === 'vless' ? 'xudp' : '');
  return {
    ...DEFAULT_NODE_FORM_STATE,
    type,
    name: toFormString(node?.name),
    server: toFormString(node?.server),
    port: toFormString(node?.port || 443),
    group: toFormString(node?.group),
    countryCodeOverride: normalizeCountryCode(node?.countryCodeOverride),
    security,
    transport,
    uuid: toFormString(node?.uuid),
    password: toFormString(node?.password),
    username: toFormString(node?.username),
    method: toFormString(node?.method),
    version: toFormString(node?.version || (type === 'socks' ? '5' : '')),
    alterId: toFormString(node?.alterId ?? node?.alter_id ?? (type === 'vmess' ? 0 : '')),
    flow: toFormString(node?.flow),
    packet_encoding: packetEncoding,
    sni: toFormString(node?.sni),
    insecure: !!node?.insecure,
    alpn: normalizeAlpnForForm(type, node?.alpn),
    fp: toFormString(node?.fp || (TYPES_WITH_FP.has(type) ? 'chrome' : '')),
    wsPath: toFormString(node?.wsPath || (transport === 'ws' ? '/' : '')),
    wsHost: toFormString(node?.wsHost),
    max_early_data: toFormString(node?.max_early_data),
    early_data_header_name: toFormString(node?.early_data_header_name),
    serviceName: toFormString(node?.serviceName || node?.service_name),
    pbk: toFormString(node?.pbk),
    sid: toFormString(node?.sid),
    spx: toFormString(node?.spx),
    tls_min_version: toFormString(node?.tls_min_version),
    tls_max_version: toFormString(node?.tls_max_version),
    tls_cipher_suites: toFormString(node?.tls_cipher_suites),
    certificate_public_key_sha256: toFormString(node?.certificate_public_key_sha256),
    plugin: toFormString(node?.plugin),
    plugin_opts: toFormString(node?.plugin_opts),
    obfs: toFormString(node?.obfs),
    obfs_password: toFormString(node?.obfs_password),
    up_mbps: toFormString(node?.up_mbps),
    down_mbps: toFormString(node?.down_mbps),
    congestion_control: toFormString(node?.congestion_control || (type === 'tuic' ? 'bbr' : '')),
    udp_relay_mode: toFormString(node?.udp_relay_mode || (type === 'tuic' ? 'quic-rfc' : '')),
    heartbeat: toFormString(node?.heartbeat),
    udp_over_stream: !!node?.udp_over_stream,
    zero_rtt_handshake: !!node?.zero_rtt_handshake,
    ip: toFormString(node?.ip)
  };
};

export const parseAdvancedNodeFields = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`高级参数 JSON 格式错误: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('高级参数 JSON 必须是对象');
  }
  return parsed;
};

const parsePositiveInteger = (value, fieldLabel) => {
  const trimmed = cleanString(value);
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel}必须是正整数`);
  }
  return parsed;
};

const parseOptionalInteger = (value, fieldLabel) => {
  const trimmed = cleanString(value);
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel}格式不正确`);
  }
  return parsed;
};

const parseOptionalNumber = (value, fieldLabel) => {
  const trimmed = cleanString(value);
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel}格式不正确`);
  }
  return parsed;
};

const setIfPresent = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
};

const normalizeWsHeaders = (node, wsHost) => {
  if (!node.headers || typeof node.headers !== 'object' || Array.isArray(node.headers)) {
    node.headers = {};
  } else {
    node.headers = cloneJsonObject(node.headers);
  }
  delete node.headers.Host;
  delete node.headers.host;
  if (wsHost) {
    node.headers.Host = wsHost;
  }
  if (!Object.keys(node.headers).length) {
    delete node.headers;
  }
};

const pruneTypeSpecificFields = (node, type, security, transport) => {
  const drop = (...keys) => keys.forEach((key) => delete node[key]);
  const tlsEnabled = usesTls(type, security);

  drop('service_name', 'path', 'host');

  if (!tlsEnabled) {
    drop(
      'tls',
      'sni',
      'insecure',
      'alpn',
      'fp',
      'pbk',
      'sid',
      'spx',
      'reality_next_protocol',
      'tls_min_version',
      'tls_max_version',
      'tls_cipher_suites',
      'certificate_public_key_sha256',
      'record_fragment'
    );
  }

  if (security !== 'reality') {
    drop('pbk', 'sid', 'spx', 'reality_next_protocol');
  }

  if (!TYPES_WITH_TRANSPORT.has(type)) {
    drop(
      'transport',
      'network',
      'wsPath',
      'wsHost',
      'headers',
      'max_early_data',
      'early_data_header_name',
      'serviceName',
      'grpc_idle_timeout',
      'grpc_ping_timeout',
      'grpc_permit_without_stream'
    );
  } else if (transport === 'ws') {
    drop('serviceName', 'grpc_idle_timeout', 'grpc_ping_timeout', 'grpc_permit_without_stream');
  } else if (transport === 'grpc') {
    drop('wsPath', 'wsHost', 'headers', 'max_early_data', 'early_data_header_name');
  } else {
    drop(
      'wsPath',
      'wsHost',
      'headers',
      'max_early_data',
      'early_data_header_name',
      'serviceName',
      'grpc_idle_timeout',
      'grpc_ping_timeout',
      'grpc_permit_without_stream'
    );
  }

  if (type !== 'vmess') {
    drop('alterId');
  }
  if (!['vmess', 'vless'].includes(type)) {
    drop('packet_encoding');
  }
  if (type !== 'vless') {
    drop('flow');
  }
  if (type !== 'shadowsocks') {
    drop('method', 'plugin', 'plugin_opts');
  }
  if (type !== 'socks') {
    drop('version');
  }
  if (!['socks', 'http'].includes(type)) {
    drop('username');
  }
  if (!['vmess', 'vless', 'tuic'].includes(type)) {
    drop('uuid');
  }
  if (!['trojan', 'tuic', 'hysteria2', 'shadowsocks', 'socks', 'http'].includes(type)) {
    drop('password');
  }
  if (type !== 'hysteria2') {
    drop('obfs', 'obfs_password', 'up_mbps', 'down_mbps');
  }
  if (type !== 'tuic') {
    drop('congestion_control', 'udp_relay_mode');
  }
  if (!['hysteria2', 'tuic'].includes(type)) {
    drop('heartbeat', 'udp_over_stream', 'zero_rtt_handshake', 'ip');
  }
  if (!TYPES_WITH_FP.has(type)) {
    drop('fp');
  }
};

export const buildNodePayloadFromForm = (formState, advancedFields = {}) => {
  const type = normalizeType(formState?.type);
  const security = normalizeSecurity(type, formState?.security);
  const transport = normalizeTransport(type, formState?.transport);
  const node = cloneJsonObject(advancedFields);
  const server = cleanString(formState?.server);
  const name = cleanString(formState?.name);
  const group = cleanString(formState?.group);
  const countryCodeOverride = normalizeCountryCode(formState?.countryCodeOverride);

  if (!server) {
    throw new Error('请输入服务器地址');
  }

  node.type = type;
  node.name = name || server;
  node.server = server;
  node.port = parsePositiveInteger(formState?.port, '端口');
  node.group = group || null;
  node.countryCodeOverride = countryCodeOverride || null;

  if (countryCodeOverride && !/^[A-Z]{2}$/u.test(countryCodeOverride)) {
    throw new Error('国家代码必须是 2 位字母，例如 JP / US');
  }

  pruneTypeSpecificFields(node, type, security, transport);

  if (TYPES_WITH_SECURITY.has(type)) {
    node.security = security;
  } else {
    delete node.security;
  }

  if (usesTls(type, security)) {
    node.tls = true;
  }

  if (TYPES_WITH_TRANSPORT.has(type)) {
    node.transport = transport;
  }

  if (type === 'vmess' || type === 'vless' || type === 'tuic') {
    const uuid = cleanString(formState?.uuid);
    if (!uuid) {
      throw new Error('该协议需要填写 UUID');
    }
    node.uuid = uuid;
  }

  if (type === 'trojan' || type === 'tuic' || type === 'hysteria2') {
    const password = cleanString(formState?.password);
    if (!password) {
      throw new Error('该协议需要填写密码');
    }
    node.password = password;
  }

  if (type === 'shadowsocks') {
    const method = cleanString(formState?.method);
    const password = cleanString(formState?.password);
    if (!method) {
      throw new Error('Shadowsocks 需要填写加密方法');
    }
    if (!password) {
      throw new Error('Shadowsocks 需要填写密码');
    }
    node.method = method;
    node.password = password;
    setIfPresent(node, 'plugin', cleanOptionalString(formState?.plugin));
    setIfPresent(node, 'plugin_opts', cleanOptionalString(formState?.plugin_opts));
  }

  if (type === 'socks' || type === 'http') {
    setIfPresent(node, 'username', cleanOptionalString(formState?.username));
    setIfPresent(node, 'password', cleanOptionalString(formState?.password));
    if (type === 'socks') {
      node.version = cleanOptionalString(formState?.version) || '5';
    }
  }

  if (type === 'vmess') {
    node.alterId = parseOptionalInteger(formState?.alterId, 'Alter ID') ?? 0;
    node.packet_encoding = cleanOptionalString(formState?.packet_encoding) || 'packetaddr';
  }

  if (type === 'vless') {
    setIfPresent(node, 'flow', cleanOptionalString(formState?.flow));
    node.packet_encoding = cleanOptionalString(formState?.packet_encoding) || 'xudp';
  }

  if (TYPES_WITH_TRANSPORT.has(type)) {
    if (transport === 'ws') {
      node.wsPath = cleanOptionalString(formState?.wsPath) || '/';
      const wsHost = cleanOptionalString(formState?.wsHost);
      setIfPresent(node, 'wsHost', wsHost);
      const maxEarlyData = parseOptionalInteger(formState?.max_early_data, 'WS Early Data');
      setIfPresent(node, 'max_early_data', maxEarlyData);
      setIfPresent(node, 'early_data_header_name', cleanOptionalString(formState?.early_data_header_name));
      normalizeWsHeaders(node, wsHost);
    } else if (transport === 'grpc') {
      node.serviceName = cleanOptionalString(formState?.serviceName) || '';
    }
  }

  if (usesTls(type, security)) {
    setIfPresent(node, 'sni', cleanOptionalString(formState?.sni) || (TYPES_WITH_FIXED_TLS.has(type) ? server : undefined));
    if (formState?.insecure) {
      node.insecure = true;
    }
    setIfPresent(node, 'alpn', cleanOptionalString(formState?.alpn) || defaultAlpnForType(type) || undefined);
    setIfPresent(node, 'tls_min_version', cleanOptionalString(formState?.tls_min_version));
    setIfPresent(node, 'tls_max_version', cleanOptionalString(formState?.tls_max_version));
    setIfPresent(node, 'tls_cipher_suites', cleanOptionalString(formState?.tls_cipher_suites));
    setIfPresent(node, 'certificate_public_key_sha256', cleanOptionalString(formState?.certificate_public_key_sha256));

    if (TYPES_WITH_FP.has(type)) {
      setIfPresent(node, 'fp', cleanOptionalString(formState?.fp) || 'chrome');
    }

    if (security === 'reality') {
      const pbk = cleanString(formState?.pbk);
      if (!pbk) {
        throw new Error('Reality 模式需要填写公钥');
      }
      node.pbk = pbk;
      setIfPresent(node, 'sid', cleanOptionalString(formState?.sid));
      setIfPresent(node, 'spx', cleanOptionalString(formState?.spx));
    }
  }

  if (type === 'hysteria2') {
    setIfPresent(node, 'obfs', cleanOptionalString(formState?.obfs));
    setIfPresent(node, 'obfs_password', cleanOptionalString(formState?.obfs_password));
    setIfPresent(node, 'up_mbps', parseOptionalNumber(formState?.up_mbps, '上行带宽'));
    setIfPresent(node, 'down_mbps', parseOptionalNumber(formState?.down_mbps, '下行带宽'));
    setIfPresent(node, 'heartbeat', cleanOptionalString(formState?.heartbeat));
    if (formState?.udp_over_stream) {
      node.udp_over_stream = true;
    }
    if (formState?.zero_rtt_handshake) {
      node.zero_rtt_handshake = true;
    }
    setIfPresent(node, 'ip', cleanOptionalString(formState?.ip));
  }

  if (type === 'tuic') {
    node.congestion_control = cleanOptionalString(formState?.congestion_control) || 'bbr';
    node.udp_relay_mode = cleanOptionalString(formState?.udp_relay_mode) || 'quic-rfc';
    setIfPresent(node, 'heartbeat', cleanOptionalString(formState?.heartbeat));
    if (formState?.udp_over_stream) {
      node.udp_over_stream = true;
    }
    if (formState?.zero_rtt_handshake) {
      node.zero_rtt_handshake = true;
    }
    setIfPresent(node, 'ip', cleanOptionalString(formState?.ip));
    setIfPresent(node, 'sni', cleanOptionalString(formState?.sni) || server);
  }

  return node;
};

export const getNodeFormVisibility = (formState) => {
  const type = normalizeType(formState?.type);
  const security = normalizeSecurity(type, formState?.security);
  const transport = normalizeTransport(type, formState?.transport);
  const tlsEnabled = usesTls(type, security);
  return {
    security: TYPES_WITH_SECURITY.has(type),
    transport: TYPES_WITH_TRANSPORT.has(type),
    uuid: ['vmess', 'vless', 'tuic'].includes(type),
    password: ['trojan', 'tuic', 'hysteria2', 'shadowsocks', 'socks', 'http'].includes(type),
    username: ['socks', 'http'].includes(type),
    method: type === 'shadowsocks',
    version: type === 'socks',
    alterId: type === 'vmess',
    flow: type === 'vless',
    packetEncoding: ['vmess', 'vless'].includes(type),
    wsPath: TYPES_WITH_TRANSPORT.has(type) && transport === 'ws',
    wsHost: TYPES_WITH_TRANSPORT.has(type) && transport === 'ws',
    wsEarlyData: TYPES_WITH_TRANSPORT.has(type) && transport === 'ws',
    grpcServiceName: TYPES_WITH_TRANSPORT.has(type) && transport === 'grpc',
    tlsSection: tlsEnabled,
    sni: tlsEnabled,
    insecure: tlsEnabled,
    alpn: tlsEnabled,
    fp: tlsEnabled && TYPES_WITH_FP.has(type),
    reality: type !== 'trojan' && security === 'reality',
    tlsAdvanced: tlsEnabled,
    shadowsocks: type === 'shadowsocks',
    hysteria2: type === 'hysteria2',
    tuic: type === 'tuic',
    heartbeat: ['hysteria2', 'tuic'].includes(type),
    udpFlags: ['hysteria2', 'tuic'].includes(type),
    ip: ['hysteria2', 'tuic'].includes(type)
  };
};
