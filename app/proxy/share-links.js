import { formatHostForUrl, normalizeHost } from '../shared/network.js';
import {
  normalizeHysteria2Obfs,
  normalizeVmessSecurity,
  nodeUsesReality,
  nodeUsesTls
} from './protocol-common.js';

const toBase64 = (value) => Buffer.from(String(value || ''), 'utf8').toString('base64');
const encodeShareName = (value, fallback = '') => encodeURIComponent(String(value || fallback || '').trim());

const buildQuery = (params) => {
  const parts = [];
  for (const [key, rawValue] of Object.entries(params || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    if (typeof rawValue === 'boolean') {
      if (rawValue) {
        parts.push(`${encodeURIComponent(key)}=1`);
      }
      continue;
    }

    const encoded = encodeURIComponent(String(rawValue)).replace(/%2C/gi, ',');
    parts.push(`${encodeURIComponent(key)}=${encoded}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

export const toShareLink = (node) => {
  if (!node || !node.type || !node.server) {
    return null;
  }

  const type = String(node.type).toLowerCase();
  const serverHost = normalizeHost(node.server);
  const name = encodeShareName(node.name, serverHost);
  const urlHost = formatHostForUrl(serverHost);
  const port = node.port ? Number.parseInt(node.port, 10) : null;

  if (type === 'vmess') {
    const vmessSecurity = normalizeVmessSecurity(node.security, 'none');
    const vmessTls = nodeUsesTls(node);
    const payload = {
      v: '2',
      ps: node.name || serverHost || 'VMess',
      add: serverHost,
      port: port || 443,
      id: node.uuid || '',
      aid: node.alterId || 0,
      scy: vmessSecurity,
      net: node.transport || 'tcp',
      type: 'none',
      host: node.wsHost || '',
      path: node.transport === 'grpc' ? (node.serviceName || '') : (node.wsPath || ''),
      tls: vmessTls ? 'tls' : '',
      sni: node.sni || node.wsHost || (vmessTls ? serverHost : ''),
      alpn: node.alpn || '',
      fp: node.fp || (vmessTls ? 'chrome' : '')
    };
    if (node.packet_encoding) {
      payload.packetEncoding = node.packet_encoding;
    }
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
    const isReality = nodeUsesReality(node);
    const query = buildQuery({
      security: isReality ? 'reality' : (node.security || (node.tls ? 'tls' : undefined)),
      type: node.transport || 'tcp',
      host: node.wsHost || undefined,
      path: node.wsPath || undefined,
      serviceName: node.serviceName || undefined,
      sni: node.sni || undefined,
      alpn: node.alpn || undefined,
      fp: node.fp || undefined,
      pbk: node.pbk || undefined,
      sid: isReality ? (node.sid || '') : undefined,
      allowInsecure: node.insecure ? '1' : undefined,
      ech: node.ech ? '1' : undefined,
      ech_config: node.ech_config || undefined
    });
    return `trojan://${encodeURIComponent(node.password)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
  }

  if (type === 'vless') {
    if (!node.uuid) {
      return null;
    }
    const isReality = nodeUsesReality(node);
    const vlessSecurity = isReality
      ? 'reality'
      : nodeUsesTls(node)
        ? 'tls'
        : undefined;
    const query = buildQuery({
      encryption: 'none',
      security: vlessSecurity,
      type: node.transport || 'tcp',
      host: node.wsHost || undefined,
      path: node.wsPath || undefined,
      serviceName: node.serviceName || undefined,
      sni: node.sni || node.wsHost || (vlessSecurity ? serverHost : undefined),
      alpn: node.alpn || undefined,
      fp: node.fp || (vlessSecurity ? 'chrome' : undefined),
      pbk: node.pbk || undefined,
      sid: isReality ? (node.sid || '') : undefined,
      flow: node.flow || undefined,
      allowInsecure: node.insecure ? '1' : undefined,
      packetEncoding: node.packet_encoding || undefined,
      ech: node.ech ? '1' : undefined,
      ech_config: node.ech_config || undefined
    });
    return `vless://${encodeURIComponent(node.uuid)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
  }

  if (type === 'hysteria2') {
    if (!node.password) {
      return null;
    }
    const hysteria2Obfs = normalizeHysteria2Obfs(node.obfs);
    const query = buildQuery({
      obfs: hysteria2Obfs || undefined,
      'obfs-password': hysteria2Obfs ? (node.obfs_password || undefined) : undefined,
      upmbps: node.up_mbps || undefined,
      downmbps: node.down_mbps || undefined,
      sni: node.sni || undefined,
      alpn: node.alpn || undefined,
      insecure: node.insecure ? '1' : undefined,
      allowInsecure: node.insecure ? '1' : undefined,
      ech: node.ech ? '1' : undefined,
      ech_config: node.ech_config || undefined
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
      alpn: node.alpn || 'h3',
      allow_insecure: node.insecure ? '1' : undefined,
      ech: node.ech ? '1' : undefined,
      ech_config: node.ech_config || undefined
    });
    return `tuic://${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
  }

  if (type === 'anytls') {
    if (!node.password) {
      return null;
    }
    const query = buildQuery({
      sni: node.sni || undefined,
      alpn: node.alpn || undefined,
      fp: node.fp || undefined,
      insecure: node.insecure ? '1' : undefined,
      allowInsecure: node.insecure ? '1' : undefined,
      idle_session_check_interval: node.idle_session_check_interval || undefined,
      idle_session_timeout: node.idle_session_timeout || undefined,
      min_idle_session: node.min_idle_session ?? undefined,
      ech: node.ech ? '1' : undefined,
      ech_config: node.ech_config || undefined
    });
    return `anytls://${encodeURIComponent(node.password)}@${urlHost}:${port || 443}${query}${name ? `#${name}` : ''}`;
  }

  if (type === 'socks' || type === 'http') {
    const scheme = type === 'http' ? 'http' : 'socks';
    const auth = node.username
      ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || '')}@`
      : '';
    return `${scheme}://${auth}${urlHost}:${port || (type === 'http' ? 80 : 1080)}${name ? `#${name}` : ''}`;
  }

  return null;
};
