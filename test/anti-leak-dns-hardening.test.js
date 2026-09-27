import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRouteConfig } from '../app/proxy/route-config.js';
import { buildDnsConfig } from '../app/proxy/dns-config.js';
import { generateProxyConfig } from '../app/proxy/config-generator.js';

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

const findAntiLeakRule = (rules) => rules.find((r) =>
  r?.type === 'logical'
  && r?.mode === 'or'
  && r?.action === 'reject'
  && Array.isArray(r.rules)
  && r.rules.some((sub) => sub?.port === 853)
  && r.rules.some((sub) => Array.isArray(sub?.protocol) && sub.protocol.includes('stun'))
);

test('anti-leak rule rejects STUN/QUIC and DoT(853)', () => {
  const { route } = buildRouteConfig(baseContext);
  const rule = findAntiLeakRule(route.rules);
  assert.ok(rule, 'expected anti-leak reject rule');
  assert.equal(rule.no_drop, true);
  const quicSub = rule.rules.find((sub) => Array.isArray(sub?.protocol));
  assert.ok(quicSub.protocol.includes('quic'), 'should also match quic protocol');
});

test('anti-leak rule sits right after sniff, before user rules', () => {
  const { route } = buildRouteConfig({ ...baseContext, tunEnabled: false });
  const sniffIdx = route.rules.findIndex((r) => r?.action === 'sniff');
  const leakIdx = route.rules.findIndex((r) => r === findAntiLeakRule(route.rules));
  assert.ok(sniffIdx >= 0 && leakIdx === sniffIdx + 1, `anti-leak should follow sniff (sniff@${sniffIdx}, leak@${leakIdx})`);
  // 用户规则（capture inbound 规则）必须在它之后
  const firstCaptureIdx = route.rules.findIndex((r) => Array.isArray(r.inbound) && r.inbound.includes('system-socks'));
  assert.ok(firstCaptureIdx > leakIdx, 'user/capture rules must come after anti-leak');
});

test('anti-leak rule sits after hijack-dns when TUN is on', () => {
  const { route } = buildRouteConfig({ ...baseContext, tunEnabled: true });
  const hijackIdx = route.rules.findIndex((r) => r?.action === 'hijack-dns');
  const leakIdx = route.rules.findIndex((r) => r === findAntiLeakRule(route.rules));
  assert.ok(hijackIdx >= 0 && leakIdx > hijackIdx, `anti-leak should follow hijack-dns (hijack@${hijackIdx}, leak@${leakIdx})`);
});

test('DNS rejects HTTPS/SVCB queries first', () => {
  const dns = buildDnsConfig({ captureInbounds: ['system-socks'], systemProxyEnabled: true });
  assert.ok(dns.rules.length > 0);
  const first = dns.rules[0];
  assert.deepEqual(first.query_type, ['HTTPS', 'SVCB']);
  assert.equal(first.action, 'reject');
});

test('generated config enables DNS cache_file', () => {
  const config = generateProxyConfig({
    nodes: [],
    log: { error() {}, warn() {}, info() {}, debug() {} },
    resolveDefaultNodeId: () => null,
    proxyListen: '127.0.0.1',
    basePort: 20000,
    nodePortMap: new Map(),
    rulesDir: '/tmp/leme-hub-test-rules'
  }, {});
  assert.ok(config.experimental, 'expected experimental section');
  assert.equal(config.experimental.cache_file?.enabled, true);
  // store_dns 需要 sing-box >= 1.14.0，旧内核会拒绝启动，故意不生成。
  assert.equal(config.experimental.cache_file?.store_dns, undefined);
});

test('DNS rules never reference geoip-* rule-sets (1.14.0+ rejects them)', () => {
  const dns = buildDnsConfig({
    captureInbounds: ['tun-in'],
    systemProxyEnabled: true,
    tunEnabled: true,
    proxyMode: 'rule',
    builtInCnDirectRuleSetTags: ['geosite-cn', 'geoip-cn']
  });
  for (const rule of dns.rules) {
    const tags = Array.isArray(rule?.rule_set) ? rule.rule_set : (rule?.rule_set ? [rule.rule_set] : []);
    for (const tag of tags) {
      assert.ok(
        !String(tag).startsWith('geoip-'),
        `DNS rule must not reference IP-based rule-set "${tag}" (sing-box 1.14.0+ fatal)`
      );
    }
  }
  // geosite-cn（域名）必须还在，保证国内域名走本地 DNS
  const cnRule = dns.rules.find((r) => {
    const tags = Array.isArray(r?.rule_set) ? r.rule_set : [];
    return tags.includes('geosite-cn');
  });
  assert.ok(cnRule, 'expected DNS rule referencing geosite-cn');
  assert.equal(cnRule.server, 'dns-local');
});
