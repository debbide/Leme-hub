import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ProxyService } from '../app/proxy/ProxyService.js';

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'local-proxy-client-'));

test('uses isolated config directory', () => {
  const tempDir = createTempDir();
  const service = new ProxyService({ configDir: tempDir, projectRoot: process.cwd() });

  assert.equal(service.configPath, path.join(tempDir, 'singbox_config.json'));
});

test('generates socks config for valid node', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig();

  assert.equal(config.inbounds[0].listen, '127.0.0.1');
  assert.equal(config.inbounds[0].listen_port, 20000);
  assert.equal(config.outbounds[0].tag, 'out-n1');
  assert.equal(config.route.rules[0].action, 'sniff');
  assert.equal(config.route.final, 'direct');
});

test('generates vless config with default xudp encoding', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'vless', server: '127.0.0.1', port: 1080, uuid: '00000000-0000-0000-0000-000000000000' }]);
  const config = service.generateConfig();
  assert.equal(config.outbounds[0].packet_encoding, 'xudp');
});

test('generates vmess config with default packetaddr encoding', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'vmess', server: '127.0.0.1', port: 1080, uuid: '00000000-0000-0000-0000-000000000000' }]);
  const config = service.generateConfig();
  assert.equal(config.outbounds[0].packet_encoding, 'packetaddr');
});

test('generates unified system proxy inbounds for active node mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(config.inbounds.some((inbound) => inbound.tag === 'system-socks' && inbound.listen_port === 20100), true);
  assert.equal(config.inbounds.some((inbound) => inbound.tag === 'system-http' && inbound.listen_port === 20101), true);
  assert.equal(config.route.final, 'out-n1');
});

test('keeps private traffic direct in rule mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(config.route.rules.some((rule) => rule.ip_is_private === true && rule.outbound === 'direct'), true);
  assert.equal(config.route.final, 'out-n1');
});

test('sends all traffic to active node in global mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'global',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(config.route.rules.some((rule) => rule.ip_is_private === true), false);
  assert.equal(config.route.final, 'out-n1');
});

test('forces system traffic direct in direct mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'direct',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(config.route.final, 'direct');
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.inbound) && rule.inbound.includes('system-socks') && rule.outbound === 'direct'), true);
});

test('uses custom rules for system proxy routing in custom mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'custom',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    customRules: [
      { type: 'domain_suffix', value: 'internal.example', action: 'direct' },
      { type: 'domain_keyword', value: 'stream', action: 'proxy' }
    ]
  });

  assert.equal(config.route.rules.some((rule) => rule.domain_suffix?.includes('internal.example') && rule.outbound === 'direct'), true);
  assert.equal(config.route.rules.some((rule) => rule.domain_keyword?.includes('stream') && rule.outbound === 'out-n1'), true);
  assert.equal(config.route.final, 'direct');
});

test('drops invalid vmess node during config generation', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'bad', type: 'vmess', server: 'example.com', port: 443, uuid: 'bad' }]);

  const config = service.generateConfig();

  assert.equal(config.inbounds.length, 0);
  assert.equal(config.outbounds.length, 1);
});

test('respects explicit local ports and avoids duplicates', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    { id: 'a', type: 'socks', server: '127.0.0.1', port: 1080, local_port: 21000 },
    { id: 'b', type: 'socks', server: '127.0.0.2', port: 1081, local_port: 21000 },
    { id: 'c', type: 'socks', server: '127.0.0.3', port: 1082 }
  ]);

  assert.equal(service.getLocalPort('a'), 21000);
  assert.equal(service.getLocalPort('b'), 20001);
  assert.equal(service.getLocalPort('c'), 20002);
});

test('parses socks link with credentials', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('socks://demo:secret@example.com:1080#edge');

  assert.equal(node.type, 'socks');
  assert.equal(node.username, 'demo');
  assert.equal(node.password, 'secret');
  assert.equal(node.server, 'example.com');
  assert.equal(node.port, 1080);
  assert.equal(node.name, 'edge');
});

test('parses hysteria2 bandwidth and obfs password fields', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('hy2://secret@example.com:443?obfs=salamander&obfs-password=mask&upmbps=20&downmbps=80&sni=edge.example#hy2');

  assert.equal(node.type, 'hysteria2');
  assert.equal(node.obfs, 'salamander');
  assert.equal(node.obfs_password, 'mask');
  assert.equal(node.up_mbps, 20);
  assert.equal(node.down_mbps, 80);
  assert.equal(node.sni, 'edge.example');
});

test('parses tuic extended parameters', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('tuic://user:pass@example.com:443?congestion_control=cubic&udp_relay_mode=native&heartbeat=10s&zero_rtt_handshake=1&sni=tuic.example#tuic');

  assert.equal(node.type, 'tuic');
  assert.equal(node.congestion_control, 'cubic');
  assert.equal(node.udp_relay_mode, 'native');
  assert.equal(node.heartbeat, '10s');
  assert.equal(node.zero_rtt_handshake, true);
});

test('keeps dial network separate from transport type', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('vless://0478303c-d7d2-4156-afba-1ab7e14c47fd@example.com:443?type=ws&network=udp&host=cdn.example&path=%2Fws&sni=cdn.example#edge');

  assert.equal(node.transport, 'ws');
  assert.equal(node.network, 'udp');
});

test('parses shadowsocks plugin string into plugin options', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('ss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.example%3Bpath%3D%2Fws#ss');

  assert.equal(node.type, 'shadowsocks');
  assert.equal(node.plugin, 'v2ray-plugin');
  assert.equal(node.plugin_opts, 'mode=websocket;host=cdn.example;path=/ws');
});

test('defaults trojan links to tls and port 443', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('trojan://secret@example.com#trojan');

  assert.equal(node.type, 'trojan');
  assert.equal(node.tls, true);
  assert.equal(node.security, 'tls');
  assert.equal(node.sni, 'example.com');
  assert.equal(node.port, 443);
});

test('defaults hysteria2 links to tls and port 443', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('hy2://secret@example.com?obfs=salamander#hy2');

  assert.equal(node.type, 'hysteria2');
  assert.equal(node.tls, true);
  assert.equal(node.security, 'tls');
  assert.equal(node.sni, 'example.com');
  assert.equal(node.port, 443);
});

test('emits advanced transport and tls fields in generated config', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ 
    id: 'n1',
    type: 'vless',
    server: 'edge.example',
    port: 443,
    uuid: '0478303c-d7d2-4156-afba-1ab7e14c47fd',
    security: 'reality',
    sni: 'edge.example',
    pbk: 'public-key',
    sid: 'abcd',
    reality_next_protocol: 'h2,http/1.1',
    transport: 'grpc',
    serviceName: 'svc',
    grpc_idle_timeout: 15,
    grpc_ping_timeout: 5,
    grpc_permit_without_stream: true,
    tls_min_version: '1.2',
    tls_max_version: '1.3',
    tls_cipher_suites: 'TLS_AES_128_GCM_SHA256,TLS_AES_256_GCM_SHA384',
    packet_encoding: 'packetaddr'
  }]);

  const config = service.generateConfig();
  const outbound = config.outbounds[0];

  assert.equal(outbound.packet_encoding, 'packetaddr');
  assert.equal(outbound.transport.type, 'grpc');
  assert.equal(outbound.transport.service_name, 'svc');
  assert.equal(outbound.transport.idle_timeout, '15s');
  assert.equal(outbound.transport.ping_timeout, '5s');
  assert.equal(outbound.transport.permit_without_stream, true);
  assert.equal(outbound.tls.min_version, '1.2');
  assert.equal(outbound.tls.max_version, '1.3');
  assert.deepEqual(outbound.tls.cipher_suites, ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384']);
  assert.deepEqual(outbound.tls.reality.next_protocol, ['h2', 'http/1.1']);
});

test('emits certificate pinning and shadowsocks plugin fields', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    {
      id: 'tls',
      type: 'trojan',
      server: 'trojan.example',
      port: 443,
      password: 'secret',
      security: 'tls',
      sni: 'trojan.example',
      certificate_public_key_sha256: 'sha256a,sha256b'
    },
    {
      id: 'ss',
      type: 'shadowsocks',
      server: 'ss.example',
      port: 8388,
      method: 'aes-256-gcm',
      password: 'secret',
      plugin: 'v2ray-plugin',
      plugin_opts: 'mode=websocket;host=cdn.example;path=/ws'
    }
  ]);

  const config = service.generateConfig();
  const trojan = config.outbounds.find((outbound) => outbound.tag === 'out-tls');
  const shadowsocks = config.outbounds.find((outbound) => outbound.tag === 'out-ss');

  assert.deepEqual(trojan.tls.certificate_public_key_sha256, ['sha256a', 'sha256b']);
  assert.equal(shadowsocks.plugin, 'v2ray-plugin');
  assert.equal(shadowsocks.plugin_opts, 'mode=websocket;host=cdn.example;path=/ws');
});

test('emits hysteria2 and tuic advanced outbound fields', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    {
      id: 'hy2',
      type: 'hysteria2',
      server: 'hy2.example',
      port: 443,
      password: 'secret',
      sni: 'hy2.example',
      obfs: 'salamander',
      obfs_password: 'mask',
      up_mbps: 10,
      down_mbps: 50,
      security: 'tls'
    },
    {
      id: 'tuic',
      type: 'tuic',
      server: 'tuic.example',
      port: 443,
      uuid: '0478303c-d7d2-4156-afba-1ab7e14c47fd',
      password: 'secret',
      sni: 'tuic.example',
      congestion_control: 'cubic',
      udp_relay_mode: 'native',
      heartbeat: '10s',
      zero_rtt_handshake: true,
      security: 'tls'
    }
  ]);

  const config = service.generateConfig();
  const hy2 = config.outbounds.find((outbound) => outbound.tag === 'out-hy2');
  const tuic = config.outbounds.find((outbound) => outbound.tag === 'out-tuic');

  assert.equal(hy2.obfs.password, 'mask');
  assert.equal(hy2.up_mbps, 10);
  assert.equal(hy2.down_mbps, 50);
  assert.equal(tuic.congestion_control, 'cubic');
  assert.equal(tuic.udp_relay_mode, 'native');
  assert.equal(tuic.heartbeat, '10s');
  assert.equal(tuic.zero_rtt_handshake, true);
});

test('emits tls block for plain trojan links after protocol defaults', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const node = service.parseProxyLink('trojan://secret@example.com#trojan');
  service.setNodes([{ id: node.id, ...node }]);

  const config = service.generateConfig();
  const outbound = config.outbounds[0];

  assert.equal(outbound.type, 'trojan');
  assert.equal(outbound.server_port, 443);
  assert.equal(outbound.tls.enabled, true);
  assert.equal(outbound.tls.server_name, 'example.com');
});
