import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConnectionDetailHtml } from '../public/lib/connections-controller.js';

const fullConnection = () => ({
  id: 'conn-1',
  host: 'www.youtube.com',
  destinationPort: 443,
  network: 'tcp',
  type: 'http',
  process: 'chrome.exe',
  sourceIP: '192.168.1.10',
  sourcePort: 51234,
  chains: ['selector-active'],
  resolvedChains: ['selector-active', 'HK-01'],
  exitNode: 'HK-01',
  rule: 'DomainSuffix',
  rulePayload: 'youtube.com',
  uploadBytes: 1024,
  downloadBytes: 2048,
  startedAt: new Date(Date.now() - 65000).toISOString()
});

test('buildConnectionDetailHtml renders every detail field', () => {
  const html = buildConnectionDetailHtml(fullConnection());
  for (const expected of [
    'www.youtube.com:443',
    'HK-01',
    'selector-active → HK-01',
    'chrome.exe',
    '192.168.1.10:51234',
    'tcp / http',
    'DomainSuffix youtube.com',
    'conn-1'
  ]) {
    assert.ok(html.includes(expected), `detail html should include: ${expected}`);
  }
  assert.ok(html.includes('已持续'), 'detail html should include a duration row');
});

test('buildConnectionDetailHtml escapes hostile input', () => {
  const html = buildConnectionDetailHtml({
    ...fullConnection(),
    host: '<script>alert(1)</script>',
    process: '<img src=x onerror=alert(1)>'
  });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'host must be escaped');
  assert.ok(!html.includes('<img src=x'), 'process must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped host should be present');
});

test('buildConnectionDetailHtml falls back to raw chains without resolvedChains', () => {
  const connection = fullConnection();
  delete connection.resolvedChains;
  delete connection.exitNode;
  const html = buildConnectionDetailHtml(connection);
  assert.ok(html.includes('selector-active'), 'should show the raw chain');
});

test('buildConnectionDetailHtml handles a connection that already ended', () => {
  for (const missing of [null, undefined]) {
    const html = buildConnectionDetailHtml(missing);
    assert.ok(html.includes('该连接已结束'), 'should note the connection ended');
  }
});

test('buildConnectionDetailHtml tolerates sparse connections', () => {
  const html = buildConnectionDetailHtml({ id: 'x' });
  assert.ok(html.includes('--'), 'missing fields should render as --');
});

test('buildConnectionDetailHtml shows node name with raw tag', () => {
  const html = buildConnectionDetailHtml({
    ...fullConnection(),
    exitNode: 'HK-01',
    exitNodeTag: 'out-635416e'
  });
  assert.ok(html.includes('HK-01 (out-635416e)'), 'should show name plus raw tag');
});

test('buildConnectionDetailHtml shows plain exit node without a tag', () => {
  const html = buildConnectionDetailHtml({ ...fullConnection(), exitNodeTag: null });
  assert.ok(html.includes('HK-01'), 'should show the exit node');
  assert.ok(!html.includes('(out-'), 'should not append a tag');
});
