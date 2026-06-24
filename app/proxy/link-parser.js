import { normalizeHost } from '../shared/network.js';
import {
  VMESS_TLS_SECURITY_MODES,
  normalizeHysteria2Obfs,
  normalizeVmessSecurity,
  toBool,
  toInt
} from './protocol-common.js';

export const PROXY_LINK_SCHEME_RE = /^(vmess|vless|trojan|ss|shadowsocks|socks|socks5|http|https|tuic|hy2|hysteria2|anytls):\/\//u;
const PROXY_LINK_SPLIT_RE = /\r?\n|\s+(?=(?:vmess|vless|trojan|ss|shadowsocks|socks|socks5|http|https|tuic|hy2|hysteria2|anytls):\/\/)/u;

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

export const normalizeImportedProxyLink = (value) => {
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

export const parseProxyLink = (link, options = {}) => {
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
    const securityParam = String(params.get('security') || '').trim().toLowerCase();
    const vmessCipherParam = String(params.get('scy') || params.get('cipher') || params.get('encryption') || '').trim().toLowerCase();
    const tlsParam = String(params.get('tls') || '').trim().toLowerCase();
    const wantsTls = ['tls', '1', 'true'].includes(tlsParam) || VMESS_TLS_SECURITY_MODES.has(securityParam);

    const config = {
      id: nodeId,
      name,
      type: protocol,
      server: normalizeHost(url.hostname),
      port: parseInt(url.port, 10)
    };

    if (Number.isNaN(config.port)) {
      config.port = wantsTls ? 443 : 80;
    }

    if (params.get('sni')) config.sni = normalizeHost(params.get('sni'));
    if (protocol === 'vmess') {
      if (vmessCipherParam) {
        config.security = normalizeVmessSecurity(vmessCipherParam, 'auto');
      }
      if (securityParam) {
        if (VMESS_TLS_SECURITY_MODES.has(securityParam)) {
          config.tls = true;
        } else if (!config.security) {
          config.security = normalizeVmessSecurity(securityParam, 'auto');
        }
      }
    } else if (securityParam) {
      config.security = securityParam;
    }
    if (['tls', '1', 'true'].includes(params.get('tls'))) config.tls = true;
    if (params.get('alpn')) config.alpn = params.get('alpn');
    if (params.get('type') === 'grpc' && !params.get('serviceName') && params.get('path')) {
      config.serviceName = params.get('path');
    }
    if (params.get('path')) config.wsPath = params.get('path');
    config.wsHost = params.get('host') || params.get('wsHost') || '';
    if (!config.wsHost && params.get('host')) {
      config.wsHost = normalizeHost(params.get('host'));
    }
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
    if (params.get('upmbps')) config.up_mbps = toInt(params.get('upmbps'));
    if (params.get('up')) config.up_mbps = toInt(params.get('up'), config.up_mbps);
    if (params.get('downmbps')) config.down_mbps = toInt(params.get('downmbps'));
    if (params.get('down')) config.down_mbps = toInt(params.get('down'), config.down_mbps);
    if (params.get('congestion_control')) config.congestion_control = params.get('congestion_control');
    if (params.get('udp_relay_mode')) config.udp_relay_mode = params.get('udp_relay_mode');
    if (params.get('idle_session_check_interval')) config.idle_session_check_interval = params.get('idle_session_check_interval');
    if (params.get('idle-session-check-interval')) config.idle_session_check_interval = params.get('idle-session-check-interval');
    if (params.get('idle_session_timeout')) config.idle_session_timeout = params.get('idle_session_timeout');
    if (params.get('idle-session-timeout')) config.idle_session_timeout = params.get('idle-session-timeout');
    if (params.get('min_idle_session')) config.min_idle_session = toInt(params.get('min_idle_session'));
    if (params.get('min-idle-session')) config.min_idle_session = toInt(params.get('min-idle-session'), config.min_idle_session);
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
    
    const echParam = params.get('ech');
    if (echParam) {
      config.ech = true;
      if (!['1', 'true'].includes(echParam.toLowerCase())) {
        config.ech_config = echParam;
      }
    }
    if (params.get('ech_config')) {
      config.ech = true;
      config.ech_config = params.get('ech_config');
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
      config.tls = true;
      config.security = config.security || 'tls';
      if (!config.sni) {
        config.sni = config.server;
      }
      if (!config.alpn) {
        config.alpn = 'h3';
      }
      if (!url.port) {
        config.port = 443;
      }
    } else if (protocol === 'hysteria2' || protocol === 'hy2') {
      config.type = 'hysteria2';
      config.password = rawUser && rawPass
        ? `${rawUser}:${rawPass}`
        : (rawUser || rawPass);
      const hysteria2Obfs = normalizeHysteria2Obfs(params.get('obfs'));
      if (hysteria2Obfs) {
        config.obfs = hysteria2Obfs;
      }
      config.tls = true;
      config.security = config.security || 'tls';
      if (!config.sni) {
        config.sni = config.server;
      }
      if (!config.alpn) {
        config.alpn = 'h3';
      }
      if (!url.port) {
        config.port = 443;
      }
      if (hysteria2Obfs && (params.get('obfs-password') || params.get('obfs_password'))) {
        config.obfs_password = params.get('obfs-password') || params.get('obfs_password');
      }
    } else if (protocol === 'anytls') {
      config.password = rawUser && rawPass
        ? `${rawUser}:${rawPass}`
        : (rawUser || rawPass);
      config.tls = true;
      config.security = 'tls';
      if (!config.sni) {
        config.sni = config.server;
      }
      if (!url.port) {
        config.port = 443;
      }
    } else if (protocol === 'vmess') {
      config.uuid = rawUser || rawPass || params.get('uuid') || params.get('id');
    } else if (protocol === 'vless') {
      config.uuid = rawUser || rawPass;
    } else if (protocol === 'trojan') {
      config.password = rawUser;
      const tlsExplicitlyDisabled = securityParam === 'none' || ['0', 'false', 'none'].includes(tlsParam);
      if (!tlsExplicitlyDisabled) {
        config.tls = true;
        config.security = config.security || 'tls';
        if (!config.sni) {
          config.sni = config.server;
        }
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
        } catch {
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
    options.log?.error?.(`[ProxyService] Link parse error: ${error.message}`);
    return null;
  }
};

export const parseProxyLinks = (input, options = {}) => String(input || '')
  .split(PROXY_LINK_SPLIT_RE)
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => parseProxyLink(item, options))
  .filter(Boolean);
