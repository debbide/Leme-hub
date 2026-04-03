import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ProxyService } from '../app/proxy/ProxyService.js';
import axios from 'axios';

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'local-proxy-client-'));

test.afterEach(() => {
  delete axios.get;
});

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

test('generates unified system proxy inbounds for rule routing mode', () => {
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
  assert.equal(config.route.final, 'direct');
  assert.equal(config.experimental.clash_api.external_controller, '127.0.0.1:9095');
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.inbound) && rule.inbound.includes('system-socks') && rule.outbound === 'out-n1'), true);
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
  assert.equal(config.route.final, 'direct');
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.inbound) && rule.inbound.includes('system-socks') && rule.outbound === 'out-n1'), true);
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
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.rule_set) && rule.rule_set.includes('geosite-cn')), false);
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

test('uses manual rules for system proxy routing in rule mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    customRules: [
      { type: 'domain_suffix', value: 'internal.example', action: 'direct' },
      { type: 'domain_keyword', value: 'stream', action: 'default' }
    ]
  });

  assert.equal(config.route.rules.some((rule) => rule.rule_set === 'usr-rule-1' && rule.outbound === 'direct'), true);
  assert.equal(config.route.rules.some((rule) => rule.rule_set === 'usr-rule-2' && rule.outbound === 'out-n1'), true);
  assert.equal(config.route.final, 'direct');
  assert.equal(config.log.level, 'debug');
  assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag.startsWith('usr-rule-')), true);
  assert.equal(config.route.rules.some((rule) => rule.rule_set && String(rule.rule_set).startsWith('usr-rule-')), true);
});

test('reports active routing observability labels for rule mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const lines = service.getRoutingObservabilityLines({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    customRules: [
      { type: 'domain_suffix', value: 'corp.local', action: 'direct', note: 'office' }
    ]
  });

  assert.equal(lines[0], '[Routing] rule routing active: 1 manual rule(s), active outbound out-n1');
  assert.equal(lines.some((line) => line.includes('domain_suffix=corp.local -> direct (office)')), true);
  assert.equal(lines.some((line) => line.includes('unmatched system traffic -> out-n1')), true);
});

test('reports inactive routing observability labels when mode is not rule', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const lines = service.getRoutingObservabilityLines({
    activeNodeId: 'n1',
    proxyMode: 'global',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    customRules: [
      { type: 'domain', value: 'example.com', action: 'default', note: '' }
    ]
  });

  assert.equal(lines[0], '[Routing] rule routing inactive: mode=global');
  assert.equal(lines.some((line) => line.includes('rule 1: domain=example.com -> default')), true);
});

test('uses specific node for manual system proxy rule when selected', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    { id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 },
    { id: 'n2', type: 'socks', server: '127.0.0.2', port: 1081 }
  ]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    customRules: [
      { id: 'rule-node', type: 'domain_suffix', value: 'youtube.com', action: 'node', nodeId: 'n2' }
    ]
  });

  assert.equal(config.route.rules.some((rule) => rule.rule_set === 'usr-rule-rule-node' && rule.outbound === 'out-n2'), true);
});

test('uses selected node from node group for manual system proxy rule', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    { id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 },
    { id: 'n2', type: 'socks', server: '127.0.0.2', port: 1081 }
  ]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    nodeGroups: [{ id: 'g1', name: 'JP Pool', nodeIds: ['n2'], selectedNodeId: 'n2' }],
    customRules: [
      { id: 'rule-group', type: 'domain_suffix', value: 'youtube.com', action: 'node_group', nodeGroupId: 'g1' }
    ]
  });

  assert.equal(config.route.rules.some((rule) => rule.rule_set === 'usr-rule-rule-group' && rule.outbound === 'out-n2'), true);
});

test('reports inactive routing observability labels when system proxy is disabled', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const lines = service.getRoutingObservabilityLines({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: false,
    customRules: []
  });

  assert.deepEqual(lines, [
    '[Routing] rule routing inactive: system proxy disabled',
    '[Routing] no manual rules configured',
    '[Routing] no rulesets configured'
  ]);
});

test('generates inline route rule sets mapped to target nodes in rule mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    { id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 },
    { id: 'n2', type: 'socks', server: '127.0.0.2', port: 1081 }
  ]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    rulesets: [
      { id: 'rs-ai', kind: 'builtin', presetId: 'ai-services', enabled: true, target: 'node', nodeId: 'n2' },
      { id: 'rs-work', kind: 'custom', enabled: true, target: 'direct', entries: [{ type: 'domain_suffix', value: 'corp.local' }] }
    ]
  });

  assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag === 'usr-rs-rs-ai'), true);
  assert.equal(config.route.rules.some((rule) => rule.rule_set === 'usr-rs-rs-ai' && rule.outbound === 'out-n2'), true);
  assert.equal(config.route.rules.some((rule) => rule.rule_set === 'usr-rs-rs-work' && rule.outbound === 'direct'), true);
});

test('resolves routing hits for builtin remote ruleset tags', () => {
  const tempDir = createTempDir();
  fs.mkdirSync(path.join(tempDir, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'rules', 'geosite-telegram.srs'), 'stub');
  fs.writeFileSync(path.join(tempDir, 'rules', 'geoip-telegram.srs'), 'stub');

  const service = new ProxyService({ configDir: tempDir, projectRoot: process.cwd() });
  service.setNodes([
    { id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 },
    { id: 'n2', type: 'socks', server: '127.0.0.2', port: 1081 }
  ]);

  service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    rulesets: [
      { id: 'rs-telegram', kind: 'builtin', presetId: 'telegram', enabled: true, target: 'node', nodeId: 'n2' }
    ]
  });

  const hit = service.resolveRoutingHit('geosite-telegram', 'telegram.org', 'out-n2', { allowHeuristic: false });
  assert.equal(hit?.kind, 'ruleset');
  assert.equal(hit?.rulesetPresetId, 'telegram');
  assert.equal(hit?.matchedTag, 'geosite-telegram');
});

test('uses remote ruleset files with case-insensitive lookup on Windows-style directories', () => {
  const tempDir = createTempDir();
  fs.mkdirSync(path.join(tempDir, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'rules', 'GeoSite-Telegram.srs'), 'stub');
  fs.writeFileSync(path.join(tempDir, 'rules', 'GeoIP-Telegram.srs'), 'stub');

  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });

  try {
    const service = new ProxyService({ configDir: tempDir, projectRoot: process.cwd() });
    service.setNodes([
      { id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 },
      { id: 'n2', type: 'socks', server: '127.0.0.2', port: 1081 }
    ]);

    const config = service.generateConfig({
      activeNodeId: 'n1',
      proxyMode: 'rule',
      systemProxyEnabled: true,
      systemProxyHttpPort: 20101,
      systemProxySocksPort: 20100,
      rulesets: [
        { id: 'rs-telegram', kind: 'builtin', presetId: 'telegram', enabled: true, target: 'node', nodeId: 'n2' }
      ]
    });

    assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag === 'geosite-telegram'), true);
    assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag === 'geoip-telegram'), true);
    assert.equal(config.route.rules.some((rule) => Array.isArray(rule.rule_set) && rule.rule_set.includes('geosite-telegram') && rule.outbound === 'out-n2'), true);
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});

test('rule mode adds built-in cn direct database rules when files exist', () => {
  const tempDir = createTempDir();
  fs.mkdirSync(path.join(tempDir, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'rules', 'geosite-cn.srs'), 'stub');
  fs.writeFileSync(path.join(tempDir, 'rules', 'geoip-cn.srs'), 'stub');

  const service = new ProxyService({ configDir: tempDir, projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag === 'geosite-cn' && ruleset.type === 'local'), true);
  assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag === 'geoip-cn' && ruleset.type === 'local'), true);
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.rule_set) && rule.rule_set.includes('geosite-cn') && rule.outbound === 'direct'), true);
});

test('rule mode skips built-in cn direct database rules when files are missing', () => {
  const tempDir = createTempDir();
  const service = new ProxyService({ configDir: tempDir, projectRoot: process.cwd() });
  service.setNodes([{ id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 }]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100
  });

  assert.equal(config.route.rule_set.some((ruleset) => ruleset.tag === 'geosite-cn'), false);
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.rule_set) && rule.rule_set.includes('geosite-cn')), false);
});

test('keeps per-node socks inbounds isolated from system ruleset routing in rule mode', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  service.setNodes([
    { id: 'n1', type: 'socks', server: '127.0.0.1', port: 1080 },
    { id: 'n2', type: 'socks', server: '127.0.0.2', port: 1081 }
  ]);

  const config = service.generateConfig({
    activeNodeId: 'n1',
    proxyMode: 'rule',
    systemProxyEnabled: true,
    systemProxyHttpPort: 20101,
    systemProxySocksPort: 20100,
    rulesets: [
      { id: 'rs-youtube', kind: 'builtin', presetId: 'youtube', enabled: true, target: 'node', nodeId: 'n2' }
    ]
  });

  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.inbound) && rule.inbound.includes('in-n1') && rule.rule_set), false);
  assert.equal(config.route.rules.some((rule) => Array.isArray(rule.inbound) && rule.inbound.includes('system-socks') && rule.rule_set === 'usr-rs-rs-youtube' && rule.outbound === 'out-n2'), true);
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

test('toShareLink serializes vless nodes', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const link = service.toShareLink({
    type: 'vless',
    server: 'example.com',
    port: 443,
    uuid: '0478303c-d7d2-4156-afba-1ab7e14c47fd',
    transport: 'ws',
    wsHost: 'cdn.example',
    wsPath: '/ws',
    security: 'tls',
    sni: 'cdn.example',
    name: 'edge'
  });

  assert.equal(link, 'vless://0478303c-d7d2-4156-afba-1ab7e14c47fd@example.com:443?encryption=none&security=tls&type=ws&host=cdn.example&path=%2Fws&sni=cdn.example#edge');
});

test('toShareLink serializes shadowsocks nodes with plugin options', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const link = service.toShareLink({
    type: 'shadowsocks',
    server: 'ss.example',
    port: 8388,
    method: 'aes-256-gcm',
    password: 'secret',
    plugin: 'v2ray-plugin',
    plugin_opts: 'mode=websocket;host=cdn.example;path=/ws',
    name: 'ss edge'
  });

  assert.equal(link, 'ss://YWVzLTI1Ni1nY206c2VjcmV0@ss.example:8388?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.example%3Bpath%3D%2Fws#ss%20edge');
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

test('parses percent-encoded manual proxy links', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const encoded = encodeURIComponent('vless://0478303c-d7d2-4156-afba-1ab7e14c47fd@example.com:443?type=ws&host=cdn.example&path=%2Fws&sni=cdn.example#edge');
  const node = service.parseProxyLink(encoded);

  assert.equal(node.type, 'vless');
  assert.equal(node.server, 'example.com');
  assert.equal(node.port, 443);
  assert.equal(node.transport, 'ws');
  assert.equal(node.wsPath, '/ws');
  assert.equal(node.sni, 'cdn.example');
  assert.equal(node.name, 'edge');
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

test('syncSubscription parses plain text uri lists without base64 decoding', async () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  axios.get = async () => ({
    data: 'vless://0478303c-d7d2-4156-afba-1ab7e14c47fd@example.com:443?type=ws&host=cdn.example&path=%2Fws#edge\n\ninvalid-line\nss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388#ss'
  });

  const nodes = await service.syncSubscription('https://example.com/sub');

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].type, 'vless');
  assert.equal(nodes[1].type, 'shadowsocks');
});

test('syncSubscription decodes base64 payloads containing uri lines', async () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const payload = Buffer.from('trojan://secret@example.com#trojan\nss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388#ss').toString('base64');
  axios.get = async () => ({ data: payload });

  const nodes = await service.syncSubscription('https://example.com/sub');

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].type, 'trojan');
  assert.equal(nodes[1].type, 'shadowsocks');
});

test('normalizeManualImportContent decodes base64 payloads containing uri lines', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const payload = Buffer.from('trojan://secret@example.com#trojan\nss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388#ss').toString('base64');

  const normalized = service.normalizeManualImportContent(payload);
  const nodes = service.parseProxyLinks(normalized);

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].type, 'trojan');
  assert.equal(nodes[1].type, 'shadowsocks');
});

test('normalizeManualImportContent leaves raw proxy links unchanged', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const raw = 'trojan://secret@example.com#trojan';

  assert.equal(service.normalizeManualImportContent(raw), raw);
});

test('syncSubscription imports sing-box style json outbounds', async () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  axios.get = async () => ({
    data: JSON.stringify({
      outbounds: [
        { type: 'selector', tag: 'auto', outbounds: ['proxy-1'] },
        {
          type: 'vless',
          tag: 'proxy-1',
          server: 'edge.example',
          server_port: 443,
          uuid: '0478303c-d7d2-4156-afba-1ab7e14c47fd',
          flow: 'xtls-rprx-vision',
          tls: {
            enabled: true,
            server_name: 'edge.example',
            insecure: false,
            alpn: ['h2', 'http/1.1'],
            reality: {
              public_key: 'pub-key',
              short_id: 'abcd'
            }
          },
          transport: {
            type: 'grpc',
            service_name: 'svc'
          }
        }
      ]
    })
  });

  const nodes = await service.syncSubscription('https://example.com/sub');

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'vless');
  assert.equal(nodes[0].server, 'edge.example');
  assert.equal(nodes[0].port, 443);
  assert.equal(nodes[0].serviceName, 'svc');
  assert.equal(nodes[0].pbk, 'pub-key');
});

test('syncSubscription sends user agent and basic auth headers', async () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  let capturedOptions = null;
  axios.get = async (_url, options) => {
    capturedOptions = options;
    return { data: '' };
  };

  await service.syncSubscription('https://demo:secret@example.com/sub');

  assert.equal(capturedOptions.headers['User-Agent'], 'Leme-Hub/0.1');
  assert.equal(capturedOptions.headers.Authorization, `Basic ${Buffer.from('demo:secret').toString('base64')}`);
});

test('syncSubscription reports http status failures clearly', async () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  axios.get = async () => {
    const error = new Error('Request failed with status code 403');
    error.response = { status: 403 };
    throw error;
  };

  await assert.rejects(() => service.syncSubscription('https://example.com/sub'), /Failed to download subscription: HTTP 403/);
});

test('parseProxyLinks splits multi-line share links into separate nodes', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });

  const nodes = service.parseProxyLinks([
    'trojan://secret@example.com#trojan',
    'vless://0478303c-d7d2-4156-afba-1ab7e14c47fd@example.com:443?type=ws&host=cdn.example&path=%2Fws#edge',
    'invalid-line',
    'ss://YWVzLTI1Ni1nY206c2VjcmV0@example.com:8388#ss'
  ].join('\n'));

  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes.map((node) => node.type), ['trojan', 'vless', 'shadowsocks']);
});

test('parseProxyLinks accepts newline-separated encoded manual links', () => {
  const service = new ProxyService({ configDir: createTempDir(), projectRoot: process.cwd() });
  const encoded = encodeURIComponent('vless://0478303c-d7d2-4156-afba-1ab7e14c47fd@example.com:443?type=ws&host=cdn.example&path=%2Fws#edge');

  const nodes = service.parseProxyLinks([
    encoded,
    'trojan://secret@example.com#trojan'
  ].join('\n'));

  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map((node) => node.type), ['vless', 'trojan']);
  assert.equal(nodes[0].wsPath, '/ws');
});
