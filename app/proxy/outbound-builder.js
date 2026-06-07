import { isIpLiteralHost, normalizeHost } from '../shared/network.js';
import {
  FRAGMENTABLE_TLS_OUTBOUND_TYPES,
  applyIfPresent,
  defaultTlsAlpnForNode,
  normalizeHysteria2Obfs,
  normalizeVmessSecurity,
  nodeUsesReality,
  nodeUsesTls,
  toInt,
  toList
} from './protocol-common.js';

export const buildNodeOutbound = (node, options = {}) => {
  const { validNodeMap = new Map(), tlsFragmentEnabled = false } = options;
  const serverHost = normalizeHost(node.server);
  const outbound = {
    type: node.type,
    tag: `out-${node.id}`,
    server: serverHost,
    server_port: node.port
  };

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
      const frontProxyNodeId = String(node.frontProxyNodeId || '').trim();
      const frontProxyNode = validNodeMap.get(frontProxyNodeId);
      if (frontProxyNodeId
          && frontProxyNodeId !== node.id
          && frontProxyNode
          && String(frontProxyNode.type || '').toLowerCase() !== 'socks') {
        outbound.detour = `out-${frontProxyNodeId}`;
      }
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
    outbound.security = normalizeVmessSecurity(node.security, 'none');
    outbound.alter_id = parseInt(node.alterId || 0, 10);
    outbound.packet_encoding = node.packet_encoding || 'packetaddr';
  } else if (node.type === 'shadowsocks') {
    outbound.method = node.method || 'aes-256-gcm';
    applyIfPresent(outbound, 'plugin', node.plugin);
    applyIfPresent(outbound, 'plugin_opts', node.plugin_opts);
  } else if (node.type === 'vless') {
    outbound.uuid = String(node.uuid || '').trim();
    const defaultEncoding = node.flow === 'xtls-rprx-vision' ? 'xudp' : undefined;
    applyIfPresent(outbound, 'packet_encoding', node.packet_encoding || defaultEncoding);
  }

  applyIfPresent(outbound, 'network', node.network);
  applyIfPresent(outbound, 'ip', node.ip);

  const isTls = nodeUsesTls(node);
  const isReality = nodeUsesReality(node);
  const tlsExplicitlyDisabled = node.type !== 'vmess' && String(node.security || '').trim().toLowerCase() === 'none';

  if (isTls || (node.sni && !tlsExplicitlyDisabled)) {
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
    } else if (tlsFragmentEnabled && FRAGMENTABLE_TLS_OUTBOUND_TYPES.has(node.type)) {
      outbound.tls.record_fragment = true;
    }

    const tlsAlpn = toList(node.alpn);
    if (tlsAlpn.length) {
      outbound.tls.alpn = tlsAlpn;
    }

    applyIfPresent(outbound.tls, 'min_version', node.tls_min_version);
    applyIfPresent(outbound.tls, 'max_version', node.tls_max_version);
    if (node.tls_cipher_suites) {
      outbound.tls.cipher_suites = toList(node.tls_cipher_suites);
    }
    if (node.certificate_public_key_sha256) {
      outbound.tls.certificate_public_key_sha256 = toList(node.certificate_public_key_sha256);
    }

    if (isReality) {
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
        cleanPath = cleanPath.replace(/\?$/u, '').replace(/&$/u, '');
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
    const hysteria2Obfs = normalizeHysteria2Obfs(node.obfs);
    if (hysteria2Obfs) {
      outbound.obfs = {
        type: hysteria2Obfs,
        password: node.obfs_password || ''
      };
    }
    applyIfPresent(outbound, 'up_mbps', node.up_mbps);
    applyIfPresent(outbound, 'down_mbps', node.down_mbps);
    applyIfPresent(outbound, 'heartbeat', node.heartbeat);
    applyIfPresent(outbound, 'udp_over_stream', node.udp_over_stream);
    applyIfPresent(outbound, 'zero_rtt_handshake', node.zero_rtt_handshake);
    if (outbound.tls && (!Array.isArray(outbound.tls.alpn) || !outbound.tls.alpn.length)) {
      outbound.tls.alpn = defaultTlsAlpnForNode(node);
    }
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
    }

    const tuicAlpn = toList(node.alpn);
    outbound.tls.alpn = tuicAlpn.length ? tuicAlpn : defaultTlsAlpnForNode(node);

    if (outbound.tls && outbound.tls.utls) {
      delete outbound.tls.utls;
    }
  }

  if (node.type === 'anytls') {
    outbound.password = node.password;
    applyIfPresent(outbound, 'idle_session_check_interval', node.idle_session_check_interval);
    applyIfPresent(outbound, 'idle_session_timeout', node.idle_session_timeout);
    applyIfPresent(outbound, 'min_idle_session', toInt(node.min_idle_session));

    if (!outbound.tls) {
      outbound.tls = {
        enabled: true,
        server_name: normalizeHost(node.sni) || serverHost,
        insecure: !!node.insecure
      };
    }
  }

  if (node.type === 'hysteria2' && outbound.tls && outbound.tls.utls) {
    delete outbound.tls.utls;
  }

  return outbound;
};
