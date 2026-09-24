import test from 'node:test';
import assert from 'node:assert/strict';

import { parseProxyLink, parseProxyLinks, parseVmessJsonLink } from '../app/proxy/link-parser.js';
import { nodeUsesTls } from '../app/proxy/protocol-common.js';

const vmessJson = (overrides = {}) => 'vmess://' + Buffer.from(JSON.stringify({
  ps: 'vmess-test',
  add: 'example.com',
  port: '443',
  id: '11111111-2222-4333-8444-555555555555',
  aid: '0',
  net: 'ws',
  tls: 'tls',
  ...overrides
})).toString('base64');

test('parseVmessJsonLink parses vmess JSON links', () => {
  const node = parseVmessJsonLink(vmessJson());
  assert.equal(node.type, 'vmess');
  assert.equal(node.name, 'vmess-test');
  assert.equal(node.server, 'example.com');
  assert.equal(node.port, 443);
  assert.equal(node.uuid, '11111111-2222-4333-8444-555555555555');
  assert.equal(node.tls, true);
  assert.equal(node.transport, 'ws');
});

test('parseProxyLink dispatches vmess:// JSON to parseVmessJsonLink', () => {
  const node = parseProxyLink(vmessJson({ ps: 'via-dispatch' }));
  assert.equal(node.type, 'vmess');
  assert.equal(node.name, 'via-dispatch');
});

test('parses vless with tls and sni', () => {
  const node = parseProxyLink('vless://11111111-2222-4333-8444-555555555555@example.com:443?security=tls&sni=example.com#VLESS');
  assert.equal(node.type, 'vless');
  assert.equal(node.uuid, '11111111-2222-4333-8444-555555555555');
  assert.equal(node.security, 'tls');
  assert.equal(node.sni, 'example.com');
  assert.equal(node.name, 'VLESS');
  // nodeUsesTls treats security=tls as TLS for non-vmess types
  assert.equal(nodeUsesTls(node), true);
});

test('parses trojan with default tls', () => {
  const node = parseProxyLink('trojan://secret@example.com#Trojan');
  assert.equal(node.type, 'trojan');
  assert.equal(node.password, 'secret');
  assert.equal(node.tls, true);
  assert.equal(node.port, 443);
});

test('parses trojan with explicitly disabled tls', () => {
  const node = parseProxyLink('trojan://secret@example.com:80?security=none#Trojan');
  assert.equal(node.tls, undefined);
  assert.equal(node.port, 80);
});

test('parses ss with base64 userinfo', () => {
  const node = parseProxyLink('ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@example.com:8388#SS');
  assert.equal(node.type, 'shadowsocks');
  assert.equal(node.method, 'aes-256-gcm');
  assert.equal(node.password, 'password');
  assert.equal(node.port, 8388);
});

test('parses tuic with uuid:password userinfo', () => {
  const node = parseProxyLink('tuic://myuuid:mypass@example.com:443?sni=example.com#TUIC');
  assert.equal(node.type, 'tuic');
  assert.equal(node.uuid, 'myuuid');
  assert.equal(node.password, 'mypass');
  assert.equal(node.tls, true);
  assert.equal(node.alpn, 'h3');
});

test('parses hysteria2 with obfs', () => {
  const node = parseProxyLink('hysteria2://pass@example.com:443?obfs=salamander&obfs-password=obfs#HY2');
  assert.equal(node.type, 'hysteria2');
  assert.equal(node.password, 'pass');
  assert.equal(node.obfs, 'salamander');
  assert.equal(node.obfs_password, 'obfs');
  assert.equal(node.tls, true);
});

test('parses anytls', () => {
  const node = parseProxyLink('anytls://pass@example.com:443#AnyTLS');
  assert.equal(node.type, 'anytls');
  assert.equal(node.password, 'pass');
  assert.equal(node.tls, true);
  assert.equal(node.security, 'tls');
});

test('parses socks5 with credentials', () => {
  const node = parseProxyLink('socks5://user:pass@127.0.0.1:1080#SOCKS');
  assert.equal(node.type, 'socks');
  assert.equal(node.username, 'user');
  assert.equal(node.password, 'pass');
});

test('returns null for unknown protocols', () => {
  assert.equal(parseProxyLink('unknown://foo@bar:123'), null);
});

test('returns null for garbage input', () => {
  assert.equal(parseProxyLink('not a link at all'), null);
  assert.equal(parseProxyLink(''), null);
  assert.equal(parseProxyLink(null), null);
});

test('parseProxyLinks splits and filters multiple links', () => {
  const nodes = parseProxyLinks(
    'vless://11111111-2222-4333-8444-555555555555@example.com:443#A\n' +
    'garbage line\n' +
    'trojan://secret@example.com:443#B'
  );
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].type, 'vless');
  assert.equal(nodes[1].type, 'trojan');
});

test('generates unique ids per parse', () => {
  const a = parseProxyLink('trojan://secret@example.com:443');
  const b = parseProxyLink('trojan://secret@example.com:443');
  assert.notEqual(a.id, b.id);
});
