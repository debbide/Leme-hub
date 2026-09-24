import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRouteConfig, CAPTURE_INBOUND_TAGS } from '../app/proxy/route-config.js';

const baseContext = {
  rulesDir: '/tmp/leme-hub-test-rules',
  validNodes: [{ id: 'node-1', name: 'JP', type: 'vless' }],
  inbounds: [{ tag: 'system-socks' }, { tag: 'system-http' }],
  customRules: [],
  rulesets: [],
  routingItems: [],
  nodeGroupMap: new Map(),
  systemDefaultOutbound: 'out-node-1',
  activeSelectorOutboundTag: 'out-node-1',
  systemProxyEnabled: true,
  tunEnabled: false,
  proxyMode: 'rule'
};

test('rule mode emits catch-all route with default outbound', () => {
  const { route } = buildRouteConfig(baseContext);
  assert.ok(Array.isArray(route.rules));
  assert.ok(route.rules.length > 0);
  const catchAll = route.rules.find((r) => Array.isArray(r.inbound) && r.inbound.includes('system-socks') && r.outbound === 'out-node-1' && !r.domain && !r.rule_set);
  assert.ok(catchAll, 'expected a catch-all capture rule routing to out-node-1');
});

test('global mode routes capture traffic through default outbound', () => {
  const { route } = buildRouteConfig({ ...baseContext, proxyMode: 'global' });
  const captureRules = route.rules.filter((r) => Array.isArray(r.inbound) && r.inbound.includes('system-socks'));
  assert.ok(captureRules.length > 0);
  for (const rule of captureRules) {
    assert.equal(rule.outbound, 'out-node-1');
  }
});

test('custom rule targeting a node resolves to out-<nodeId>', () => {
  const { route } = buildRouteConfig({
    ...baseContext,
    customRules: [{ action: 'node', nodeId: 'node-1', domain: ['example.com'] }]
  });
  const rule = route.rules.find((r) => Array.isArray(r.inbound) && r.inbound.includes('system-socks') && r.outbound === 'out-node-1' && r.rule_set);
  assert.ok(rule, 'expected a capture rule routing the custom rule to out-node-1');
});

test('custom rule targeting a missing node falls back to default outbound', () => {
  const { route } = buildRouteConfig({
    ...baseContext,
    customRules: [{ action: 'node', nodeId: 'node-missing', domain: ['example.com'] }]
  });
  const rule = route.rules.find((r) => Array.isArray(r.inbound) && r.inbound.includes('system-socks') && r.rule_set);
  assert.ok(rule);
  assert.equal(rule.outbound, 'out-node-1');
});

test('tun enabled sets auto_detect_interface', () => {
  const { route } = buildRouteConfig({ ...baseContext, tunEnabled: true });
  assert.equal(route.auto_detect_interface, true);
});

test('exposes capture inbound tags', () => {
  assert.ok(CAPTURE_INBOUND_TAGS.includes('tun-in'));
  assert.ok(CAPTURE_INBOUND_TAGS.includes('system-socks'));
});
