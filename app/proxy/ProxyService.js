import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_PROXY_BASE_PORT,
  DEFAULT_PROXY_LISTEN_HOST
} from '../shared/constants.js';

const toInt = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const toList = (value) => Array.isArray(value)
  ? value.filter(Boolean)
  : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const applyIfPresent = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
};

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

export class ProxyService {
  constructor(options = {}) {
    const {
      configDir,
      projectRoot,
      proxyListen = process.env.PROXY_LISTEN || DEFAULT_PROXY_LISTEN_HOST,
      basePort = DEFAULT_PROXY_BASE_PORT,
      configFileName = DEFAULT_CONFIG_FILE,
      log = console
    } = typeof options === 'string' ? { configDir: options } : options;

    this.proxyProcess = null;
    this.nodes = [];
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
    this.proxyListen = proxyListen;
    this.basePort = basePort;
    this.log = log;
    this.binName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';
    this.nodePortMap = new Map();
    this.configDir = path.resolve(configDir || path.join(this.projectRoot, 'data'));

    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    this.configPath = path.join(this.configDir, configFileName);
  }

  setNodes(nodes) {
    this.nodes = Array.isArray(nodes) ? nodes : [];
    this.updatePortMap();
  }

  resolveDefaultNodeId(validNodes, requestedNodeId) {
    if (requestedNodeId && validNodes.some((node) => node.id === requestedNodeId)) {
      return requestedNodeId;
    }

    return validNodes[0]?.id || null;
  }

  updatePortMap() {
    this.nodePortMap.clear();
    const usedPorts = new Set();

    this.nodes.forEach((node, index) => {
      let desiredPort = null;

      if (node && node.local_port !== undefined && node.local_port !== null) {
        const parsed = parseInt(node.local_port, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          desiredPort = parsed;
        }
      }

      if (!desiredPort || usedPorts.has(desiredPort)) {
        desiredPort = this.basePort + index;
        while (usedPorts.has(desiredPort)) {
          desiredPort += 1;
        }
      }

      usedPorts.add(desiredPort);
      this.nodePortMap.set(node.id, desiredPort);
    });
  }

  getLocalPort(nodeId) {
    return this.nodePortMap.get(nodeId);
  }

  generateConfig(options = {}) {
    const {
      activeNodeId = null,
      proxyMode = 'rule',
      customRules = [],
      systemProxyEnabled = false,
      systemProxyHttpPort,
      systemProxySocksPort
    } = options;
    const uuidRequired = new Set(['vmess', 'vless', 'tuic']);
    const isValidUuid = (value) => typeof value === 'string'
      && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

    const validNodes = (this.nodes || []).filter((node) => {
      if (!node) {
        return false;
      }

      if (uuidRequired.has(node.type)) {
        const uuid = node.uuid || '';
        if (!isValidUuid(uuid)) {
          const label = node.name || node.id || node.type;
          this.log.error(`[ProxyService] Skipping node ${label}: invalid uuid "${uuid}"`);
          return false;
        }
      }

      return true;
    });

    this.nodes = validNodes;
    this.updatePortMap();
    const effectiveNodeId = this.resolveDefaultNodeId(validNodes, activeNodeId);

    const inbounds = validNodes.map((node, index) => ({
      type: 'socks',
      tag: `in-${node.id}`,
      listen: this.proxyListen,
      listen_port: this.nodePortMap.get(node.id) || (this.basePort + index)
    }));

    const outbounds = validNodes.map((node) => {
      const outbound = {
        type: node.type,
        tag: `out-${node.id}`,
        server: node.server,
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
        outbound.security = node.security || 'none';
        outbound.alter_id = parseInt(node.alterId || 0, 10);
        outbound.packet_encoding = node.packet_encoding || 'packetaddr';
      } else if (node.type === 'shadowsocks') {
        outbound.method = node.method || 'aes-256-gcm';
        applyIfPresent(outbound, 'plugin', node.plugin);
        applyIfPresent(outbound, 'plugin_opts', node.plugin_opts);
      } else if (node.type === 'vless') {
        outbound.packet_encoding = node.packet_encoding || 'xudp';
      }

      applyIfPresent(outbound, 'network', node.network);
      applyIfPresent(outbound, 'ip', node.ip);

      const isTls = node.security === 'tls' || node.security === 'reality' || node.tls === true;

      if (isTls || node.sni) {
        outbound.tls = {
          enabled: true,
          server_name: node.sni || node.wsHost || node.server,
          insecure: !!node.insecure,
          utls: {
            enabled: true,
            fingerprint: node.fp || 'chrome'
          }
        };

        if (node.record_fragment !== undefined) {
          outbound.tls.record_fragment = !!node.record_fragment;
        }

        if (node.alpn) {
          outbound.tls.alpn = toList(node.alpn);
        } else if (node.transport === 'ws') {
          outbound.tls.alpn = ['http/1.1'];
        }

        applyIfPresent(outbound.tls, 'min_version', node.tls_min_version);
        applyIfPresent(outbound.tls, 'max_version', node.tls_max_version);
        if (node.tls_cipher_suites) {
          outbound.tls.cipher_suites = toList(node.tls_cipher_suites);
        }
        if (node.certificate_public_key_sha256) {
          outbound.tls.certificate_public_key_sha256 = toList(node.certificate_public_key_sha256);
        }

        if (node.security === 'reality') {
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
            cleanPath = cleanPath.replace(/\?$/, '').replace(/&$/, '');
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

        const hostHeader = node.wsHost || node.sni || node.server;
        if (hostHeader && !hostHeader.match(/^\d+\.\d+\.\d+\.\d+$/)) {
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
        if (node.obfs) {
          outbound.obfs = {
            type: node.obfs,
            password: node.obfs_password || ''
          };
        }
        applyIfPresent(outbound, 'up_mbps', node.up_mbps);
        applyIfPresent(outbound, 'down_mbps', node.down_mbps);
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
            server_name: node.sni || node.server,
            insecure: !!node.insecure
          };
          if (node.alpn) {
            outbound.tls.alpn = Array.isArray(node.alpn) ? node.alpn : [node.alpn];
          }
        }

        if (outbound.tls && outbound.tls.utls) {
          delete outbound.tls.utls;
        }
      }

      return outbound;
    });

    if (systemProxyEnabled && systemProxySocksPort) {
      inbounds.push({
        type: 'socks',
        tag: 'system-socks',
        listen: this.proxyListen,
        listen_port: systemProxySocksPort
      });
    }

    if (systemProxyEnabled && systemProxyHttpPort) {
      inbounds.push({
        type: 'http',
        tag: 'system-http',
        listen: this.proxyListen,
        listen_port: systemProxyHttpPort
      });
    }

    const activeOutbound = effectiveNodeId ? `out-${effectiveNodeId}` : 'direct';
    const finalOutbound = !systemProxyEnabled || proxyMode === 'custom'
      ? 'direct'
      : proxyMode === 'direct'
        ? 'direct'
        : activeOutbound;

    const routeRules = [
      ...validNodes.map((node) => ({
        inbound: [`in-${node.id}`],
        outbound: `out-${node.id}`
      }))
    ];

    if (proxyMode === 'rule' || !systemProxyEnabled) {
      routeRules.unshift({
        ip_is_private: true,
        outbound: 'direct'
      });
    }
    
    // Global sniffing rule MUST be at the top for proper protocol identification (WebSocket, gRPC, etc.)
    routeRules.unshift({ action: 'sniff' });

    if (systemProxyEnabled) {
      const systemInbounds = ['system-socks', 'system-http'].filter((tag) => inbounds.some((inbound) => inbound.tag === tag));
      if (systemInbounds.length && proxyMode !== 'custom') {
        const systemOutbound = proxyMode === 'direct' ? 'direct' : activeOutbound;
        routeRules.push({
          inbound: systemInbounds,
          outbound: systemOutbound
        });
      } else if (systemInbounds.length && proxyMode === 'custom') {
        for (const rule of customRules) {
          const translatedRule = {
            inbound: systemInbounds,
            outbound: rule.action === 'direct' ? 'direct' : activeOutbound
          };

          if (rule.type === 'domain') {
            translatedRule.domain = [rule.value];
          } else if (rule.type === 'domain_suffix') {
            translatedRule.domain_suffix = [rule.value];
          } else if (rule.type === 'domain_keyword') {
            translatedRule.domain_keyword = [rule.value];
          } else if (rule.type === 'ip_cidr') {
            translatedRule.ip_cidr = [rule.value];
          }

          routeRules.push(translatedRule);
        }

        routeRules.push({
          inbound: systemInbounds,
          outbound: activeOutbound
        });
      }
    }

    return {
      log: { level: 'info' },
      inbounds,
      outbounds: [...outbounds, { type: 'direct', tag: 'direct' }],
      route: {
        rules: routeRules,
        auto_detect_interface: true,
        final: finalOutbound
      }
    };
  }

  resolveExecutablePath(explicitPath) {
    if (!explicitPath) {
      throw new Error('ProxyService.start requires a resolved sing-box executable path');
    }

    const candidate = path.resolve(explicitPath);
    if (!fs.existsSync(candidate)) {
      throw new Error(`Resolved sing-box executable does not exist: ${candidate}`);
    }

    return candidate;
  }

  writeConfig(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  waitForPortReady(port, timeoutMs = 15000) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const attempt = () => {
        const socket = new net.Socket();

        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });

        socket.once('error', () => {
          socket.destroy();
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error(`Timed out waiting for sing-box to listen on ${this.proxyListen}:${port}`));
            return;
          }

          setTimeout(attempt, 200);
        });

        socket.connect(port, this.proxyListen);
      };

      attempt();
    });
  }

  async waitForRuntimeReady(runtime = {}) {
    const ports = new Set((this.nodes || []).map((node) => this.getLocalPort(node.id)).filter(Boolean));

    if (runtime.systemProxyEnabled && runtime.systemProxySocksPort) {
      ports.add(runtime.systemProxySocksPort);
    }

    if (runtime.systemProxyEnabled && runtime.systemProxyHttpPort) {
      ports.add(runtime.systemProxyHttpPort);
    }

    if (!ports.size) {
      return;
    }

    await Promise.all([...ports].map((port) => this.waitForPortReady(port)));
  }

  async start(options = {}) {
    if (this.nodes.length === 0) {
      throw new Error('No proxy nodes configured');
    }

    const config = this.generateConfig(options.runtime || {});
    this.writeConfig(config);
    this.stop();

    const execPath = this.resolveExecutablePath(options.binPath);
    this.proxyProcess = spawn(execPath, ['run', '-c', this.configPath]);

    this.proxyProcess.stdout.on('data', (data) => {
      this.log.log(`[Proxy Log] ${data.toString().trim()}`);
    });

    this.proxyProcess.stderr.on('data', (data) => {
      this.log.error(`[Proxy STDERR] ${data.toString().trim()}`);
    });

    this.proxyProcess.on('error', (error) => {
      this.log.error(`[ProxyService] Failed to start sing-box process: ${error.message}`);
    });

    await this.waitForRuntimeReady(options.runtime || {});

    return {
      started: true,
      configPath: this.configPath,
      executablePath: execPath
    };
  }

  stop() {
    if (this.proxyProcess) {
      this.proxyProcess.kill();
      this.proxyProcess = null;
    }
  }

  async restart(nodes, options = {}) {
    this.setNodes(nodes);
    return this.start(options);
  }

  parseProxyLink(link) {
    try {
      const value = link.trim();
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
          server: json.add,
          port: parseInt(json.port, 10),
          uuid: json.id,
          security: json.scy || 'auto',
          alterId: parseInt(json.aid || 0, 10),
          transport: json.net === 'ws' ? 'ws' : (json.net === 'grpc' ? 'grpc' : 'tcp'),
          wsPath: json.path || '',
          wsHost: json.host || '',
          tls: json.tls === 'tls',
          sni: json.sni || json.host || '',
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

      const config = {
        id: nodeId,
        name,
        type: protocol,
        server: url.hostname,
        port: parseInt(url.port, 10)
      };

      if (Number.isNaN(config.port)) {
        config.port = (params.get('security') === 'tls' || params.get('tls') === '1') ? 443 : 80;
      }

      if (params.get('sni')) config.sni = params.get('sni');
      if (params.get('security')) config.security = params.get('security');
      if (['tls', '1', 'true'].includes(params.get('tls'))) config.tls = true;
      if (params.get('alpn')) config.alpn = params.get('alpn');
      if (params.get('type') === 'grpc' && !params.get('serviceName') && params.get('path')) {
        config.serviceName = params.get('path');
      }
      if (params.get('path')) config.wsPath = params.get('path');
      config.wsHost = params.get('host') || params.get('wsHost') || '';
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
      if (params.get('ip')) config.ip = params.get('ip');
      if (params.get('obfs-password')) config.obfs_password = params.get('obfs-password');
      if (params.get('obfs_password')) config.obfs_password = params.get('obfs_password');
      if (params.get('upmbps')) config.up_mbps = toInt(params.get('upmbps'));
      if (params.get('up')) config.up_mbps = toInt(params.get('up'), config.up_mbps);
      if (params.get('downmbps')) config.down_mbps = toInt(params.get('downmbps'));
      if (params.get('down')) config.down_mbps = toInt(params.get('down'), config.down_mbps);
      if (params.get('congestion_control')) config.congestion_control = params.get('congestion_control');
      if (params.get('udp_relay_mode')) config.udp_relay_mode = params.get('udp_relay_mode');
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
      if (['1', 'true'].includes(params.get('insecure')) || params.get('allowInsecure') === '1') config.insecure = true;

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
      } else if (protocol === 'hysteria2' || protocol === 'hy2') {
        config.type = 'hysteria2';
        config.password = rawUser || rawPass;
        config.obfs = params.get('obfs');
        config.tls = true;
        config.security = config.security || 'tls';
        if (!config.sni) {
          config.sni = config.server;
        }
        if (!url.port) {
          config.port = 443;
        }
        if (params.get('obfs-password') || params.get('obfs_password')) {
          config.obfs_password = params.get('obfs-password') || params.get('obfs_password');
        }
      } else if (protocol === 'vless') {
        config.uuid = rawUser || rawPass;
      } else if (protocol === 'trojan') {
        config.password = rawUser;
        config.tls = true;
        config.security = config.security || 'tls';
        if (!config.sni) {
          config.sni = config.server;
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
          } catch (error) {
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
      this.log.error(`[ProxyService] Link parse error: ${error.message}`);
      return null;
    }
  }

  async syncSubscription(url) {
    const response = await axios.get(url);
    let content = response.data;

    try {
      content = Buffer.from(content, 'base64').toString('utf-8');
    } catch (error) {
      this.log.warn?.(`[ProxyService] Subscription content is not base64: ${error.message}`);
    }

    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => this.parseProxyLink(line.trim()))
      .filter(Boolean);
  }

  async testNode(nodeId) {
    const localPort = this.getLocalPort(nodeId);
    if (!localPort) {
      throw new Error('Node not active in bridge');
    }

    const startTime = Date.now();
    const agent = new SocksProxyAgent(`socks5h://${this.proxyListen}:${localPort}`);
    await axios.get('http://cp.cloudflare.com/generate_204', {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: 15000,
      proxy: false
    });

    return Date.now() - startTime;
  }
}
