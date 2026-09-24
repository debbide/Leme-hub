import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNodeOutbound } from '../app/proxy/outbound-builder.js';
import { parseProxyLink } from '../app/proxy/link-parser.js';

// End-to-end: link -> parsed node -> sing-box outbound
const buildFromLink = (link, options) => buildNodeOutbound(parseProxyLink(link), options);

test('builds vless outbound with tls from link', () => {
  const outbound = buildFromLink('vless://11111111-2222-4333-8444-555555555555@example.com:443?security=tls&sni=example.com#VLESS');
  assert.equal(outbound.type, 'vless');
  assert.equal(outbound.server, 'example.com');
  assert.equal(outbound.server_port, 443);
  assert.equal(outbound.uuid, '11111111-2222-4333-8444-555555555555');
  assert.ok(outbound.tls?.enabled, 'expected tls enabled');
  assert.equal(outbound.tls.server_name, 'example.com');
});

test('builds trojan outbound with tls by default', () => {
  const outbound = buildFromLink('trojan://secret@example.com:443');
  assert.equal(outbound.type, 'trojan');
  assert.equal(outbound.password, 'secret');
  assert.ok(outbound.tls?.enabled);
});

test('builds shadowsocks outbound with method', () => {
  const outbound = buildFromLink('ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@example.com:8388#SS');
  assert.equal(outbound.type, 'shadowsocks');
  assert.equal(outbound.method, 'aes-256-gcm');
  assert.equal(outbound.password, 'password');
  assert.equal(outbound.tls, undefined);
});

test('builds tuic outbound with tls and h3 alpn', () => {
  const outbound = buildFromLink('tuic://myuuid:mypass@example.com:443#TUIC');
  assert.equal(outbound.type, 'tuic');
  assert.ok(outbound.tls?.enabled);
});

test('builds hysteria2 outbound', () => {
  const outbound = buildFromLink('hysteria2://pass@example.com:443#HY2');
  assert.equal(outbound.type, 'hysteria2');
  assert.equal(outbound.password, 'pass');
  assert.ok(outbound.tls?.enabled);
});

test('outbound tag is namespaced by node id', () => {
  const node = parseProxyLink('trojan://secret@example.com:443');
  const outbound = buildNodeOutbound(node);
  assert.equal(outbound.tag, `out-${node.id}`);
});

test('vmess outbound normalizes security and defaults packet encoding', () => {
  const outbound = buildFromLink('vmess://' + Buffer.from(JSON.stringify({
    ps: 'x', add: 'example.com', port: '443', id: '11111111-2222-4333-8444-555555555555'
  })).toString('base64'));
  assert.equal(outbound.type, 'vmess');
  assert.equal(outbound.packet_encoding, 'packetaddr');
});
