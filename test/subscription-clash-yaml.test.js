import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeClashProxy,
  parseClashYamlSubscription,
  parseStructuredSubscription
} from '../app/proxy/subscriptions.js';

const CLASH_YAML = `
mixed-port: 7890
proxies:
  - name: 'HK ss'
    type: ss
    server: ss.example.com
    port: 8388
    cipher: aes-256-gcm
    password: secret123
  - name: 'JP vless'
    type: vless
    server: vless.example.com
    port: 443
    uuid: 11111111-2222-4333-8444-555555555555
    tls: true
    servername: vless.example.com
    network: ws
    ws-opts:
      path: /ws-path
      headers:
        Host: vless.example.com
  - name: 'TW trojan'
    type: trojan
    server: trojan.example.com
    port: 443
    password: trojanpass
    sni: trojan.example.com
  - name: 'pick one'
    type: selector
    proxies: ['HK ss']
`;

test('parseStructuredSubscription handles Clash YAML', () => {
  const nodes = parseStructuredSubscription(CLASH_YAML, {});
  assert.equal(nodes.length, 3);

  const [ss, vless, trojan] = nodes;
  assert.equal(ss.name, 'HK ss');
  assert.equal(ss.type, 'ss');
  assert.equal(ss.method, 'aes-256-gcm');
  assert.equal(ss.password, 'secret123');

  assert.equal(vless.type, 'vless');
  assert.equal(vless.uuid, '11111111-2222-4333-8444-555555555555');
  assert.equal(vless.tls, true);
  assert.equal(vless.sni, 'vless.example.com');
  assert.equal(vless.transport, 'ws');
  assert.equal(vless.wsPath, '/ws-path');
  assert.equal(vless.wsHost, 'vless.example.com');

  assert.equal(trojan.type, 'trojan');
  assert.equal(trojan.password, 'trojanpass');

  for (const node of nodes) {
    assert.match(node.id, /^[0-9a-f-]{36}$/, 'ids are randomUUIDs');
  }
});

test('normalizeClashProxy maps hysteria2 fields', () => {
  const node = normalizeClashProxy({
    name: 'hy2',
    type: 'hysteria2',
    server: 'hy2.example.com',
    port: 443,
    password: 'hy2pass',
    obfs: 'salamander',
    'obfs-password': 'obfspass',
    up: 50,
    down: 200,
    sni: 'hy2.example.com'
  });
  assert.equal(node.type, 'hysteria2');
  assert.equal(node.password, 'hy2pass');
  assert.equal(node.obfs, 'salamander');
  assert.equal(node.obfs_password, 'obfspass');
  assert.equal(node.up_mbps, 50);
  assert.equal(node.down_mbps, 200);
});

test('normalizeClashProxy maps tuic fields', () => {
  const node = normalizeClashProxy({
    name: 'tuic',
    type: 'tuic',
    server: 'tuic.example.com',
    port: 443,
    uuid: '11111111-2222-4333-8444-555555555555',
    password: 'tuicpass',
    'congestion-controller': 'bbr',
    'udp-relay-mode': 'quic',
    sni: 'tuic.example.com',
    alpn: ['h3']
  });
  assert.equal(node.type, 'tuic');
  assert.equal(node.uuid, '11111111-2222-4333-8444-555555555555');
  assert.equal(node.congestion_control, 'bbr');
  assert.equal(node.udp_relay_mode, 'quic');
});

test('parseClashYamlSubscription rejects oversized input', () => {
  const big = 'proxies:\n' + '  - name: x\n'.repeat(300000);
  assert.deepEqual(parseClashYamlSubscription(big, {}), []);
});

test('parseClashYamlSubscription returns [] for invalid yaml', () => {
  const warnings = [];
  const result = parseClashYamlSubscription('proxies:\n  - name: [unclosed', {
    log: { warn: (m) => warnings.push(m) }
  });
  assert.deepEqual(result, []);
  assert.ok(warnings.length > 0);
});
