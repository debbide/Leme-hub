import { normalizeHost } from '../shared/network.js';
import {
  VMESS_TLS_SECURITY_MODES,
  applyIfPresent,
  normalizeHysteria2Obfs,
  nodeUsesReality,
  toInt
} from './protocol-common.js';

export const normalizeConfigNode = (node, index = 0) => {
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
    idle_session_check_interval: node.idle_session_check_interval,
    idle_session_timeout: node.idle_session_timeout,
    min_idle_session: node.min_idle_session,
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
    ech: node.tls?.ech?.enabled ?? node.ech,
    ech_config: Array.isArray(node.tls?.ech?.config)
      ? node.tls.ech.config.join(',')
      : (node.tls?.ech?.config || node.ech_config),
    reality_next_protocol: Array.isArray(node.tls?.reality?.next_protocol)
      ? node.tls.reality.next_protocol.join(',')
      : (node.tls?.reality?.next_protocol || node.reality_next_protocol),
    record_fragment: node.tls?.record_fragment ?? node.record_fragment,
    udp_over_stream: node.udp_over_stream,
    zero_rtt_handshake: node.zero_rtt_handshake,
    grpc_idle_timeout: node.transport?.idle_timeout ?? node.grpc_idle_timeout,
    grpc_ping_timeout: node.transport?.ping_timeout ?? node.grpc_ping_timeout,
    grpc_permit_without_stream: node.transport?.permit_without_stream ?? node.grpc_permit_without_stream,
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

  if (normalized.type === 'vless' && nodeUsesReality({ ...node, ...normalized })) {
    normalized.tls = true;
    normalized.security = 'reality';
    normalized.sni = normalized.sni || normalized.server;
  } else if (normalized.type === 'vless' && (normalized.tls || String(normalized.security || '').toLowerCase() === 'tls')) {
    normalized.tls = true;
    normalized.security = normalized.security || 'tls';
    normalized.sni = normalized.sni || normalized.server;
  }

  if (normalized.type === 'vmess' && VMESS_TLS_SECURITY_MODES.has(String(normalized.security || '').trim().toLowerCase())) {
    normalized.tls = true;
    normalized.security = 'none';
  }

  if (normalized.type === 'shadowsocks' && normalized.plugin && !normalized.plugin_opts && node.plugin_opts) {
    normalized.plugin_opts = node.plugin_opts;
  }

  if (normalized.type === 'vmess' && normalized.transport === 'grpc' && !normalized.serviceName && node.path) {
    normalized.serviceName = node.path;
  }

  if (normalized.type === 'hysteria2') {
    normalized.obfs = normalizeHysteria2Obfs(normalized.obfs);
    if (!normalized.obfs) {
      delete normalized.obfs;
      delete normalized.obfs_password;
    }
    normalized.tls = true;
    normalized.security = normalized.security || 'tls';
    normalized.sni = normalized.sni || normalized.server;
    normalized.alpn = normalized.alpn || 'h3';
  }

  if (normalized.type === 'tuic') {
    normalized.tls = true;
    normalized.security = normalized.security || 'tls';
    normalized.sni = normalized.sni || normalized.server;
    normalized.alpn = normalized.alpn || 'h3';
  }

  if (normalized.type === 'anytls') {
    normalized.tls = true;
    normalized.security = 'tls';
    normalized.sni = normalized.sni || normalized.server;
  }

  if (normalized.type === 'trojan' && normalized.security !== 'none') {
    normalized.tls = true;
    normalized.security = normalized.security || 'tls';
    normalized.sni = normalized.sni || normalized.server;
  }

  return normalized;
};
