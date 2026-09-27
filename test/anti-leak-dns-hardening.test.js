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
  const base = {
    nodes: [],
    log: { error() {}, warn() {}, info() {}, debug() {} },
    resolveDefaultNodeId: () => null,
    proxyListen: '127.0.0.1',
    basePort: 20000,
    nodePortMap: new Map(),
    rulesDir: '/tmp/leme-hub-test-rules'
  };
  // 未知版本：保守策略，不生成 store_dns（旧内核会拒绝启动）
  const unknownVer = generateProxyConfig(base, {});
  assert.equal(unknownVer.experimental.cache_file?.enabled, true);
  assert.equal(unknownVer.experimental.cache_file?.store_dns, undefined);

  // 1.14.0+：生成 store_dns，DNS 缓存落盘
  const newVer = generateProxyConfig(base, { singBoxVersion: '1.14.2' });
  assert.equal(newVer.experimental.cache_file?.store_dns, true);

  // 1.14.0 之前：不生成，避免 unknown field 导致启动失败
  const oldVer = generateProxyConfig(base, { singBoxVersion: '1.13.0' });
  assert.equal(oldVer.experimental.cache_file?.store_dns, undefined);
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

test('isSingBoxVersionGte compares versions correctly', async () => {
  const { isSingBoxVersionGte } = await import('../app/proxy/runtime.js');
  assert.equal(isSingBoxVersionGte('1.14.2', '1.14.0'), true);
  assert.equal(isSingBoxVersionGte('1.14.0', '1.14.0'), true);
  assert.equal(isSingBoxVersionGte('1.15.0', '1.14.0'), true);
  assert.equal(isSingBoxVersionGte('2.0.0', '1.14.0'), true);
  assert.equal(isSingBoxVersionGte('1.13.9', '1.14.0'), false);
  assert.equal(isSingBoxVersionGte('1.13.0', '1.14.0'), false);
  // 未知/非法版本保守返回 false
  assert.equal(isSingBoxVersionGte(null, '1.14.0'), false);
  assert.equal(isSingBoxVersionGte(undefined, '1.14.0'), false);
  assert.equal(isSingBoxVersionGte('', '1.14.0'), false);
  assert.equal(isSingBoxVersionGte('not-a-version', '1.14.0'), false);
});
