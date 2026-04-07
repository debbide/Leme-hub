const REMOTE_RULESET_RUNTIME_LABELS = {
  present: '已下载',
  missing: '缺失'
};

const ROUTING_RULE_TYPES = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr'];
const ROUTING_RULE_ACTIONS = ['default', 'direct', 'node', 'node_group'];
const ROUTING_RULESET_TARGETS = ['default', 'direct', 'node', 'node_group'];

const ROUTING_RULE_TYPE_LABELS = {
  domain: '域名',
  domain_suffix: '后缀',
  domain_keyword: '关键词',
  ip_cidr: 'CIDR'
};

const ROUTING_TARGET_LABELS = {
  default: '默认代理',
  direct: '直连',
  node: '指定节点',
  node_group: '节点组'
};

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
  if (!ruleset || typeof ruleset !== 'object') {
    return '<span class="routing-runtime-pill is-inline is-muted">无效规则集</span>';
  }

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

const buildRoutingRowCollections = (rules = [], rulesets = []) => {
  const rulesetRows = rulesets.map((ruleset, index) => ({
    kind: 'ruleset',
    id: String(ruleset.id || `ruleset-${index}`),
    sourceIndex: index,
    data: ruleset,
  }));
  const ruleRows = rules.map((rule, index) => ({
    kind: 'rule',
    id: String(rule.id || `rule-${index}`),
    sourceIndex: index,
    data: rule,
  }));
  const allRows = [...rulesetRows, ...ruleRows];
  const lookup = new Map(allRows.map((row) => [`${row.kind}:${row.id}`, row]));
  return { allRows, lookup };
};

const normalizeRoutingRowRef = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const kind = row.kind === 'rule' || row.kind === 'ruleset'
    ? row.kind
    : null;
  const id = row.id == null ? '' : String(row.id);

  if (!kind || !id) {
    return null;
  }

  return { kind, id };
};

export const buildRoutingRowOrderFromItems = ({ routingItems = [], rules = [], rulesets = [] } = {}) => {
  const { allRows, lookup } = buildRoutingRowCollections(rules, rulesets);
  const orderedRows = [];
  const seen = new Set();

  (Array.isArray(routingItems) ? routingItems : []).forEach((item) => {
    let ref = null;

    if (item?.kind === 'rule') {
      ref = { kind: 'rule', id: String(item.id || '') };
    } else if (item?.kind === 'builtin_ruleset') {
      ref = { kind: 'ruleset', id: String(item.id || '') };
    } else if (item?.kind === 'custom_entry') {
      ref = { kind: 'ruleset', id: String(item.rulesetId || '') };
    }

    const normalizedRef = normalizeRoutingRowRef(ref);
    if (!normalizedRef) {
      return;
    }

    const key = `${normalizedRef.kind}:${normalizedRef.id}`;
    if (!lookup.has(key) || seen.has(key)) {
      return;
    }

    seen.add(key);
    orderedRows.push(normalizedRef);
  });

  allRows.forEach((row) => {
    const key = `${row.kind}:${row.id}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    orderedRows.push({ kind: row.kind, id: row.id });
  });

  return orderedRows;
};

export const buildUnifiedRoutingRows = (rules = [], rulesets = [], orderedRows = []) => {
  const { allRows, lookup } = buildRoutingRowCollections(rules, rulesets);
  const normalizedOrder = Array.isArray(orderedRows)
    ? orderedRows.map(normalizeRoutingRowRef).filter(Boolean)
    : [];

  if (!normalizedOrder.length) {
    return allRows;
  }

  const rows = [];
  const seen = new Set();

  normalizedOrder.forEach((rowRef) => {
    const key = `${rowRef.kind}:${rowRef.id}`;
    if (!lookup.has(key) || seen.has(key)) {
      return;
    }

    seen.add(key);
    rows.push(lookup.get(key));
  });

  allRows.forEach((row) => {
    const key = `${row.kind}:${row.id}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    rows.push(row);
  });

  return rows;
};

export const buildRoutingItemsFromUnifiedRows = ({ rules = [], rulesets = [], orderedRows = [] } = {}) => (
  buildUnifiedRoutingRows(rules, rulesets, orderedRows).flatMap((row, index) => {
    if (row.kind === 'rule') {
      const rule = row.data || {};
      return [{
        id: String(rule.id || `rule-${index + 1}`),
        kind: 'rule',
        type: String(rule.type || '').trim(),
        value: String(rule.value || '').trim(),
        action: String(rule.action || '').trim(),
        nodeId: rule.nodeId == null || rule.nodeId === '' ? null : String(rule.nodeId).trim(),
        nodeGroupId: rule.nodeGroupId == null || rule.nodeGroupId === '' ? null : String(rule.nodeGroupId).trim(),
        note: String(rule.note || '').trim(),
      }];
    }

    const ruleset = row.data || {};
    const rulesetId = String(ruleset.id || `ruleset-${index + 1}`);
    const target = String(ruleset.target || '').trim();
    const nodeId = ruleset.nodeId == null || ruleset.nodeId === '' ? null : String(ruleset.nodeId).trim();
    const groupId = ruleset.groupId == null || ruleset.groupId === '' ? null : String(ruleset.groupId).trim();

    if (ruleset.kind === 'builtin') {
      return [{
        id: rulesetId,
        kind: 'builtin_ruleset',
        presetId: String(ruleset.presetId || '').trim(),
        name: String(ruleset.name || '').trim(),
        target,
        nodeId,
        groupId,
        enabled: ruleset.enabled !== false,
        note: String(ruleset.note || '').trim(),
      }];
    }

    return (Array.isArray(ruleset.entries) ? ruleset.entries : []).map((entry, entryIndex) => ({
      id: String(entry.id || `${rulesetId}-entry-${entryIndex + 1}`),
      kind: 'custom_entry',
      rulesetId,
      rulesetName: String(ruleset.name || '').trim(),
      type: String(entry.type || '').trim(),
      value: String(entry.value || '').trim(),
      target,
      nodeId,
      groupId,
      enabled: ruleset.enabled !== false,
      note: String(entry.note || ruleset.note || '').trim(),
    }));
  })
);

export const summarizeUnifiedRoutingRow = ({ row, routingNodeOptions = [], nodeGroups = [], getNodeGroupDisplayName = () => '' }) => {
  if (!row || typeof row !== 'object' || !row.data) {
    return { typeLabel: '--', matchLabel: '--', targetLabel: '--', metaLabel: '' };
  }

  if (row.kind === 'rule') {
    const rule = row.data;
    const node = routingNodeOptions.find((item) => item.id === rule.nodeId);
    const group = nodeGroups.find((item) => item.id === rule.nodeGroupId);
    const targetLabel = rule.action === 'node'
      ? `${ROUTING_TARGET_LABELS.node} · ${node?.name || node?.server || rule.nodeId || '--'}`
      : rule.action === 'node_group'
        ? `${ROUTING_TARGET_LABELS.node_group} · ${getNodeGroupDisplayName(group) || rule.nodeGroupId || '--'}`
        : ROUTING_TARGET_LABELS[rule.action] || '--';

    return {
      typeLabel: ROUTING_RULE_TYPE_LABELS[rule.type] || '规则',
      matchLabel: String(rule.value || '').trim() || '--',
      targetLabel,
      metaLabel: String(rule.note || '').trim(),
    };
  }

  const ruleset = row.data;
  const node = routingNodeOptions.find((item) => item.id === ruleset.nodeId);
  const group = nodeGroups.find((item) => item.id === ruleset.groupId);
  const targetLabel = ruleset.target === 'node'
    ? `${ROUTING_TARGET_LABELS.node} · ${node?.name || node?.server || ruleset.nodeId || '--'}`
    : ruleset.target === 'node_group'
      ? `${ROUTING_TARGET_LABELS.node_group} · ${getNodeGroupDisplayName(group) || ruleset.groupId || '--'}`
      : ROUTING_TARGET_LABELS[ruleset.target] || '--';

  return {
    typeLabel: ruleset.kind === 'builtin' ? '内置规则集' : '自定义规则集',
    matchLabel: String(ruleset.name || '').trim() || '--',
    targetLabel,
    metaLabel: ruleset.kind === 'custom' ? `${Array.isArray(ruleset.entries) ? ruleset.entries.length : 0} 条` : String(ruleset.presetId || '').trim(),
  };
};

export const applyRoutingPreset = (presetId) => {
  switch (presetId) {
    case 'proxy-ai':
      return [
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'openai', action: 'default', note: 'OpenAI' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'anthropic', action: 'default', note: 'Anthropic' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'claude.ai', action: 'default', note: 'Claude' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'midjourney.com', action: 'default', note: 'Midjourney' })
      ];
    case 'proxy-dev':
      return [
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'github', action: 'default', note: 'GitHub' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'stackoverflow.com', action: 'default', note: 'StackOverflow' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'docker.com', action: 'default', note: 'Docker' })
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
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'openai', action: 'default', note: 'AI 服务走代理' }),
        createRoutingRuleDraft({ type: 'domain_keyword', value: 'github', action: 'default', note: '开发平台走代理' }),
        createRoutingRuleDraft({ type: 'domain_suffix', value: 'cn', action: 'direct', note: '国内域名直连' })
      ];
    default:
      return [];
  }
};
