import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNodePayloadFromForm,
  createManualNodeFormState,
  extractAdvancedNodeFields,
  normalizeNodeForForm,
} from '../public/lib/node-form-schema.js';

test('creates manual draft defaults for vless nodes', () => {
  const draft = createManualNodeFormState('日本节点');

  assert.equal(draft.type, 'vless');
  assert.equal(draft.transport, 'tcp');
  assert.equal(draft.packet_encoding, 'xudp');
  assert.equal(draft.group, '日本节点');
});

test('normalizes existing tuic node into form state', () => {
  const formState = normalizeNodeForForm({
    type: 'tuic',
    name: 'FR',
    server: '31.59.234.78',
    port: 25011,
    uuid: '74ceeeb0-c2bc-4eab-8626-bc8aa779c82d',
    password: 'secret',
    sni: '31.59.234.78',
    insecure: true,
    congestion_control: 'bbr'
  });

  assert.equal(formState.type, 'tuic');
  assert.equal(formState.security, 'tls');
  assert.equal(formState.uuid, '74ceeeb0-c2bc-4eab-8626-bc8aa779c82d');
  assert.equal(formState.insecure, true);
  assert.equal(formState.alpn, 'h3');
  assert.equal(formState.congestion_control, 'bbr');
});

test('keeps vmess tls nodes editable without persisting invalid vmess security', () => {
  const formState = normalizeNodeForForm({
    type: 'vmess',
    name: 'VMess TLS',
    server: 'example.com',
    port: 443,
    uuid: '00000000-0000-0000-0000-000000000000',
    security: 'none',
    tls: true,
    transport: 'ws',
    wsPath: '/ws',
    wsHost: 'cdn.example.com',
    sni: 'edge.example.com'
  });

  assert.equal(formState.security, 'tls');

  const payload = buildNodePayloadFromForm({
    ...formState,
    name: 'VMess TLS Renamed'
  });

  assert.equal(payload.type, 'vmess');
  assert.equal(payload.name, 'VMess TLS Renamed');
  assert.equal(payload.security, 'none');
  assert.equal(payload.tls, true);
  assert.equal(payload.sni, 'edge.example.com');
});

test('keeps vless reality nodes editable even when legacy data omitted security flag', () => {
  const formState = normalizeNodeForForm({
    type: 'vless',
    name: 'VLESS Reality',
    server: 'reality.example',
    port: 443,
    uuid: '00000000-0000-0000-0000-000000000000',
    tls: true,
    pbk: 'pub-key',
    sid: 'abcd',
    sni: 'reality.example'
  });

  assert.equal(formState.security, 'reality');

  const payload = buildNodePayloadFromForm({
    ...formState,
    name: 'VLESS Reality Renamed'
  });

  assert.equal(payload.type, 'vless');
  assert.equal(payload.security, 'reality');
  assert.equal(payload.tls, true);
  assert.equal(payload.pbk, 'pub-key');
  assert.equal(payload.sid, 'abcd');
});

test('builds tuic payload with default h3 alpn when left blank', () => {
  const payload = buildNodePayloadFromForm({
    type: 'tuic',
    name: 'TUIC Node',
    server: 'tuic.example',
    port: '443',
    group: '',
    countryCodeOverride: '',
    security: 'tls',
    uuid: '00000000-0000-0000-0000-000000000000',
    password: 'secret',
    sni: '',
    insecure: true,
    alpn: '',
    congestion_control: 'bbr',
    udp_relay_mode: 'quic-rfc'
  });

  assert.equal(payload.tls, true);
  assert.equal(payload.sni, 'tuic.example');
  assert.equal(payload.insecure, true);
  assert.equal(payload.alpn, 'h3');
});

test('extracts advanced fields without duplicating form-managed keys', () => {
  const advanced = extractAdvancedNodeFields({
    type: 'vless',
    server: 'example.com',
    port: 443,
    wsHost: 'cdn.example.com',
    headers: { Host: 'old.example.com', 'User-Agent': 'Leme' },
    grpc_idle_timeout: 10,
    record_fragment: true
  });

  assert.deepEqual(advanced, {
    headers: { Host: 'old.example.com', 'User-Agent': 'Leme' },
    grpc_idle_timeout: 10,
    record_fragment: true
  });
});

test('builds websocket vless payload and lets form host override advanced headers', () => {
  const payload = buildNodePayloadFromForm({
    type: 'vless',
    name: 'WS Node',
    server: 'example.com',
    port: '443',
    group: '',
    countryCodeOverride: '',
    security: 'tls',
    transport: 'ws',
    uuid: '00000000-0000-0000-0000-000000000000',
    packet_encoding: 'xudp',
    wsPath: '/ws',
    wsHost: 'cdn.example.com',
    max_early_data: '2048',
    early_data_header_name: 'Sec-WebSocket-Protocol',
    sni: 'edge.example.com',
    insecure: true,
    alpn: 'h2,h3',
    fp: 'chrome'
  }, {
    headers: { Host: 'old.example.com', 'User-Agent': 'Leme' },
    grpc_idle_timeout: 10
  });

  assert.equal(payload.type, 'vless');
  assert.equal(payload.transport, 'ws');
  assert.equal(payload.wsHost, 'cdn.example.com');
  assert.equal(payload.headers.Host, 'cdn.example.com');
  assert.equal(payload.headers['User-Agent'], 'Leme');
  assert.equal(payload.grpc_idle_timeout, undefined);
  assert.equal(payload.tls, true);
  assert.equal(payload.insecure, true);
});

test('drops stale websocket fields when switching node type', () => {
  const payload = buildNodePayloadFromForm({
    type: 'trojan',
    name: 'Trojan Node',
    server: 'trojan.example.com',
    port: '443',
    group: '',
    countryCodeOverride: '',
    security: 'tls',
    transport: 'tcp',
    password: 'secret',
    sni: 'trojan.example.com',
    insecure: false
  }, {
    headers: { Host: 'old.example.com' },
    wsPath: '/old',
    wsHost: 'old.example.com',
    grpc_idle_timeout: 10
  });

  assert.equal(payload.type, 'trojan');
  assert.equal(payload.transport, 'tcp');
  assert.equal(payload.password, 'secret');
  assert.equal('headers' in payload, false);
  assert.equal('wsPath' in payload, false);
  assert.equal('grpc_idle_timeout' in payload, false);
});
