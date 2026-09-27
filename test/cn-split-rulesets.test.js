import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BUILTIN_RULESETS, REMOTE_RULESET_CATALOG } from '../app/shared/constants.js';
import { buildRouteConfig } from '../app/proxy/route-config.js';

// Microsoft / Apple / Steam 国内外 endpoint 拆分：@cn 走直连
const CN_SPLIT_PRESETS = [
  { id: 'microsoft-cn', remoteId: 'geosite-microsoftcn', tag: 'geosite-microsoftcn' },
  { id: 'apple-cn', remoteId: 'geosite-applecn', tag: 'geosite-applecn' },
  { id: 'steam-cn', remoteId: 'geosite-steamcn', tag: 'geosite-steamcn' }
];

test('@cn split builtins exist with correct remote rulesets', () => {
  const builtinMap = new Map(BUILTIN_RULESETS.map((b) => [b.id, b]));
  const catalogIds = new Set(REMOTE_RULESET_CATALOG.map((r) => r.id));
  for (const { id, remoteId } of CN_SPLIT_PRESETS) {
    const builtin = builtinMap.get(id);
    assert.ok(builtin, `missing builtin preset: ${id}`);
    assert.ok((builtin.remoteRuleSetIds || []).includes(remoteId), `${id} should reference ${remoteId}`);
    assert.ok(catalogIds.has(remoteId), `missing remote catalog entry: ${remoteId}`);
  }
});

test('@cn split ruleset routes to direct in generated config', () => {
  // 造出规则集文件占位，否则 buildRouteConfig 会过滤掉未下载的 remote rule_set
  const rulesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-cnsplit-test-'));
  const catalogMap = new Map(REMOTE_RULESET_CATALOG.map((r) => [r.id, r]));
  const builtinMap = new Map(BUILTIN_RULESETS.map((b) => [b.id, b]));
  for (const { remoteId } of CN_SPLIT_PRESETS) {
    const tag = catalogMap.get(remoteId).tag;
    fs.writeFileSync(path.join(rulesDir, `${tag}.srs`), Buffer.from([0x00]));
  }

  try {
    // 模拟用户从"添加内置规则集"下拉框逐个添加，target 选直连
    const routingItems = CN_SPLIT_PRESETS.map(({ id }, index) => ({
      id: `ruleset-${index + 1}`,
      kind: 'builtin_ruleset',
      presetId: id,
      name: builtinMap.get(id).name,
      target: 'direct',
      enabled: true
    }));
    const { route } = buildRouteConfig({
      rulesDir,
      validNodes: [{ id: 'node-1', name: 'JP', type: 'vless' }],
      inbounds: [{ tag: 'system-socks' }, { tag: 'system-http' }],
      routingItems,
      nodeGroupMap: new Map(),
      systemDefaultOutbound: 'out-node-1',
      activeSelectorOutboundTag: 'out-node-1',
      systemProxyEnabled: true,
      tunEnabled: false,
      proxyMode: 'rule'
    });

    const captureRules = route.rules.filter(
      (r) => Array.isArray(r.inbound) && r.inbound.includes('system-socks') && r.rule_set
    );
    for (const { tag } of CN_SPLIT_PRESETS) {
      const rule = captureRules.find((r) => {
        const tags = Array.isArray(r.rule_set) ? r.rule_set : [r.rule_set];
        return tags.includes(tag);
      });
      assert.ok(rule, `expected route rule for ${tag}`);
      assert.equal(rule.outbound, 'direct', `${tag} should route direct`);
    }
  } finally {
    fs.rmSync(rulesDir, { recursive: true, force: true });
  }
});
