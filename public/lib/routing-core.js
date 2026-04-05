const REMOTE_RULESET_RUNTIME_LABELS = {
  present: '已下载',
  missing: '缺失'
};

const ROUTING_RULE_TYPES = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr'];
const ROUTING_RULE_ACTIONS = ['default', 'direct', 'node', 'node_group'];
const ROUTING_RULESET_TARGETS = ['default', 'direct', 'node', 'node_group'];

let routingRuleCounter = 0;
let routingRulesetCounter = 0;
let routingRulesetEntryCounter = 0;

const isValidIpCidr = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,3})(?:\.(\d{1,3}))(?:\.(\d{1,3}))(?:\.(\d{1,3}))\/(\d|[12]\d|3[0-2])$/);
  if (!match) return false;
  return match.slice(1, 5).every((part) => Number(part) >= 0 && Number(part) <= 255);
};

export const createRoutingRuleDraft = (rule = {}) => ({
  id: rule.id || `draft-${Date.now()}-${routingRuleCounter++}`,
  type: ROUTING_RULE_TYPES.includes(rule.type) ? rule.type : 'domain_suffix',
  value: String(rule.value || ''),
  action: ROUTING_RULE_ACTIONS.includes(rule.action) ? rule.action : 'direct',
  nodeId: String(rule.nodeId || ''),
  nodeGroupId: String(rule.nodeGroupId || ''),
  note: String(rule.note || '')
});

export const createRoutingRulesetEntryDraft = (entry = {}) => ({
  id: entry.id || `ruleset-entry-${Date.now()}-${routingRulesetEntryCounter++}`,
  type: ROUTING_RULE_TYPES.includes(entry.type) ? entry.type : 'domain_suffix',
  value: String(entry.value || ''),
  note: String(entry.note || '')
});

export const createRoutingRulesetDraft = (ruleset = {}) => ({
  id: ruleset.id || `ruleset-${Date.now()}-${routingRulesetCounter++}`,
  kind: ['builtin', 'custom'].includes(ruleset.kind) ? ruleset.kind : 'custom',
  presetId: ruleset.presetId || '',
  name: String(ruleset.name || ''),
  enabled: ruleset.enabled !== false,
  target: ROUTING_RULESET_TARGETS.includes(ruleset.target) ? ruleset.target : 'default',
  nodeId: ruleset.nodeId || '',
  groupId: ruleset.groupId || '',
  remoteRuleSetIds: Array.isArray(ruleset.remoteRuleSetIds) ? [...ruleset.remoteRuleSetIds] : [],
  entries: Array.isArray(ruleset.entries) ? ruleset.entries.map((entry) => createRoutingRulesetEntryDraft(entry)) : [],
  note: String(ruleset.note || '')
});

export const validateRoutingRule = (rule) => {
  const errors = {};
  if (!ROUTING_RULE_TYPES.includes(rule.type)) {
    errors.type = '规则类型无效';
  }
  if (!ROUTING_RULE_ACTIONS.includes(rule.action)) {
    errors.action = '规则动作无效';
  }
  if (rule.action === 'node' && !String(rule.nodeId || '').trim()) {
    errors.nodeId = '请选择节点';
  }
  if (rule.action === 'node_group' && !String(rule.nodeGroupId || '').trim()) {
    errors.nodeGroupId = '请选择节点组';
  }
  if (!String(rule.value || '').trim()) {
    errors.value = '匹配内容不能为空';
  } else if (rule.type === 'ip_cidr' && !isValidIpCidr(rule.value)) {
    errors.value = 'CIDR 格式示例: 192.168.0.0/16';
  }
  return errors;
};

export const buildRoutingRuleErrors = (rules) => {
  const nextErrors = Object.fromEntries(rules.map((rule) => [rule.id, validateRoutingRule(rule)]));
  const seen = new Map();

  rules.forEach((rule) => {
    const signature = `${String(rule.type || '').trim()}|${String(rule.action || '').trim()}|${String(rule.value || '').trim().toLowerCase()}`;
    if (!signature || signature.endsWith('|')) return;

    if (seen.has(signature)) {
      nextErrors[rule.id] = {
        ...(nextErrors[rule.id] || {}),
        value: '存在重复规则，请删除或修改其中一条'
      };
      const existingId = seen.get(signature);
      nextErrors[existingId] = {
        ...(nextErrors[existingId] || {}),
        value: '存在重复规则，请删除或修改其中一条'
      };
      return;
    }

    seen.set(signature, rule.id);
  });

  return nextErrors;
};

export const validateRoutingRulesetEntry = (entry) => {
  const errors = {};
  if (!ROUTING_RULE_TYPES.includes(entry.type)) {
    errors.type = '规则类型无效';
  }
  if (!String(entry.value || '').trim()) {
    errors.value = '匹配内容不能为空';
  } else if (entry.type === 'ip_cidr' && !isValidIpCidr(entry.value)) {
    errors.value = 'CIDR 格式示例: 192.168.0.0/16';
  }
  return errors;
};

export const normalizeRoutingRulesetEntry = (entry) => ({
  id: String(entry.id || `ruleset-entry-${Date.now()}-${routingRulesetEntryCounter++}`),
  type: String(entry.type || '').trim(),
  value: String(entry.value || '').trim(),
  note: String(entry.note || '').trim()
});

export const validateRoutingRuleset = (ruleset) => {
  const errors = {};
  if (!['builtin', 'custom'].includes(ruleset.kind)) {
    errors.kind = '规则集类型无效';
  }
  if (!ROUTING_RULESET_TARGETS.includes(ruleset.target)) {
    errors.target = '出口目标无效';
  }
  if (ruleset.target === 'node' && !String(ruleset.nodeId || '').trim()) {
    errors.nodeId = '请选择一个节点';
  }
  if (ruleset.target === 'node_group' && !String(ruleset.groupId || '').trim()) {
    errors.groupId = '请选择一个节点组';
  }
  if (ruleset.kind === 'builtin') {
    if (!String(ruleset.presetId || '').trim()) {
      errors.presetId = '请选择内置规则集';
    }
  } else {
    if (!String(ruleset.name || '').trim()) {
      errors.name = '请填写规则集名称';
    }
    if (!Array.isArray(ruleset.entries) || ruleset.entries.length === 0) {
      errors.entries = '至少保留一条自定义规则';
    }
  }
  return errors;
};

export const buildRoutingRulesetErrors = (rulesets) => {
  const rulesetErrors = {};
  const entryErrors = {};
  const seenIds = new Set();

  rulesets.forEach((ruleset) => {
    rulesetErrors[ruleset.id] = validateRoutingRuleset(ruleset);
    entryErrors[ruleset.id] = {};

    if (seenIds.has(ruleset.id)) {
      rulesetErrors[ruleset.id].id = '规则集 ID 重复';
    }
    seenIds.add(ruleset.id);

    if (ruleset.kind === 'custom') {
      const seenEntries = new Set();
      (ruleset.entries || []).forEach((entry) => {
        const currentErrors = validateRoutingRulesetEntry(entry);
        const signature = `${String(entry.type || '').trim()}|${String(entry.value || '').trim().toLowerCase()}`;
        if (signature && seenEntries.has(signature)) {
          currentErrors.value = '规则集内存在重复条目';
        }
        seenEntries.add(signature);
        entryErrors[ruleset.id][entry.id] = currentErrors;
      });
    }
  });

  return { rulesetErrors, entryErrors };
};

export const normalizeRoutingRule = (rule) => ({
  id: String(rule.id || `rule-${Date.now()}-${routingRuleCounter++}`),
  type: String(rule.type || '').trim(),
  value: String(rule.value || '').trim(),
  action: String(rule.action || '').trim(),
  nodeId: String(rule.nodeId || '').trim(),
  nodeGroupId: String(rule.nodeGroupId || '').trim(),
  note: String(rule.note || '').trim()
});

export const getBuiltinRulesetById = (routingBuiltinRulesets, presetId) => routingBuiltinRulesets.find((ruleset) => ruleset.id === presetId) || null;

export const renderRulesetRuntimeMeta = ({ ruleset, routingBuiltinRulesets, rulesetDatabaseStatus, escapeHtml }) => {
  if (ruleset.kind !== 'builtin') {
    return '<span class="routing-runtime-pill is-inline">inline</span>';
  }

  const builtin = getBuiltinRulesetById(routingBuiltinRulesets, ruleset.presetId);
  const remoteIds = Array.isArray(builtin?.remoteRuleSetIds)
    ? builtin.remoteRuleSetIds
    : Array.isArray(ruleset.remoteRuleSetIds)
      ? ruleset.remoteRuleSetIds
      : [];

  const files = rulesetDatabaseStatus?.files || {};
  const runtimeMeta = remoteIds.map((remoteId) => ({
    id: remoteId,
    exists: Boolean(files[remoteId]?.exists)
  }));

  if (!runtimeMeta.length) {
    return '<span class="routing-runtime-pill is-inline is-muted">无远程映射</span>';
  }

  return runtimeMeta.map((entry) => {
    const downloadState = entry.exists ? 'present' : 'missing';
    return `<span class="routing-runtime-pill is-inline ${entry.exists ? 'is-ready' : 'is-missing'}" title="${escapeHtml(entry.id)}">
      <span class="routing-runtime-pill-tag">${escapeHtml(entry.id)}</span>
      <span class="routing-runtime-pill-sep"></span>
      <span>${REMOTE_RULESET_RUNTIME_LABELS[downloadState]}</span>
    </span>`;
  }).join('');
};

export const applyRoutingPreset = (presetId) => {
  switch (presetId) {
    case 'proxy-ai':
      return [
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'openai', action: 'proxy', note: 'OpenAI' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'anthropic', action: 'proxy', note: 'Anthropic' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'claude.ai', action: 'proxy', note: 'Claude' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'midjourney.com', action: 'proxy', note: 'Midjourney' })
      ];
    case 'proxy-dev':
      return [
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'github', action: 'proxy', note: 'GitHub' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'stackoverflow.com', action: 'proxy', note: 'StackOverflow' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'docker.com', action: 'proxy', note: 'Docker' })
      ];
    case 'direct-cn':
      return [
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'cn', action: 'direct', note: '中国域名后缀' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'baidu', action: 'direct', note: '百度' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'taobao', action: 'direct', note: '淘宝' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'qq', action: 'direct', note: '腾讯' })
      ];
    case 'mixed-starter':
      return [
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'openai', action: 'proxy', note: 'AI 服务走代理' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'github', action: 'proxy', note: '开发平台走代理' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'cn', action: 'direct', note: '国内域名直连' })
      ];
    default:
      return [];
  }
};
