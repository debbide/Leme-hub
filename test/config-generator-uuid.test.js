import test from 'node:test';
import assert from 'node:assert/strict';

import { maskUuid, generateProxyConfig } from '../app/proxy/config-generator.js';

test('maskUuid never reveals the full credential', () => {
  const uuid = '11111111-2222-4333-8444-555555555555';
  const masked = maskUuid(uuid);
  assert.ok(!masked.includes(uuid), 'masked form must not contain the full uuid');
  assert.ok(masked.startsWith('1111'), 'keeps a short prefix for debugging');
  assert.ok(masked.endsWith('5555'), 'keeps a short suffix for debugging');
  assert.equal(maskUuid('short'), '****');
  assert.equal(maskUuid(''), '****');
  assert.equal(maskUuid(null), '****');
});

test('invalid uuid is masked in the skip log, not printed in full', () => {
  const secret = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const errors = [];
  const context = {
    nodes: [
      { id: 'n1', name: 'leaky-node', type: 'vless', uuid: `not-a-uuid-${secret}`, server: 'example.com', server_port: 443 }
    ],
    log: {
      error: (msg) => errors.push(String(msg)),
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    resolveDefaultNodeId: () => null
  };

  // filterValidNodes runs before the rest of config generation; the paths it
  // needs later are irrelevant to the log assertion, so tolerate that failure.
  try {
    generateProxyConfig(context, {});
  } catch {
    // ignore: only the skip log matters here
  }

  assert.ok(errors.length > 0, 'expected a skip log for the invalid node');
  for (const line of errors) {
    assert.ok(!line.includes(secret), `log must not contain the raw uuid: ${line}`);
  }
  assert.ok(errors.some((line) => line.includes('invalid uuid')), 'expected the invalid-uuid skip message');
});
