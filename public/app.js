const nodesList = document.querySelector('#nodes-list');
const nodesTbody = document.querySelector('#nodes-tbody');
const nodesState = document.querySelector('#nodes-state');
const nodesLoading = document.querySelector('#nodes-loading');
const nodesEmpty = document.querySelector('#nodes-empty');
const nodesError = document.querySelector('#nodes-error');

const showImportBtn = document.querySelector('#show-import');
const showSyncBtn = document.querySelector('#show-sync');
const manualAddBtn = document.querySelector('#manual-add');
const testAllBtn = document.querySelector('#test-all');
const closePanelBtn = document.querySelector('#close-panel');
const saveRestartBtn = document.querySelector('#save-restart-core');

const importForm = document.querySelector('#import-form');
const syncForm = document.querySelector('#sync-form');
const importUrlInput = document.querySelector('#import-url');
const syncUrlInput = document.querySelector('#sync-url');
const nodeCountLabel = document.querySelector('#node-count-label');
const toastContainer = document.querySelector('#toast-container');
const coreStatusIndicator = document.querySelector('#core-status-indicator');
const systemProxyModeSelect = document.querySelector('.system-proxy-mode');
const dashActiveNodeSelect = document.querySelector('#dash-active-node-select');
const dashUptime = document.querySelector('#dash-uptime');
const dashSpeedValue = document.querySelector('#dash-speed-value');
const sidebarDefaultProxy = document.querySelector('#sidebar-default-proxy');
const routingGeoIpNote = document.querySelector('#routing-geoip-note');
const geoIpRefreshBtn = document.querySelector('#geoip-refresh-btn');
const autoStartToggle = document.querySelector('#auto-start-toggle');
const routingModeBanner = document.querySelector('#routing-mode-banner');
const routingRulesContainer = document.querySelector('#routing-rules');
const routingLoading = document.querySelector('#routing-loading');
const routingEmpty = document.querySelector('#routing-empty');
const routingError = document.querySelector('#routing-error');
const routingAddRuleBtn = document.querySelector('#routing-add-rule');
const routingAddRulesetBtn = document.querySelector('#routing-add-ruleset');
const routingSaveBtn = document.querySelector('#routing-save-btn');
const routingPresetSelect = document.querySelector('#routing-preset-select');
const routingRulesetPresetSelect = document.querySelector('#routing-ruleset-preset-select');
const routingObservability = document.querySelector('#routing-observability');
const routingObservabilityLines = document.querySelector('#routing-observability-lines');
const routingObservabilityRefreshBtn = document.querySelector('#routing-observability-refresh');
const routingObservabilityStatus = document.querySelector('#routing-observability-status');
const routingLogMode = document.querySelector('#routing-log-mode');
const routingLogSystemProxy = document.querySelector('#routing-log-system-proxy');
const routingLogCoreStatus = document.querySelector('#routing-log-core-status');
const routingLogSearchInput = document.querySelector('#routing-log-search');
const routingLogSearchClearBtn = document.querySelector('#routing-log-search-clear');
const routingLogKindFilter = document.querySelector('#routing-log-kind-filter');
const routingLogViewStatsBtn = document.querySelector('#routing-log-view-stats');
const routingLogViewTimelineBtn = document.querySelector('#routing-log-view-timeline');
const routingLogResultCount = document.querySelector('#routing-log-result-count');
const routingLogNavBadge = document.querySelector('#routing-log-nav-badge');
const routingRuleModal = document.querySelector('#routing-rule-modal');
const routingRuleModalTitle = document.querySelector('#routing-rule-modal-title');
const routingRuleModalType = document.querySelector('#routing-rule-modal-type');
const routingRuleModalAction = document.querySelector('#routing-rule-modal-action');
const routingRuleModalNodeField = document.querySelector('#routing-rule-modal-node-field');
const routingRuleModalNode = document.querySelector('#routing-rule-modal-node');
const routingRuleModalValue = document.querySelector('#routing-rule-modal-value');
const routingRuleModalNote = document.querySelector('#routing-rule-modal-note');
const routingRuleModalError = document.querySelector('#routing-rule-modal-error');
const routingRuleModalConfirm = document.querySelector('#routing-rule-modal-confirm');
const routingRuleModalClose = document.querySelector('#routing-rule-modal-close');
const routingRuleModalCancel = document.querySelector('#routing-rule-modal-cancel');
const rulesetDbRefreshBtn = document.querySelector('#ruleset-db-refresh-btn');
const routingDbStatus = document.querySelector('#routing-db-status');
const routingDbNote = document.querySelector('#routing-db-note');
const nodeGroupsList = document.querySelector('#node-groups-list');
const nodeGroupAddBtn = document.querySelector('#node-group-add-btn');
const nodeGroupModal = document.querySelector('#node-group-modal');
const nodeGroupModalTitle = document.querySelector('#node-group-modal-title');
const nodeGroupModalName = document.querySelector('#node-group-modal-name');
const nodeGroupModalType = document.querySelector('#node-group-modal-type');
const nodeGroupModalCountry = document.querySelector('#node-group-modal-country');
const nodeGroupModalIconMode = document.querySelector('#node-group-modal-icon-mode');
const nodeGroupModalEmojiWrap = document.querySelector('#node-group-modal-emoji-wrap');
const nodeGroupModalIconEmoji = document.querySelector('#node-group-modal-icon-emoji');
const nodeGroupModalDefaultNode = document.querySelector('#node-group-modal-default-node');
const nodeGroupModalNote = document.querySelector('#node-group-modal-note');
const nodeGroupModalError = document.querySelector('#node-group-modal-error');
const nodeGroupModalConfirm = document.querySelector('#node-group-modal-confirm');
const nodeGroupModalCancel = document.querySelector('#node-group-modal-cancel');
const nodeGroupModalClose = document.querySelector('#node-group-modal-close');
const nodeGroupsLastTestEl = document.querySelector('#node-groups-last-test');
const nodeGroupsNextTestEl = document.querySelector('#node-groups-next-test');
const nodeGroupAutoIntervalSelect = document.querySelector('#node-group-auto-interval');
const nodeGroupSearchInput = document.querySelector('#node-group-search-input');
const nodeGroupSearchCount = document.querySelector('#node-group-search-count');

let currentCoreState = null;
let uptimeTimer = null;
let trafficPoller = null;
let lastTrafficSample = null;
let speedHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let geoIpStatus = null;
let rulesetDatabaseStatus = null;
let routingRules = [];
let routingRulesets = [];
let routingRuleErrors = {};
let routingRulesetErrors = {};
let routingLoaded = false;
let routingLoadingState = false;
let routingSavingState = false;
let routingDirty = false;
let routingSavedFlashUntil = 0;
let routingObservabilityEntries = [];
let routingHits = [];
let routingHitCountSnapshot = new Map();
let routingHitFirstSeenMap = new Map();
let routingLogSeenIds = new Set();
let routingLogUnreadCount = 0;
let routingLogBadgeInitialized = false;
let routingStatusPoller = null;
let routingLogSearchQuery = '';
let routingLogKindQuery = 'all';
let routingLogViewMode = 'stats';
let routingBuiltinRulesets = [];
let routingNodeOptions = [];
let nodeGroups = [];
let nodeGroupExpandedIds = new Set();
let editingNodeGroupId = null;
let nodeGroupLatencyMap = new Map();
let nodeGroupTestingNodeIds = new Set();
let nodeGroupTestingGroupIds = new Set();
let nodeGroupAutoTestTimer = null;
let nodeGroupAutoTestStatusTimer = null;
let nodeGroupLastTestAt = null;
let nodeGroupAutoTestIntervalMs = 5 * 60 * 1000;
let nodeGroupSavingTestingState = false;
let nodeGroupAutoSwitchState = new Map();
let nodeGroupSearchQuery = '';
let nodeGroupSortByLatency = true;
let editingRoutingRuleId = null;

const NODE_GROUP_SWITCH_DELTA_MS = 120;
const NODE_GROUP_SWITCH_COOLDOWN_MS = 15 * 60 * 1000;
const NODE_GROUP_SWITCH_FAIL_THRESHOLD = 3;
const TRAFFIC_POLL_INTERVAL_MS = 2000;

const ROUTING_RULE_TYPES = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr'];
const ROUTING_RULE_ACTIONS = ['default', 'direct', 'node', 'node_group'];
const ROUTING_RULESET_TARGETS = ['default', 'direct', 'node', 'node_group'];
let routingRuleCounter = 0;
let routingRulesetCounter = 0;
let routingRulesetEntryCounter = 0;

const createRoutingRuleDraft = (rule = {}) => ({
  id: rule.id || `draft-${Date.now()}-${routingRuleCounter++}`,
  type: ROUTING_RULE_TYPES.includes(rule.type) ? rule.type : 'domain_suffix',
  value: String(rule.value || ''),
  action: ROUTING_RULE_ACTIONS.includes(rule.action) ? rule.action : 'direct',
  nodeId: String(rule.nodeId || ''),
  nodeGroupId: String(rule.nodeGroupId || ''),
  note: String(rule.note || '')
});

const createRoutingRulesetEntryDraft = (entry = {}) => ({
  id: entry.id || `ruleset-entry-${Date.now()}-${routingRulesetEntryCounter++}`,
  type: ROUTING_RULE_TYPES.includes(entry.type) ? entry.type : 'domain_suffix',
  value: String(entry.value || ''),
  note: String(entry.note || '')
});

const createRoutingRulesetDraft = (ruleset = {}) => ({
  id: ruleset.id || `ruleset-${Date.now()}-${routingRulesetCounter++}`,
  kind: ['builtin', 'custom'].includes(ruleset.kind) ? ruleset.kind : 'custom',
  presetId: ruleset.presetId || '',
  name: String(ruleset.name || ''),
  enabled: ruleset.enabled !== false,
  target: ROUTING_RULESET_TARGETS.includes(ruleset.target) ? ruleset.target : 'default',
  nodeId: ruleset.nodeId || '',
  groupId: ruleset.groupId || '',
  entries: Array.isArray(ruleset.entries) ? ruleset.entries.map((entry) => createRoutingRulesetEntryDraft(entry)) : [],
  note: String(ruleset.note || '')
});

const getRoutingMode = () => currentCoreState?.proxy?.mode || systemProxyModeSelect?.value || 'rule';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const debounce = (fn, delay) => {
  let timer = null;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), delay);
  };
};

const isValidIpCidr = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,3})(?:\.(\d{1,3}))(?:\.(\d{1,3}))(?:\.(\d{1,3}))\/(\d|[12]\d|3[0-2])$/);
  if (!match) return false;
  return match.slice(1, 5).every((part) => Number(part) >= 0 && Number(part) <= 255);
};

const validateRoutingRule = (rule) => {
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

const buildRoutingRuleErrors = (rules) => {
  const nextErrors = Object.fromEntries(rules.map((rule) => [rule.id, validateRoutingRule(rule)]));
  const seen = new Map();

  rules.forEach((rule) => {
    const signature = `${String(rule.type || '').trim()}|${String(rule.action || '').trim()}|${String(rule.value || '').trim().toLowerCase()}`;
    if (!signature || signature.endsWith('|')) {
      return;
    }

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

const getBuiltinRulesetById = (presetId) => routingBuiltinRulesets.find((ruleset) => ruleset.id === presetId) || null;

const validateRoutingRulesetEntry = (entry) => {
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

const normalizeRoutingRulesetEntry = (entry) => ({
  id: String(entry.id || `ruleset-entry-${Date.now()}-${routingRulesetEntryCounter++}`),
  type: String(entry.type || '').trim(),
  value: String(entry.value || '').trim(),
  note: String(entry.note || '').trim()
});

const validateRoutingRuleset = (ruleset) => {
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

const buildRoutingRulesetErrors = (rulesets) => {
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

const normalizeRoutingRule = (rule) => ({
  id: String(rule.id || `rule-${Date.now()}-${routingRuleCounter++}`),
  type: String(rule.type || '').trim(),
  value: String(rule.value || '').trim(),
  action: String(rule.action || '').trim(),
  nodeId: String(rule.nodeId || '').trim(),
  nodeGroupId: String(rule.nodeGroupId || '').trim(),
  note: String(rule.note || '').trim()
});

const updateRoutingSaveState = () => {
  if (!routingSaveBtn) return;
  const inSavedFlash = !routingDirty && !routingSavingState && Date.now() < routingSavedFlashUntil;
  routingSaveBtn.disabled = routingSavingState || routingLoadingState || !routingDirty;
  routingSaveBtn.textContent = routingSavingState
    ? '保存中...'
    : routingDirty
      ? '保存路由表'
      : inSavedFlash
        ? '已保存'
        : '保存路由表';
};

const renderRoutingRulesetPresetOptions = () => {
  if (!routingRulesetPresetSelect) return;
  routingRulesetPresetSelect.innerHTML = [
    '<option value="">添加常用规则集...</option>',
    ...routingBuiltinRulesets.map((ruleset) => `<option value="${escapeHtml(ruleset.id)}">${escapeHtml(ruleset.name)}</option>`)
  ].join('');
};

const extractRoutingObservability = (core) => {
  const recentLogs = Array.isArray(core?.recentLogs) ? core.recentLogs : [];
  return recentLogs.filter((line) => String(line || '').includes('[Routing Hit]')).slice(-30);
};

const loadRoutingHits = async () => {
  try {
    const payload = await requestJson('/api/core/routing-hits');
    const incomingHits = payload.hits || [];
    const nextFirstSeen = new Map();
    routingHits = incomingHits.map((hit) => {
      const stableId = String(hit.id || `${hit.kind || ''}:${hit.name || ''}:${hit.host || ''}:${hit.port || ''}:${hit.outbound || ''}`);
      const firstSeen = routingHitFirstSeenMap.get(stableId) || new Date().toISOString();
      nextFirstSeen.set(stableId, firstSeen);
      return {
        ...hit,
        id: stableId,
        timestamp: hit.timestamp || firstSeen
      };
    });
    routingHitFirstSeenMap = nextFirstSeen;

    const logsViewActive = document.getElementById('routing-logs-view')?.classList.contains('active');
    if (!routingLogBadgeInitialized) {
      markRoutingHitsAsSeen(routingHits);
      routingLogBadgeInitialized = true;
      updateRoutingLogNavBadge(false);
    } else if (logsViewActive) {
      markRoutingHitsAsSeen(routingHits);
      updateRoutingLogNavBadge(false);
    } else {
      const unseen = routingHits.filter((hit) => hit?.id && !routingLogSeenIds.has(String(hit.id)));
      routingLogUnreadCount = unseen.length;
      updateRoutingLogNavBadge(unseen.length > 0);
    }

    routingObservabilityEntries = routingHits.map((hit) => `[Routing Hit] ${hit.kind}:${hit.name} -> ${hit.outboundName || hit.outbound || hit.target} | ${hit.host}`);
    renderRoutingObservability();
  } catch {
    // fall back to log-derived entries
  }
};

const loadNodeGroups = async () => {
  if (!nodeGroupsList) return;
  const payload = await requestJson('/api/node-groups');
  nodeGroups = payload.nodeGroups || [];
  nodeGroupExpandedIds = new Set(Array.from(nodeGroupExpandedIds).filter((id) => nodeGroups.some((group) => group.id === id)));
  nodeGroupAutoSwitchState = new Map(Array.from(nodeGroupAutoSwitchState.entries()).filter(([id]) => nodeGroups.some((group) => group.id === id)));
  routingNodeOptions = payload.nodes || routingNodeOptions;
  const testing = payload.nodeGroupTesting || {};
  const intervalSec = Number.parseInt(testing.intervalSec, 10);
  if (Number.isInteger(intervalSec) && intervalSec > 0) {
    nodeGroupAutoTestIntervalMs = intervalSec * 1000;
    if (nodeGroupAutoIntervalSelect) {
      nodeGroupAutoIntervalSelect.value = String(intervalSec);
    }
  }
  const latencyCache = testing.latencyCache || {};
  const cacheResults = latencyCache.results && typeof latencyCache.results === 'object' ? latencyCache.results : {};
  nodeGroupLatencyMap = new Map(Object.entries(cacheResults));
  nodeGroupLastTestAt = latencyCache.updatedAt ? new Date(latencyCache.updatedAt) : null;
  renderNodeGroupTestMeta();
  renderNodeGroups();
};

const formatClockTime = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '--';
  }
  return value.toLocaleTimeString('zh-CN', { hour12: false });
};

const formatDistance = (targetDate) => {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    return '--';
  }
  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) {
    return '即将';
  }
  const totalSec = Math.ceil(diffMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) {
    return `${sec} 秒`;
  }
  return `${min} 分 ${sec} 秒`;
};

const renderNodeGroupTestMeta = () => {
  if (nodeGroupsLastTestEl) {
    nodeGroupsLastTestEl.textContent = `上次测速: ${formatClockTime(nodeGroupLastTestAt)}`;
  }

  if (nodeGroupsNextTestEl) {
    if (!nodeGroupLastTestAt) {
      nodeGroupsNextTestEl.textContent = '下次测速: 待触发';
      return;
    }
    const nextAt = new Date(nodeGroupLastTestAt.getTime() + nodeGroupAutoTestIntervalMs);
    nodeGroupsNextTestEl.textContent = `下次测速: ${formatClockTime(nextAt)}（${formatDistance(nextAt)}）`;
  }
};

const serializeNodeGroupLatencyCache = () => {
  const results = {};
  nodeGroupLatencyMap.forEach((value, key) => {
    if (!key || !value || typeof value !== 'object') {
      return;
    }
    results[key] = {
      ok: Boolean(value.ok),
      latencyMs: value.latencyMs == null ? null : Number.parseInt(value.latencyMs, 10),
      error: value.error || null,
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  });

  return {
    updatedAt: nodeGroupLastTestAt ? nodeGroupLastTestAt.toISOString() : null,
    results
  };
};

const persistNodeGroupTestingState = async () => {
  if (nodeGroupSavingTestingState) {
    return;
  }
  nodeGroupSavingTestingState = true;
  try {
    await requestJson('/api/system/settings', {
      method: 'PUT',
      body: JSON.stringify({
        nodeGroupAutoTestIntervalSec: Math.max(60, Math.round(nodeGroupAutoTestIntervalMs / 1000)),
        nodeGroupLatencyCache: serializeNodeGroupLatencyCache()
      })
    });
  } catch {
    // keep UI responsive even when persistence is unavailable
  } finally {
    nodeGroupSavingTestingState = false;
  }
};

const getNodeGroupSwitchState = (groupId) => {
  const existing = nodeGroupAutoSwitchState.get(groupId) || {
    lastSwitchAt: 0,
    consecutiveCurrentFailures: 0
  };
  nodeGroupAutoSwitchState.set(groupId, existing);
  return existing;
};

const applyLatencyPrioritySwitch = async (group, testResults = [], options = {}) => {
  if (!group || !group.id || !Array.isArray(group.nodeIds) || !group.nodeIds.length) {
    return;
  }

  const resultById = new Map(testResults.map((item) => [item.id, item]));
  const candidateResults = group.nodeIds
    .map((nodeId) => resultById.get(nodeId))
    .filter((item) => item && item.ok && Number.isFinite(Number(item.latencyMs)))
    .sort((a, b) => Number(a.latencyMs) - Number(b.latencyMs));

  if (!candidateResults.length) {
    return;
  }

  const state = getNodeGroupSwitchState(group.id);
  const currentId = String(group.selectedNodeId || '');
  const currentResult = currentId ? resultById.get(currentId) : null;
  const best = candidateResults[0];
  let shouldSwitch = false;
  let reason = '';

  if (!currentId || !group.nodeIds.includes(currentId)) {
    shouldSwitch = true;
    reason = 'missing-current';
  } else if (!currentResult || !currentResult.ok) {
    state.consecutiveCurrentFailures += 1;
    if (state.consecutiveCurrentFailures >= NODE_GROUP_SWITCH_FAIL_THRESHOLD && best.id !== currentId) {
      shouldSwitch = true;
      reason = 'current-failed';
    }
  } else {
    state.consecutiveCurrentFailures = 0;
    const now = Date.now();
    const cooldownPassed = now - state.lastSwitchAt >= NODE_GROUP_SWITCH_COOLDOWN_MS;
    const gain = Number(currentResult.latencyMs) - Number(best.latencyMs);
    if (best.id !== currentId && cooldownPassed && gain >= NODE_GROUP_SWITCH_DELTA_MS) {
      shouldSwitch = true;
      reason = 'latency-better';
    }
  }

  if (!shouldSwitch || best.id === currentId) {
    return;
  }

  const payload = await requestJson('/api/node-groups/selection', {
    method: 'PUT',
    body: JSON.stringify({ id: group.id, selectedNodeId: best.id })
  });
  nodeGroups = payload.nodeGroups || nodeGroups;
  state.lastSwitchAt = Date.now();

  if (!options.silent) {
    const bestNode = routingNodeOptions.find((node) => node.id === best.id);
    showToast(`延时优先切换：${group.name} -> ${bestNode?.name || best.id} (${best.latencyMs} ms)`, 'success');
  }
  if (reason) {
    // reserved for observability/log extension
  }
};

const formatNodeGroupLatencyBadge = (nodeId) => {
  if (nodeGroupTestingNodeIds.has(nodeId)) {
    return { text: '测试中...', cls: 'is-testing', title: '' };
  }

  const result = nodeGroupLatencyMap.get(nodeId);
  if (!result) {
    return { text: '-- ms', cls: '', title: '' };
  }

  if (!result.ok) {
    return { text: '失败', cls: 'is-error', title: result.error || '测速失败' };
  }

  const latency = Number(result.latencyMs);
  const cls = latency < 200 ? 'is-good' : (latency <= 500 ? 'is-warn' : 'is-bad');
  return { text: `${latency} ms`, cls, title: '' };
};

const applyNodeGroupLatencyResults = (results = []) => {
  results.forEach((result) => {
    nodeGroupLatencyMap.set(result.id, {
      ok: Boolean(result.ok),
      latencyMs: result.latencyMs,
      error: result.error || null,
      updatedAt: new Date().toISOString()
    });
  });
};

const getExistingNodeIdSet = () => new Set((routingNodeOptions || []).map((node) => node.id));

const getEffectiveGroupNodeIds = (group) => {
  const existing = getExistingNodeIdSet();
  return (group?.nodeIds || []).filter((id) => id && existing.has(id));
};

const testNodeGroupNodes = async (groupId, options = {}) => {
  const group = nodeGroups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }
  const nodeIds = getEffectiveGroupNodeIds(group);
  if (!nodeIds.length) {
    if (!options.silent) showToast('该节点组暂无可测速节点', 'info');
    return;
  }

  if (nodeGroupTestingGroupIds.has(groupId)) {
    return;
  }

  nodeGroupTestingGroupIds.add(groupId);
  nodeIds.forEach((id) => nodeGroupTestingNodeIds.add(id));
  renderNodeGroups();

  try {
    const payload = await requestJson('/api/nodes/test-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: nodeIds })
    });
    applyNodeGroupLatencyResults(payload.results || []);
    await applyLatencyPrioritySwitch(group, payload.results || [], options);
    nodeGroupLastTestAt = new Date();
    renderNodeGroupTestMeta();
    persistNodeGroupTestingState();
    if (payload.core) {
      updateCoreStatus(payload.core);
    }
    if (!options.silent) {
      const successCount = (payload.results || []).filter((item) => item.ok).length;
      showToast(`分组测速完成：成功 ${successCount}/${nodeIds.length}`, successCount === nodeIds.length ? 'success' : 'info');
    }
  } catch (error) {
    if (!options.silent) {
      showToast(`分组测速失败: ${error.message}`, 'error');
    }
  } finally {
    nodeGroupTestingGroupIds.delete(groupId);
    nodeIds.forEach((id) => nodeGroupTestingNodeIds.delete(id));
    renderNodeGroups();
  }
};

const testSingleNodeInGroup = async (nodeId, options = {}) => {
  if (!nodeId) {
    return;
  }
  if (nodeGroupTestingNodeIds.has(nodeId)) {
    return;
  }

  nodeGroupTestingNodeIds.add(nodeId);
  renderNodeGroups();

  try {
    const payload = await requestJson('/api/nodes/test', {
      method: 'POST',
      body: JSON.stringify({ id: nodeId })
    });
    applyNodeGroupLatencyResults([{ id: nodeId, ok: true, latencyMs: payload.latencyMs }]);
    nodeGroupLastTestAt = new Date();
    renderNodeGroupTestMeta();
    persistNodeGroupTestingState();
    if (payload.core) {
      updateCoreStatus(payload.core);
    }
    if (!options.silent) {
      showToast(`节点测速完成：${payload.latencyMs} ms`, 'success');
    }
  } catch (error) {
    applyNodeGroupLatencyResults([{ id: nodeId, ok: false, error: error.message || '未知错误' }]);
    nodeGroupLastTestAt = new Date();
    renderNodeGroupTestMeta();
    persistNodeGroupTestingState();
    if (!options.silent) {
      showToast(`节点测速失败: ${error.message || '未知错误'}`, 'error');
    }
  } finally {
    nodeGroupTestingNodeIds.delete(nodeId);
    renderNodeGroups();
  }
};

const stopNodeGroupAutoTest = () => {
  if (nodeGroupAutoTestTimer) {
    clearInterval(nodeGroupAutoTestTimer);
    nodeGroupAutoTestTimer = null;
  }
  if (nodeGroupAutoTestStatusTimer) {
    clearInterval(nodeGroupAutoTestStatusTimer);
    nodeGroupAutoTestStatusTimer = null;
  }
};

const startNodeGroupAutoTest = () => {
  if (nodeGroupAutoTestTimer) {
    return;
  }

  nodeGroupAutoTestTimer = setInterval(() => {
    nodeGroups.forEach((group) => {
      if (getEffectiveGroupNodeIds(group).length) {
        testNodeGroupNodes(group.id, { silent: true });
      }
    });
  }, nodeGroupAutoTestIntervalMs);

  nodeGroupAutoTestStatusTimer = setInterval(() => {
    renderNodeGroupTestMeta();
  }, 1000);
  renderNodeGroupTestMeta();
};

const runNodeGroupAutoBackfillIfNeeded = async () => {
  const pendingGroups = nodeGroups.filter((group) => {
    const effectiveNodeIds = getEffectiveGroupNodeIds(group);
    if (!effectiveNodeIds.length) {
      return false;
    }
    const hasMeasuredNode = effectiveNodeIds.some((nodeId) => nodeGroupLatencyMap.has(nodeId));
    return !hasMeasuredNode;
  });

  for (const group of pendingGroups) {
    await testNodeGroupNodes(group.id, { silent: true });
  }
};

const renderNodeGroups = () => {
  if (!nodeGroupsList) return;
  if (!nodeGroups.length) {
    nodeGroupsList.innerHTML = '<div class="routing-section-empty">还没有节点组，新增后可以把规则指向节点组当前选中节点。</div>';
    return;
  }
  const sortedGroups = [...nodeGroups].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'));
  const countryNameByCode = new Intl.DisplayNames(['zh-CN', 'en'], { type: 'region' });
  const parseCountryMeta = (group) => {
    const name = String(group?.name || '');
    const id = String(group?.id || '');
    const fromName = name.match(/^国家\/([A-Za-z]{2})$/u)?.[1];
    const fromId = id.match(/^country-auto-([a-z]{2})$/u)?.[1];
    const fromConfig = String(group?.countryCode || '').trim();
    const code = String(fromConfig || fromName || fromId || '').toUpperCase();
    if (!/^[A-Z]{2}$/u.test(code)) return null;
    return {
      code,
      flag: flagFromCountryCode(code),
      name: countryNameByCode.of(code) || code
    };
  };

  const isCountryGroup = (group) => {
    const name = String(group?.name || '');
    const id = String(group?.id || '');
    return /^国家\/[A-Za-z]{2}$/u.test(name) || /^country-auto-[a-z]{2}$/u.test(id);
  };
  const countryGroups = sortedGroups.filter(isCountryGroup);
  const customGroups = sortedGroups.filter((group) => !isCountryGroup(group));
  const orderedGroups = [...countryGroups, ...customGroups];
  const query = nodeGroupSearchQuery.trim().toLowerCase();
  const filteredGroups = orderedGroups.filter((group) => {
    if (!query) {
      return true;
    }
    const haystacks = [
      getNodeGroupDisplayName(group),
      group.name,
      group.note,
      group.countryCode
    ].map((value) => String(value || '').toLowerCase());
    return haystacks.some((value) => value.includes(query));
  });

  if (nodeGroupSearchCount) {
    nodeGroupSearchCount.textContent = query
      ? `${filteredGroups.length}/${orderedGroups.length}`
      : `${orderedGroups.length}`;
  }

  if (!filteredGroups.length) {
    nodeGroupsList.innerHTML = '<div class="routing-section-empty">没有匹配的节点组</div>';
    return;
  }

  const renderGroupCard = (group) => {
        const countryMeta = parseCountryMeta(group);
        let groupNodes = group.nodeIds
          .map((nodeId) => routingNodeOptions.find((item) => item.id === nodeId))
          .filter(Boolean);
        if (nodeGroupSortByLatency) {
          groupNodes = groupNodes.slice().sort((a, b) => {
            const aa = nodeGroupLatencyMap.get(a.id);
            const bb = nodeGroupLatencyMap.get(b.id);
            const ar = aa && aa.ok ? Number(aa.latencyMs) : Number.POSITIVE_INFINITY;
            const br = bb && bb.ok ? Number(bb.latencyMs) : Number.POSITIVE_INFINITY;
            return ar - br;
          });
        }
        const selectedNode = groupNodes.find((node) => node.id === group.selectedNodeId);
        const isAutoCountry = /^country-auto-/u.test(String(group.id || ''));
        const iconMode = String(group.iconMode || 'auto');
        const iconEmoji = String(group.iconEmoji || '').trim();
        const groupNote = String(group.note || '').trim();
        const effectiveNodeIds = getEffectiveGroupNodeIds(group);
        const totalNodeCount = effectiveNodeIds.length;
        const testedCount = effectiveNodeIds.filter((nodeId) => nodeGroupLatencyMap.has(nodeId)).length;
        const healthyCount = effectiveNodeIds.filter((nodeId) => nodeGroupLatencyMap.get(nodeId)?.ok).length;
        const availabilityRatio = totalNodeCount ? Math.round((healthyCount / totalNodeCount) * 100) : 0;
        const currentLatencyBadge = selectedNode ? formatNodeGroupLatencyBadge(selectedNode.id) : null;
        const availabilityClass = availabilityRatio >= 80 ? 'is-good' : availabilityRatio >= 40 ? 'is-warn' : 'is-bad';
        const iconMarkup = iconMode === 'none'
          ? '<span class="node-group-country-flag"><span class="node-group-country-flag-fallback">◻</span></span>'
          : iconMode === 'emoji' && iconEmoji
            ? `<span class="node-group-country-flag"><span class="node-group-country-flag-fallback" style="display:inline-flex;">${escapeHtml(iconEmoji)}</span></span>`
            : countryMeta
              ? `<span class="node-group-country-flag" title="${escapeHtml(countryMeta.code)}">
                   <img class="node-group-country-flag-img" src="https://flagcdn.com/24x18/${countryMeta.code.toLowerCase()}.png" alt="${escapeHtml(countryMeta.code)}" loading="lazy" decoding="async" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';">
                   <span class="node-group-country-flag-fallback">${countryMeta.flag || escapeHtml(countryMeta.code)}</span>
                 </span>`
              : '<span class="node-group-country-flag"><span class="node-group-country-flag-fallback" style="display:inline-flex;">🌐</span></span>';
        return `
          <details class="routing-section node-group-card" data-group-id="${escapeHtml(group.id)}"${nodeGroupExpandedIds.has(group.id) ? ' open' : ''}>
            <summary class="routing-section-header node-group-card-summary">
              <div class="node-group-country-head">
                ${iconMarkup}
                <div>
                  <div class="routing-section-title">${escapeHtml(countryMeta ? countryMeta.name : group.name)}</div>
                  <div class="routing-section-note">${group.nodeIds.length} 个节点${selectedNode ? ` · 当前: ${escapeHtml(selectedNode.name || selectedNode.server || selectedNode.id)}` : ''}</div>
                  <div class="node-group-health-row">
                    <span class="node-group-health-pill ${availabilityClass}">可用 ${healthyCount}/${totalNodeCount}</span>
                    ${currentLatencyBadge ? `<span class="node-group-health-pill ${currentLatencyBadge.cls || ''}">当前 ${escapeHtml(currentLatencyBadge.text)}</span>` : ''}
                    ${testedCount < totalNodeCount ? `<span class="node-group-health-pill">已测 ${testedCount}/${totalNodeCount}</span>` : ''}
                  </div>
                  <div class="node-group-health-bar"><span style="width:${availabilityRatio}%"></span></div>
                  ${groupNote ? `<div class="routing-section-note">${escapeHtml(groupNote)}</div>` : ''}
                </div>
              </div>
              <div class="routing-ruleset-actions">
                <button type="button" class="btn-outline node-group-sort-btn ${nodeGroupSortByLatency ? 'is-active' : ''}" data-group-id="${escapeHtml(group.id)}" title="${nodeGroupSortByLatency ? '已按延迟排序' : '按延迟排序'}"><i class="ph ph-sort-ascending"></i></button>
                <button type="button" class="btn-outline node-group-test-btn" data-group-id="${escapeHtml(group.id)}" title="测试该组节点延迟"><i class="ph ph-activity"></i></button>
                ${isAutoCountry ? '<span class="routing-chip is-accent">国家组</span>' : `<button type="button" class="btn-outline node-group-edit-btn" data-group-id="${escapeHtml(group.id)}">编辑</button><button type="button" class="btn-outline node-group-delete-btn" data-group-id="${escapeHtml(group.id)}">删除</button>`}
              </div>
            </summary>
            <div class="node-group-preview-strip">
              ${groupNodes.slice(0, 10).map((node) => {
                const active = node.id === group.selectedNodeId;
                return `<span class="node-group-preview-dot${active ? ' is-selected' : ''}" title="${escapeHtml(node.name || node.server || node.id)}"></span>`;
              }).join('')}
              ${groupNodes.length > 10 ? `<span class="node-group-preview-more">+${groupNodes.length - 10}</span>` : ''}
            </div>
            <div class="routing-rule-card">
              <div class="routing-section-note">点击节点卡片即可切换当前生效节点</div>
              <div class="routing-ruleset-entries node-group-node-cards">
                ${groupNodes.length
                  ? groupNodes.map((node) => {
                      const latencyBadge = formatNodeGroupLatencyBadge(node.id);
                      return `
                    <article class="node-group-node-card node-group-node-card-select${node.id === group.selectedNodeId ? ' is-selected' : ''}" data-group-id="${escapeHtml(group.id)}" data-node-id="${escapeHtml(node.id)}" role="button" tabindex="0" title="点击设为当前生效节点">
                      <div class="node-group-node-top">
                        <span class="node-group-node-name">${escapeHtml(node.name || node.server || node.id)}</span>
                        <span class="node-group-node-latency ${latencyBadge.cls}" id="group-latency-${escapeHtml(group.id)}-${escapeHtml(node.id)}" title="${escapeHtml(latencyBadge.title)}">${escapeHtml(latencyBadge.text)}</span>
                      </div>
                      <div class="node-group-node-meta">${escapeHtml(node.server || '')}${node.port ? `:${escapeHtml(String(node.port))}` : ''}</div>
                      <div class="node-group-node-meta">${escapeHtml(String((node.type || '').toUpperCase() || 'UNKNOWN'))} · 本地 ${escapeHtml(String(node.localPort || node.local_port || '-'))}${node.id === group.selectedNodeId ? ' · 当前生效' : ''}</div>
                      <button type="button" class="node-group-node-test-fab" data-node-id="${escapeHtml(node.id)}" title="测试该节点延迟" aria-label="测试该节点延迟">
                        <i class="ph ph-activity"></i>
                      </button>
                      <button type="button" class="node-group-country-override-fab" data-node-id="${escapeHtml(node.id)}" title="校准地区" aria-label="校准地区">
                        <i class="ph ph-flag-banner"></i>
                      </button>
                    </article>`;
                    }).join('')
                  : '<div class="routing-section-note">该组暂无节点</div>'}
              </div>
            </div>
          </details>`;
      };

  nodeGroupsList.innerHTML = `
    <div class="node-group-cards">
      ${filteredGroups.map(renderGroupCard).join('')}
    </div>`;

  nodeGroupsList.querySelectorAll('.node-group-card').forEach((card) => {
    const groupId = card.dataset.groupId;
    if (!groupId) return;
    card.addEventListener('toggle', () => {
      if (card.open) {
        nodeGroupExpandedIds.add(groupId);
      } else {
        nodeGroupExpandedIds.delete(groupId);
      }
    });
  });

  nodeGroupsList.querySelectorAll('.node-group-node-card-select').forEach((card) => {
    const handleSelect = async () => {
      const groupId = card.dataset.groupId;
      const selectedNodeId = card.dataset.nodeId;
      if (!groupId || !selectedNodeId) return;
      await requestJson('/api/node-groups/selection', { method: 'PUT', body: JSON.stringify({ id: groupId, selectedNodeId }) });
      await loadNodeGroups();
    };
    card.addEventListener('click', handleSelect);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect();
      }
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-country-override-fab').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await setNodeCountryOverride(button.dataset.nodeId);
      await loadNodeGroups();
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-test-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await testNodeGroupNodes(button.dataset.groupId);
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-sort-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      nodeGroupSortByLatency = !nodeGroupSortByLatency;
      renderNodeGroups();
      showToast(nodeGroupSortByLatency ? '已启用按延迟排序' : '已关闭按延迟排序', 'info');
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-node-test-fab').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await testSingleNodeInGroup(button.dataset.nodeId);
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-delete-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      await requestJson('/api/node-groups', { method: 'DELETE', body: JSON.stringify({ id: button.dataset.groupId }) });
      await loadNodeGroups();
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-edit-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const group = nodeGroups.find((item) => item.id === button.dataset.groupId);
      if (!group) return;
      const payload = await showNodeGroupConfigModal('edit', group);
      if (!payload) return;
      await requestJson('/api/node-groups', { method: 'PUT', body: JSON.stringify({ id: group.id, ...payload }) });
      await loadNodeGroups();
    });
  });
};

const renderRoutingObservability = () => {
  if (!routingObservability || !routingObservabilityLines) return;
  routingObservability.classList.remove('hidden');

  if (routingObservabilityStatus) {
    const isRunning = currentCoreState?.status === 'running';
    routingObservabilityStatus.innerHTML = `<span class="status-indicator ${isRunning ? 'active' : ''}"></span> ${isRunning ? '实时监控中' : '核心未运行'}`;
  }

  if (routingLogMode) {
    const mode = getRoutingMode();
    routingLogMode.textContent = mode === 'rule' ? '规则分流' : mode === 'global' ? '全局接管' : mode === 'direct' ? '直连退出' : mode;
    routingLogMode.className = `routing-log-summary-value ${mode === 'rule' ? 'is-good' : mode === 'direct' ? 'is-warn' : 'is-muted'}`;
  }

  if (routingLogSystemProxy) {
    const enabled = Boolean(currentCoreState?.proxy?.systemProxyEnabled);
    routingLogSystemProxy.textContent = enabled ? '已启用' : '未启用';
    routingLogSystemProxy.className = `routing-log-summary-value ${enabled ? 'is-good' : 'is-warn'}`;
  }

  if (routingLogCoreStatus) {
    const running = currentCoreState?.status === 'running';
    routingLogCoreStatus.textContent = running ? '运行中' : '未运行';
    routingLogCoreStatus.className = `routing-log-summary-value ${running ? 'is-good' : 'is-bad'}`;
  }

  const query = routingLogSearchQuery.trim().toLowerCase();

  if (routingHits.length) {
    const groupedHits = new Map();
    routingHits.forEach((hit) => {
      const key = `${hit.kind}:${hit.name}->${hit.outboundName || hit.outbound || hit.target}`;
      if (!groupedHits.has(key)) {
        groupedHits.set(key, {
          ...hit,
          groupKey: key,
          count: 0,
          hosts: new Set(),
          items: []
        });
      }
      const group = groupedHits.get(key);
      group.count += 1;
      group.hosts.add(hit.host);
      group.items.push(hit);
    });

    const filteredGroups = Array.from(groupedHits.values()).filter((group) => {
      const kindMatch = routingLogKindQuery === 'all' || String(group.kind || '') === routingLogKindQuery;
      if (!kindMatch) {
        return false;
      }
      const haystacks = [group.name, group.outboundName || group.outbound || group.target, ...Array.from(group.hosts), group.rule || '', group.rulePayload || '', group.matchedTag || '', group.matchType || '', group.matchValue || '']
        .map((value) => String(value || '').toLowerCase());
      return !query || haystacks.some((value) => value.includes(query));
    });

    if (routingLogResultCount) {
      const filteredHitCount = filteredGroups.reduce((sum, item) => sum + item.count, 0);
      routingLogResultCount.textContent = query || routingLogKindQuery !== 'all'
        ? `显示 ${filteredHitCount} / ${routingHits.length} 条命中`
        : `共 ${routingHits.length} 条命中`;
    }

    if (!filteredGroups.length) {
      routingObservabilityLines.innerHTML = query
        ? `<div class="routing-log-empty">没有找到匹配 <strong>${escapeHtml(routingLogSearchQuery)}</strong> 的命中</div>`
        : '<div class="routing-log-empty">暂无自定义规则命中日志。请确认系统代理正在走规则分流，并实际访问能命中你自定义规则的域名或 IP。</div>';
      return;
    }

    const queryPattern = query ? new RegExp(escapeRegExp(routingLogSearchQuery.trim()), 'gi') : null;
    const highlight = (text) => {
      const escaped = escapeHtml(text);
      return queryPattern ? escaped.replace(queryPattern, (match) => `<span class="routing-log-highlight">${match}</span>`) : escaped;
    };

    if (routingLogViewMode === 'timeline') {
      routingHitCountSnapshot = new Map(Array.from(groupedHits.entries()).map(([key, group]) => [key, group.count]));
      const timelineItems = filteredGroups
        .flatMap((group) => group.items)
        .sort((a, b) => {
          const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
          const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
          return tb - ta;
        })
        .slice(0, 80);

      routingObservabilityLines.innerHTML = timelineItems.map((item) => {
        const timeText = item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
          : '--:--:--';
        return `
          <div class="routing-timeline-row">
            <span class="routing-timeline-time">时间 ${highlight(timeText)}</span>
            <span class="routing-chip is-accent">${highlight(item.kind || '')}</span>
            <span class="routing-hit-name">${highlight(item.name || '')}</span>
            <span class="routing-hit-arrow">→</span>
            <span class="routing-hit-target">${highlight(item.outboundName || item.outbound || item.target || '')}</span>
            <span class="routing-hit-detail-host">${highlight(item.host || '')}${item.port ? `:${highlight(String(item.port))}` : ''}</span>
            ${item.matchedTag ? `<span class="routing-hit-detail-meta">tag=${highlight(String(item.matchedTag))}</span>` : ''}
            ${item.persisted ? '<span class="routing-chip">历史</span>' : ''}
          </div>`;
      }).join('');
      return;
    }

    const nextCountSnapshot = new Map(Array.from(groupedHits.entries()).map(([key, group]) => [key, group.count]));
    routingObservabilityLines.innerHTML = filteredGroups.map((group, index) => {
      const hosts = Array.from(group.hosts);
      const sampleHosts = hosts.slice(0, 3);
      const moreCount = hosts.length - sampleHosts.length;
      const detailId = `routing-hit-detail-${index}`;
      const previousCount = routingHitCountSnapshot.get(group.groupKey) || 0;
      const bumped = group.count > previousCount;
      return `
        <details class="routing-hit-card">
          <summary class="routing-hit-header">
            <div class="routing-hit-title">
              <span class="routing-chip is-accent">${highlight(group.kind)}</span>
              <span class="routing-hit-name">${highlight(group.name)}</span>
              <span class="routing-hit-arrow">→</span>
              <span class="routing-hit-target">${highlight(group.outboundName || group.outbound || group.target)}</span>
            </div>
            <div class="routing-hit-count${bumped ? ' is-bump' : ''}">${group.count} 次命中</div>
          </summary>
          <div class="routing-hit-hosts">
            ${sampleHosts.map((host) => `<span class="routing-hit-host">${highlight(host)}</span>`).join('')}
            ${moreCount > 0 ? `<span class="routing-hit-host-more">+${moreCount}</span>` : ''}
          </div>
          <div class="routing-hit-details" id="${detailId}">
            <div class="routing-hit-details-title">最近命中</div>
            ${group.items
              .slice()
              .sort((a, b) => {
                const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
                const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
                return tb - ta;
              })
              .slice(0, 10)
              .map((item) => `
                <div class="routing-hit-detail-row">
                  <span class="routing-hit-detail-host">${highlight(item.host)}${item.port ? `:${highlight(String(item.port))}` : ''}</span>
                  <span class="routing-hit-detail-meta">${item.timestamp ? highlight(new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })) : '--:--:--'}</span>
                  <span class="routing-hit-detail-meta">${highlight(item.outboundName || item.outbound || item.target)}</span>
                  ${item.matchedTag ? `<span class="routing-hit-detail-meta">tag=${highlight(String(item.matchedTag))}</span>` : ''}
                  ${item.matchType && item.matchValue ? `<span class="routing-hit-detail-meta">match=${highlight(`${item.matchType}:${item.matchValue}`)}</span>` : ''}
                  ${item.persisted ? '<span class="routing-chip">历史</span>' : ''}
                </div>`).join('')}
          </div>
        </details>`;
    }).join('');
    routingHitCountSnapshot = nextCountSnapshot;
    return;
  }

  // Parse and group
  const groups = new Map();
  const unparsedLines = [];
  
  routingObservabilityEntries.forEach(line => {
    const match = line.match(/\[Routing Hit\]\s+(.*?):(.*?) -> (.*?)\s+\|\s+(.*)/);
    if (match) {
      const kind = match[1].trim();
      const name = match[2].trim();
      const target = match[3].trim();
      const host = match[4].trim();
      
      const key = `${kind}:${name}->${target}`;
      if (!groups.has(key)) {
        groups.set(key, {
          groupKey: key,
          kind,
          name,
          target,
          count: 0,
          hosts: new Set(),
          rawLines: []
        });
      }
      const group = groups.get(key);
      group.count++;
      group.hosts.add(host);
      group.rawLines.push(line);
    } else {
      unparsedLines.push(line);
    }
  });

  // Filter groups
  const filteredGroups = [];
  groups.forEach(group => {
    if (routingLogKindQuery !== 'all' && String(group.kind || '') !== routingLogKindQuery) {
      return;
    }
    const hostsArray = Array.from(group.hosts);
    const matchesQuery = !query || 
      group.name.toLowerCase().includes(query) || 
      group.target.toLowerCase().includes(query) || 
      hostsArray.some(h => h.toLowerCase().includes(query));
      
    if (matchesQuery) {
      filteredGroups.push({
        ...group,
        hostsArray
      });
    }
  });
  
  const filteredUnparsed = unparsedLines.filter(line => !query || line.toLowerCase().includes(query));

  const totalFiltered = filteredGroups.reduce((sum, g) => sum + g.count, 0) + filteredUnparsed.length;
  const totalEntries = routingObservabilityEntries.length;

  if (routingLogResultCount) {
    routingLogResultCount.textContent = query
      ? `显示 ${totalFiltered} / ${totalEntries} 条命中`
      : (totalEntries ? `共 ${totalEntries} 条命中` : '暂无日志');
  }

  if (totalFiltered === 0) {
    if (query) {
      routingObservabilityLines.innerHTML = `<div class="routing-log-empty">没有找到匹配 <strong>${escapeHtml(routingLogSearchQuery)}</strong> 的日志</div>`;
      return;
    }
    routingObservabilityLines.innerHTML = '<div class="routing-log-empty">暂无自定义规则命中日志。请确认系统代理正在走规则分流，并实际访问能命中你自定义规则的域名或 IP。</div>';
    return;
  }

  const queryPattern = query ? new RegExp(escapeRegExp(routingLogSearchQuery.trim()), 'gi') : null;
  
  const highlight = (text) => {
    if (!queryPattern) return escapeHtml(text);
    return escapeHtml(text).replace(queryPattern, (match) => `<span class="routing-log-highlight">${match}</span>`);
  };

  let html = '';

  if (routingLogViewMode === 'timeline') {
    const timelineFallbackItems = [];
    filteredGroups.forEach((group) => {
      (group.rawLines || []).forEach((line) => {
        const timeMatch = String(line).match(/(\d{2}:\d{2}:\d{2})/);
        timelineFallbackItems.push({
          time: timeMatch ? timeMatch[1] : '--:--:--',
          kind: group.kind,
          name: group.name,
          target: group.target,
          line
        });
      });
    });

    if (timelineFallbackItems.length) {
      html += timelineFallbackItems.slice(0, 80).map((item) => `
        <div class="routing-timeline-row">
          <span class="routing-timeline-time">时间 ${highlight(item.time)}</span>
          <span class="routing-chip is-accent">${highlight(item.kind)}</span>
          <span class="routing-hit-name">${highlight(item.name)}</span>
          <span class="routing-hit-arrow">→</span>
          <span class="routing-hit-target">${highlight(item.target)}</span>
        </div>
      `).join('');
    }

    filteredUnparsed.forEach((line) => {
      const timeMatch = String(line).match(/(\d{2}:\d{2}:\d{2})/);
      const timeText = timeMatch ? timeMatch[1] : '--:--:--';
      html += `<div class="routing-timeline-row"><span class="routing-timeline-time">时间 ${highlight(timeText)}</span><span class="routing-log-line">${highlight(line)}</span></div>`;
    });

    routingObservabilityLines.innerHTML = html;
    return;
  }

  // Render grouped cards
  filteredGroups.forEach(group => {
    const displayHosts = group.hostsArray.slice(0, 3);
    const moreCount = group.hostsArray.length - 3;
    
    const previousCount = routingHitCountSnapshot.get(group.groupKey) || 0;
    const bumped = group.count > previousCount;
    html += `
      <div class="routing-hit-card">
        <div class="routing-hit-header">
          <div class="routing-hit-title">
            <span class="routing-chip is-accent">${highlight(group.kind)}</span>
            <span class="routing-hit-name">${highlight(group.name)}</span>
            <span class="routing-hit-arrow">→</span>
            <span class="routing-hit-target">${highlight(group.target)}</span>
          </div>
          <div class="routing-hit-count${bumped ? ' is-bump' : ''}">${group.count} 次命中</div>
        </div>
        <div class="routing-hit-hosts">
          ${displayHosts.map(h => `<span class="routing-hit-host">${highlight(h)}</span>`).join('')}
          ${moreCount > 0 ? `<span class="routing-hit-host-more">+${moreCount}</span>` : ''}
        </div>
      </div>
    `;
  });
  
  // Render unparsed lines
  filteredUnparsed.forEach(line => {
    let formattedLine = escapeHtml(line);
    if (queryPattern) {
      formattedLine = formattedLine.replace(queryPattern, (match) => `<span class="routing-log-highlight">${match}</span>`);
    } else {
      formattedLine = formattedLine.replace(/\[Routing\]/g, '<span class="log-tag">[Routing]</span>');
      formattedLine = formattedLine.replace(/proxy/gi, '<span class="log-action-proxy">proxy</span>');
      formattedLine = formattedLine.replace(/direct/gi, '<span class="log-action-direct">direct</span>');
    }
    html += `<div class="routing-log-line">${formattedLine}</div>`;
  });

  routingObservabilityLines.innerHTML = html;
  routingHitCountSnapshot = new Map(Array.from(groups.entries()).map(([key, group]) => [key, group.count]));
};

const updateRoutingLogSearchControls = () => {
  if (routingLogSearchClearBtn) {
    routingLogSearchClearBtn.classList.toggle('hidden', !routingLogSearchQuery.trim());
  }
};

const updateRoutingLogViewModeButtons = () => {
  const isStats = routingLogViewMode !== 'timeline';
  routingLogViewStatsBtn?.classList.toggle('active', isStats);
  routingLogViewTimelineBtn?.classList.toggle('active', !isStats);
};

const markRoutingHitsAsSeen = (hits = routingHits) => {
  hits.forEach((hit) => {
    if (hit?.id) {
      routingLogSeenIds.add(String(hit.id));
    }
  });
  routingLogUnreadCount = 0;
};

const updateRoutingLogNavBadge = (animate = false) => {
  if (!routingLogNavBadge) {
    return;
  }
  const count = Math.max(0, Number(routingLogUnreadCount) || 0);
  routingLogNavBadge.classList.toggle('hidden', count === 0);
  if (count > 0) {
    routingLogNavBadge.textContent = count > 99 ? '99+' : String(count);
    if (animate) {
      routingLogNavBadge.classList.remove('ping');
      void routingLogNavBadge.offsetWidth;
      routingLogNavBadge.classList.add('ping');
    }
  }
};

const applyRoutingLogSearch = debounce((value) => {
  routingLogSearchQuery = value;
  updateRoutingLogSearchControls();
  renderRoutingObservability();
}, 250);

const stopRoutingStatusPolling = () => {
  if (routingStatusPoller) {
    clearInterval(routingStatusPoller);
    routingStatusPoller = null;
  }
};

const startRoutingStatusPolling = () => {
  stopRoutingStatusPolling();
  routingStatusPoller = setInterval(() => {
    if (!document.getElementById('routing-logs-view')?.classList.contains('active')) {
      stopRoutingStatusPolling();
      return;
    }
    loadSystemStatus();
  }, 8000);
};

const formatRate = (bytesPerSec) => {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) {
    return '0 B/s';
  }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSec;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[unit]}`;
};

const renderSpeedSparkline = () => {
  const bars = document.querySelectorAll('.speed-sparkline span');
  if (!bars.length) {
    return;
  }
  const max = Math.max(1, ...speedHistory);
  bars.forEach((bar, index) => {
    const v = speedHistory[index] || 0;
    const pct = Math.max(14, Math.min(100, Math.round((v / max) * 100)));
    bar.style.height = `${pct}%`;
  });
};

const stopTrafficPolling = () => {
  if (trafficPoller) {
    clearInterval(trafficPoller);
    trafficPoller = null;
  }
};

const updateSpeedCard = (downloadRate = 0, uploadRate = 0) => {
  if (dashSpeedValue) {
    dashSpeedValue.textContent = `↓ ${formatRate(downloadRate)} · ↑ ${formatRate(uploadRate)}`;
  }
  speedHistory = [...speedHistory.slice(1), downloadRate];
  renderSpeedSparkline();
};

const pollTraffic = async () => {
  if (!document.getElementById('dashboard-view')?.classList.contains('active')) {
    return;
  }
  if (currentCoreState?.status !== 'running') {
    lastTrafficSample = null;
    updateSpeedCard(0, 0);
    return;
  }

  try {
    const payload = await requestJson('/api/core/traffic');
    const sample = payload.traffic || null;
    const nowMs = Date.now();
    if (!sample || !Number.isFinite(Number(sample.uploadBytes)) || !Number.isFinite(Number(sample.downloadBytes))) {
      return;
    }

    if (lastTrafficSample) {
      const elapsedSec = Math.max(0.001, (nowMs - lastTrafficSample.tsMs) / 1000);
      const downRate = Math.max(0, (Number(sample.downloadBytes) - lastTrafficSample.downloadBytes) / elapsedSec);
      const upRate = Math.max(0, (Number(sample.uploadBytes) - lastTrafficSample.uploadBytes) / elapsedSec);
      updateSpeedCard(downRate, upRate);
    }

    lastTrafficSample = {
      tsMs: nowMs,
      uploadBytes: Number(sample.uploadBytes),
      downloadBytes: Number(sample.downloadBytes)
    };
  } catch {
    // keep previous visual state if polling fails temporarily
  }
};

const startTrafficPolling = () => {
  if (trafficPoller) {
    return;
  }
  pollTraffic();
  trafficPoller = setInterval(pollTraffic, TRAFFIC_POLL_INTERVAL_MS);
};

const applyRoutingPreset = (presetId) => {
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

const moveRoutingRule = (ruleId, offset) => {
  const index = routingRules.findIndex((rule) => rule.id === ruleId);
  const targetIndex = index + offset;
  if (index === -1 || targetIndex < 0 || targetIndex >= routingRules.length) return;
  const nextRules = [...routingRules];
  const [rule] = nextRules.splice(index, 1);
  nextRules.splice(targetIndex, 0, rule);
  routingRules = nextRules;
  routingDirty = true;
  renderRoutingRules();
};

const moveRoutingRuleset = (rulesetId, offset) => {
  const index = routingRulesets.findIndex((ruleset) => ruleset.id === rulesetId);
  const targetIndex = index + offset;
  if (index === -1 || targetIndex < 0 || targetIndex >= routingRulesets.length) return;
  const nextRulesets = [...routingRulesets];
  const [ruleset] = nextRulesets.splice(index, 1);
  nextRulesets.splice(targetIndex, 0, ruleset);
  routingRulesets = nextRulesets;
  routingDirty = true;
  renderRoutingRules();
};

const closeRoutingRuleModal = () => {
  editingRoutingRuleId = null;
  routingRuleModal?.classList.remove('active');
  if (routingRuleModalError) {
    routingRuleModalError.textContent = '';
    routingRuleModalError.classList.add('hidden');
  }
};

const openRoutingRuleModal = (rule = null) => {
  editingRoutingRuleId = rule?.id || null;
  if (routingRuleModalTitle) {
    routingRuleModalTitle.textContent = rule ? '编辑分流规则' : '新增分流规则';
  }
  if (routingRuleModalType) routingRuleModalType.value = rule?.type || 'domain_suffix';
  if (routingRuleModalAction) routingRuleModalAction.value = rule?.action || 'default';
  if (routingRuleModalValue) routingRuleModalValue.value = rule?.value || '';
  if (routingRuleModalNode) {
    if ((rule?.action || 'default') === 'node_group') {
      routingRuleModalNode.innerHTML = ['<option value="">选择节点组</option>', ...nodeGroups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === (rule?.nodeGroupId || '') ? 'selected' : ''}>${escapeHtml(getNodeGroupDisplayName(group))}</option>`)].join('');
    } else {
      routingRuleModalNode.innerHTML = ['<option value="">选择节点</option>', ...routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === (rule?.nodeId || '') ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`)].join('');
    }
  }
  if (routingRuleModalNodeField) routingRuleModalNodeField.classList.toggle('hidden', !['node', 'node_group'].includes(rule?.action || 'default'));
  if (routingRuleModalNote) routingRuleModalNote.value = rule?.note || '';
  if (routingRuleModalError) {
    routingRuleModalError.textContent = '';
    routingRuleModalError.classList.add('hidden');
  }
  routingRuleModal?.classList.add('active');
  routingRuleModalValue?.focus();
};

const submitRoutingRuleModal = () => {
  const draft = createRoutingRuleDraft({
    id: editingRoutingRuleId || undefined,
    type: routingRuleModalType?.value,
    action: routingRuleModalAction?.value,
    value: routingRuleModalValue?.value,
    nodeId: routingRuleModalAction?.value === 'node' ? routingRuleModalNode?.value : '',
    nodeGroupId: routingRuleModalAction?.value === 'node_group' ? routingRuleModalNode?.value : '',
    note: routingRuleModalNote?.value
  });
  const errors = validateRoutingRule(draft);
  if (Object.keys(errors).length) {
    if (routingRuleModalError) {
      routingRuleModalError.textContent = errors.value || errors.type || errors.action || '请修正规则内容';
      routingRuleModalError.classList.remove('hidden');
    }
    return;
  }

  if (editingRoutingRuleId) {
    routingRules = routingRules.map((rule) => rule.id === editingRoutingRuleId ? draft : rule);
  } else {
    routingRules.push(draft);
  }
  routingRuleErrors = buildRoutingRuleErrors(routingRules);
  routingDirty = true;
  closeRoutingRuleModal();
  renderRoutingRules();
};

const enableRuleRoutingFlow = async ({ enableSystemProxy = false } = {}) => {
  const patch = { routingMode: 'rule' };
  if (enableSystemProxy) {
    patch.systemProxyEnabled = true;
  }
  try {
    const payload = await requestJson('/api/system/settings', {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    updateCoreStatus(payload.core);
    renderRoutingRules();
    showToast(enableSystemProxy ? '已启用系统代理并切换到规则分流' : '已切换到规则分流模式', 'success');
  } catch (error) {
    showToast(`切换规则分流失败: ${error.message}`, 'error');
  }
};

const renderRoutingModeBanner = () => {
  if (!routingModeBanner) return;
  const mode = getRoutingMode();
  const systemProxyEnabled = Boolean(currentCoreState?.proxy?.systemProxyEnabled);
  const coreStatus = currentCoreState?.status || 'stopped';
  routingModeBanner.className = 'routing-mode-banner';
  let copy = '';
  let keywords = [];
  let modeLabel = '规则状态';
  let modeIcon = 'ph ph-compass-tool';
  const actions = [];

  if (coreStatus !== 'running') {
    actions.push('<button type="button" class="btn-outline" data-routing-action="start-core">启动核心</button>');
  }

  if (!routingRules.length && !routingRulesets.length) {
    modeLabel = '未配置规则';
    modeIcon = 'ph ph-path';
    copy = '当前还没有分流规则。可以先新增规则，或者用右上角预设模板快速生成一组起步规则。';
    keywords = ['分流规则', '预设模板'];
    routingModeBanner.classList.add('is-inactive');
  } else if (!systemProxyEnabled) {
    modeLabel = '系统代理未启用';
    modeIcon = 'ph ph-plugs-connected';
    copy = '系统代理当前未启用：规则已经保存，但统一入口没有开启，所以这些规则不会被命中。';
    keywords = ['系统代理未启用', '不会被命中'];
    routingModeBanner.classList.add('is-direct');
    actions.push('<button type="button" class="btn-primary" data-routing-action="enable-system-proxy-rule">启用系统代理</button>');
  } else if (mode === 'rule') {
    modeLabel = '规则分流模式';
    modeIcon = 'ph ph-radar';
    routingModeBanner.classList.add('is-active');
    copy = '当前处于规则分流模式：规则集和手写规则正在参与系统代理统一入口的流量分发。';
    keywords = ['规则分流模式', '规则集', '手写规则'];
  } else if (mode === 'direct') {
    modeLabel = '直连退出模式';
    modeIcon = 'ph ph-arrow-bend-up-left';
    routingModeBanner.classList.add('is-direct');
    copy = '当前处于直连退出模式：规则仍可编辑，但系统代理流量会全部直连，不使用这些规则。';
    keywords = ['直连退出模式', '全部直连'];
  } else {
    modeLabel = '全局接管模式';
    modeIcon = 'ph ph-globe-hemisphere-west';
    routingModeBanner.classList.add('is-inactive');
    copy = '当前处于全局接管模式：规则仍可编辑，但系统代理流量会统一走当前默认节点，不使用这些规则。';
    keywords = ['全局接管模式', '当前默认节点'];
  }

  let highlightedCopy = escapeHtml(copy);
  keywords.forEach((keyword) => {
    const escapedKeyword = escapeRegExp(keyword);
    highlightedCopy = highlightedCopy.replace(new RegExp(escapedKeyword, 'g'), `<span class="routing-mode-keyword">${escapeHtml(keyword)}</span>`);
  });

  routingModeBanner.innerHTML = `
    <div class="routing-mode-head"><i class="${modeIcon}"></i><span>${escapeHtml(modeLabel)}</span></div>
    <div class="routing-mode-copy">${highlightedCopy}</div>
    ${actions.length ? `<div class="routing-mode-actions">${actions.join('')}</div>` : ''}
  `;

    routingModeBanner.querySelectorAll('[data-routing-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.routingAction;
      if (action === 'enable-system-proxy-rule') {
        await enableRuleRoutingFlow({ enableSystemProxy: true });
      } else if (action === 'start-core') {
        await runCoreAction('start');
      }
    });
  });
};

const renderRoutingRulesetsSection = () => {
  const errorsByRuleset = routingRulesetErrors.rulesetErrors || {};
  const entryErrorsByRuleset = routingRulesetErrors.entryErrors || {};
  const buildNodeGroupOptions = (selectedGroupId = '') => [
    '<option value="">选择节点组</option>',
    ...nodeGroups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === selectedGroupId ? 'selected' : ''}>${escapeHtml(getNodeGroupDisplayName(group))}</option>`)
  ].join('');
  const buildNodeOptions = (selectedNodeId = '') => [
    '<option value="">选择节点</option>',
    ...routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === selectedNodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`)
  ].join('');

  return `
    <div class="routing-section">
      <div class="routing-section-header">
        <div>
          <div class="routing-section-title">规则集分流</div>
          <div class="routing-section-note">这些规则集只对系统代理入口生效，可绑定默认代理、直连或指定节点。</div>
        </div>
      </div>
      ${routingRulesets.length ? routingRulesets.map((ruleset, index) => {
        const rulesetErrors = errorsByRuleset[ruleset.id] || {};
        const entryErrors = entryErrorsByRuleset[ruleset.id] || {};
        const builtinOptions = [
          '<option value="">选择内置规则集</option>',
          ...routingBuiltinRulesets.map((builtin) => `<option value="${escapeHtml(builtin.id)}" ${builtin.id === ruleset.presetId ? 'selected' : ''}>${escapeHtml(builtin.name)}</option>`)
        ].join('');
        const rulesetKindLabel = ruleset.kind === 'builtin' ? '内置规则集' : '自定义规则集';
        return `
          <div class="routing-ruleset-card" data-ruleset-id="${escapeHtml(ruleset.id)}">
            <div class="routing-ruleset-inline">
              <span class="routing-chip ${ruleset.kind === 'builtin' ? 'is-builtin' : 'is-custom'}">${ruleset.kind === 'builtin' ? '内置' : '自定义'}</span>
              <input class="routing-input routing-ruleset-name-inline ${rulesetErrors.name ? 'has-error' : ''}" data-ruleset-field="name" data-ruleset-id="${escapeHtml(ruleset.id)}" value="${escapeHtml(ruleset.name)}" ${ruleset.kind === 'custom' ? '' : 'readonly'}>
              <select class="routing-select routing-ruleset-target-inline ${rulesetErrors.target ? 'has-error' : ''}" data-ruleset-field="target" data-ruleset-id="${escapeHtml(ruleset.id)}">
                <option value="default" ${ruleset.target === 'default' ? 'selected' : ''}>默认代理</option>
                <option value="direct" ${ruleset.target === 'direct' ? 'selected' : ''}>直连</option>
                <option value="node" ${ruleset.target === 'node' ? 'selected' : ''}>指定节点</option>
                <option value="node_group" ${ruleset.target === 'node_group' ? 'selected' : ''}>节点组</option>
              </select>
              ${ruleset.target === 'node'
                ? `<select class="routing-select routing-ruleset-dest-inline ${rulesetErrors.nodeId ? 'has-error' : ''}" data-ruleset-field="nodeId" data-ruleset-id="${escapeHtml(ruleset.id)}">${buildNodeOptions(ruleset.nodeId)}</select>`
                : ruleset.target === 'node_group'
                  ? `<select class="routing-select routing-ruleset-dest-inline ${rulesetErrors.groupId ? 'has-error' : ''}" data-ruleset-field="groupId" data-ruleset-id="${escapeHtml(ruleset.id)}">${buildNodeGroupOptions(ruleset.groupId)}</select>`
                  : '<span class="routing-ruleset-inline-note">不指定目标</span>'}
              <label class="routing-ruleset-inline-switch">
                <input type="checkbox" data-ruleset-field="enabled" data-ruleset-id="${escapeHtml(ruleset.id)}" ${ruleset.enabled ? 'checked' : ''}>
                <span>启用</span>
              </label>
              <div class="routing-ruleset-actions routing-ruleset-actions-inline">
                <button type="button" class="btn-outline routing-action-btn routing-ruleset-move-up-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-outline routing-action-btn routing-ruleset-move-down-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" ${index === routingRulesets.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-outline routing-delete-ruleset-btn" data-ruleset-id="${escapeHtml(ruleset.id)}">删除</button>
              </div>
            </div>
            <div class="routing-field-error">${escapeHtml(rulesetErrors.name || rulesetErrors.target || rulesetErrors.nodeId || rulesetErrors.groupId || rulesetErrors.presetId || '')}</div>
            ${ruleset.kind === 'custom' ? `
              <div class="routing-ruleset-entries">
                <div class="routing-note">自定义规则集条目会按类型和值合并成 sing-box 内联规则集。</div>
                <div class="routing-field-error">${escapeHtml(rulesetErrors.entries || '')}</div>
                ${(ruleset.entries || []).map((entry) => {
                  const entryError = entryErrors[entry.id] || {};
                  return `
                    <div class="routing-ruleset-entry" data-ruleset-entry-id="${escapeHtml(entry.id)}">
                      <select class="routing-select ${entryError.type ? 'has-error' : ''}" data-ruleset-entry-field="type" data-ruleset-id="${escapeHtml(ruleset.id)}" data-ruleset-entry-id="${escapeHtml(entry.id)}">
                        <option value="domain" ${entry.type === 'domain' ? 'selected' : ''}>精确域名</option>
                        <option value="domain_suffix" ${entry.type === 'domain_suffix' ? 'selected' : ''}>域名后缀</option>
                        <option value="domain_keyword" ${entry.type === 'domain_keyword' ? 'selected' : ''}>域名关键词</option>
                        <option value="ip_cidr" ${entry.type === 'ip_cidr' ? 'selected' : ''}>IP/CIDR</option>
                      </select>
                      <input class="routing-input ${entryError.value ? 'has-error' : ''}" data-ruleset-entry-field="value" data-ruleset-id="${escapeHtml(ruleset.id)}" data-ruleset-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(entry.value)}" placeholder="例如 corp.local 或 10.0.0.0/8">
                      <div class="routing-ruleset-entry-actions">
                        <button type="button" class="btn-outline routing-delete-ruleset-entry-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" data-ruleset-entry-id="${escapeHtml(entry.id)}">删除</button>
                      </div>
                    </div>
                    <div class="routing-field-error">${escapeHtml(entryError.type || entryError.value || '')}</div>`;
                }).join('')}
                <div class="routing-ruleset-entry-actions">
                  <button type="button" class="btn-outline routing-add-ruleset-entry-btn" data-ruleset-id="${escapeHtml(ruleset.id)}">新增条目</button>
                </div>
              </div>` : ''}
          </div>`;
      }).join('') : '<div class="routing-section-empty">还没有规则集。你可以先添加一个内置规则集并指定它走哪个节点。</div>'}
    </div>`;
};

const renderRoutingRules = () => {
  if (!routingRulesContainer || !routingLoading || !routingEmpty || !routingError) return;
  try {
    routingLoading.classList.toggle('hidden', !routingLoadingState);
    routingError.classList.add('hidden');
    const hasRoutingContent = routingRules.length > 0 || routingRulesets.length > 0;
    routingEmpty.classList.toggle('hidden', routingLoadingState || hasRoutingContent);
    routingRulesContainer.classList.toggle('hidden', routingLoadingState || !hasRoutingContent);
    updateRoutingSaveState();
    renderRoutingModeBanner();
    if (routingLoadingState || !hasRoutingContent) {
      routingRulesContainer.innerHTML = '';
      return;
    }

    const manualRulesMarkup = routingRules.length ? routingRules.map((rule, index) => {
      const errors = routingRuleErrors[rule.id] || {};
      return `
      <div class="routing-rule-card" data-rule-id="${escapeHtml(rule.id)}">
        <div class="routing-rule-head">
          <div>
            <div class="routing-rule-title">规则 ${index + 1}</div>
            <div class="routing-note">按列表顺序匹配，命中后走对应动作。</div>
          </div>
          <div class="routing-rule-actions">
            <div class="routing-action-group">
              <button type="button" class="btn-outline routing-action-btn routing-move-up-btn" data-rule-id="${escapeHtml(rule.id)}" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn-outline routing-action-btn routing-move-down-btn" data-rule-id="${escapeHtml(rule.id)}" ${index === routingRules.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
            <button type="button" class="btn-outline routing-edit-btn" data-rule-id="${escapeHtml(rule.id)}">编辑</button>
            <button type="button" class="btn-outline routing-delete-btn" data-rule-id="${escapeHtml(rule.id)}">删除规则</button>
          </div>
        </div>
        <div class="routing-rule-grid">
          <label class="routing-field">
            <span class="routing-field-label">规则类型</span>
            <select class="routing-select ${errors.type ? 'has-error' : ''}" data-field="type" data-rule-id="${escapeHtml(rule.id)}">
              <option value="domain" ${rule.type === 'domain' ? 'selected' : ''}>精确域名</option>
              <option value="domain_suffix" ${rule.type === 'domain_suffix' ? 'selected' : ''}>域名后缀</option>
              <option value="domain_keyword" ${rule.type === 'domain_keyword' ? 'selected' : ''}>域名关键词</option>
              <option value="ip_cidr" ${rule.type === 'ip_cidr' ? 'selected' : ''}>IP/CIDR</option>
            </select>
            <span class="routing-field-error">${escapeHtml(errors.type || '')}</span>
          </label>
          <label class="routing-field">
            <span class="routing-field-label">匹配内容</span>
            <input class="routing-input ${errors.value ? 'has-error' : ''}" data-field="value" data-rule-id="${escapeHtml(rule.id)}" value="${escapeHtml(rule.value)}" placeholder="${rule.type === 'ip_cidr' ? '例如 10.0.0.0/8' : '例如 example.com'}" autocomplete="off">
            <span class="routing-field-error">${escapeHtml(errors.value || '')}</span>
          </label>
          <label class="routing-field">
            <span class="routing-field-label">动作</span>
            <select class="routing-select ${errors.action ? 'has-error' : ''}" data-field="action" data-rule-id="${escapeHtml(rule.id)}">
              <option value="default" ${rule.action === 'default' ? 'selected' : ''}>默认代理</option>
              <option value="direct" ${rule.action === 'direct' ? 'selected' : ''}>直连</option>
              <option value="node" ${rule.action === 'node' ? 'selected' : ''}>指定节点</option>
              <option value="node_group" ${rule.action === 'node_group' ? 'selected' : ''}>节点组</option>
            </select>
            <span class="routing-field-error">${escapeHtml(errors.action || '')}</span>
          </label>
          <label class="routing-field">
            <span class="routing-field-label">节点 / 备注</span>
            ${rule.action === 'node'
              ? `<select class="routing-select ${errors.nodeId ? 'has-error' : ''}" data-field="nodeId" data-rule-id="${escapeHtml(rule.id)}"><option value="">选择节点</option>${routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === rule.nodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`).join('')}</select>`
              : rule.action === 'node_group'
              ? `<select class="routing-select ${errors.nodeGroupId ? 'has-error' : ''}" data-field="nodeGroupId" data-rule-id="${escapeHtml(rule.id)}"><option value="">选择节点组</option>${nodeGroups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === rule.nodeGroupId ? 'selected' : ''}>${escapeHtml(getNodeGroupDisplayName(group))}</option>`).join('')}</select>`
              : `<input class="routing-input" data-field="note" data-rule-id="${escapeHtml(rule.id)}" value="${escapeHtml(rule.note)}" placeholder="可选，便于区分规则" autocomplete="off">`}
            <span class="routing-field-error">${escapeHtml(errors.nodeId || errors.nodeGroupId || '')}</span>
          </label>
        </div>
      </div>`;
    }).join('') : '<div class="routing-section-empty">还没有手写域名/IP 规则。需要做精细覆盖时再新增即可。</div>';

    routingRulesContainer.innerHTML = `${renderRoutingRulesetsSection()}
    <div class="routing-section">
      <div class="routing-section-header">
        <div>
          <div class="routing-section-title">手写域名 / IP 规则</div>
          <div class="routing-section-note">这些规则优先于规则集，用于覆盖特殊域名或地址段，只作用于系统代理入口。</div>
        </div>
      </div>
      ${manualRulesMarkup}
    </div>`;

    routingRulesContainer.querySelectorAll('[data-field]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, (event) => {
      const ruleId = input.dataset.ruleId;
      const field = input.dataset.field;
      const targetRule = routingRules.find((item) => item.id === ruleId);
      if (!targetRule || !field) return;
      targetRule[field] = event.target.value;
      routingRuleErrors = buildRoutingRuleErrors(routingRules);
      routingDirty = true;
      renderRoutingRules();
    });
  });

    routingRulesContainer.querySelectorAll('.routing-delete-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const ruleId = button.dataset.ruleId;
      routingRules = routingRules.filter((rule) => rule.id !== ruleId);
      delete routingRuleErrors[ruleId];
      routingDirty = true;
      renderRoutingRules();
    });
  });

    routingRulesContainer.querySelectorAll('.routing-move-up-btn').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRule(button.dataset.ruleId, -1));
  });

    routingRulesContainer.querySelectorAll('.routing-move-down-btn').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRule(button.dataset.ruleId, 1));
  });

    routingRulesContainer.querySelectorAll('.routing-edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const rule = routingRules.find((item) => item.id === button.dataset.ruleId);
      if (rule) openRoutingRuleModal(rule);
    });
  });

    routingRulesContainer.querySelectorAll('[data-ruleset-field]').forEach((input) => {
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => {
      const ruleset = routingRulesets.find((item) => item.id === input.dataset.rulesetId);
      if (!ruleset) return;
      const field = input.dataset.rulesetField;
      ruleset[field] = field === 'enabled' ? event.target.checked : event.target.value;
      if (field === 'target') {
        if (ruleset.target === 'node_group') {
          ruleset.nodeId = '';
        } else if (ruleset.target === 'node') {
          ruleset.groupId = '';
        } else {
          ruleset.nodeId = '';
          ruleset.groupId = '';
        }
      }
      if (field === 'presetId' && ruleset.kind === 'builtin') {
        const builtin = getBuiltinRulesetById(ruleset.presetId);
        if (builtin) ruleset.name = builtin.name;
      }
      const nextErrors = buildRoutingRulesetErrors(routingRulesets);
      routingRulesetErrors = nextErrors;
      routingDirty = true;
      renderRoutingRules();
    });
  });

    routingRulesContainer.querySelectorAll('.routing-delete-ruleset-btn').forEach((button) => {
    button.addEventListener('click', () => {
      routingRulesets = routingRulesets.filter((ruleset) => ruleset.id !== button.dataset.rulesetId);
      routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
      routingDirty = true;
      renderRoutingRules();
    });
  });

    routingRulesContainer.querySelectorAll('.routing-ruleset-move-up-btn').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRuleset(button.dataset.rulesetId, -1));
  });

    routingRulesContainer.querySelectorAll('.routing-ruleset-move-down-btn').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRuleset(button.dataset.rulesetId, 1));
  });

    routingRulesContainer.querySelectorAll('.routing-add-ruleset-entry-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const ruleset = routingRulesets.find((item) => item.id === button.dataset.rulesetId);
      if (!ruleset) return;
      ruleset.entries.push(createRoutingRulesetEntryDraft());
      routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
      routingDirty = true;
      renderRoutingRules();
    });
  });

    routingRulesContainer.querySelectorAll('[data-ruleset-entry-field]').forEach((input) => {
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => {
      const ruleset = routingRulesets.find((item) => item.id === input.dataset.rulesetId);
      const entry = ruleset?.entries.find((item) => item.id === input.dataset.rulesetEntryId);
      if (!ruleset || !entry) return;
      entry[input.dataset.rulesetEntryField] = event.target.value;
      routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
      routingDirty = true;
      renderRoutingRules();
    });
  });

    routingRulesContainer.querySelectorAll('.routing-delete-ruleset-entry-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const ruleset = routingRulesets.find((item) => item.id === button.dataset.rulesetId);
      if (!ruleset) return;
      ruleset.entries = ruleset.entries.filter((entry) => entry.id !== button.dataset.rulesetEntryId);
      routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
      routingDirty = true;
      renderRoutingRules();
    });
  });

    renderRoutingObservability();
  } catch (error) {
    console.error('[RoutingUI] render failed', error);
    routingLoadingState = false;
    showRoutingError(`分流页面渲染失败: ${error.message}`);
  }
};

const showRoutingError = (message) => {
  if (!routingError || !routingLoading || !routingEmpty || !routingRulesContainer) return;
  routingLoading.classList.add('hidden');
  routingEmpty.classList.add('hidden');
  routingRulesContainer.classList.add('hidden');
  routingError.classList.remove('hidden');
  const messageEl = routingError.querySelector('.state-msg');
  if (messageEl) messageEl.textContent = message;
};

const loadRoutingRules = async (force = false) => {
  if (!force && routingLoaded && !routingDirty) {
    renderRoutingRules();
    return;
  }
  if (routingLoadingState) {
    return;
  }
  routingLoadingState = true;
  routingRuleErrors = {};
  routingRulesetErrors = { rulesetErrors: {}, entryErrors: {} };
  renderRoutingRules();
  try {
    const payload = await requestJson('/api/system/rules');
    routingRules = (payload.customRules || payload.rules || []).map((rule) => createRoutingRuleDraft(rule));
    routingRulesets = (payload.rulesets || []).map((ruleset) => createRoutingRulesetDraft(ruleset));
    nodeGroups = payload.nodeGroups || nodeGroups;
    routingBuiltinRulesets = payload.builtinRulesets || [];
    routingNodeOptions = payload.core?.nodes || currentCoreState?.nodes || [];
    renderRoutingRulesetPresetOptions();
    routingRuleErrors = buildRoutingRuleErrors(routingRules);
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    if (payload.core) {
      updateCoreStatus(payload.core);
    }
    routingObservabilityEntries = extractRoutingObservability(payload.core);
    routingLoaded = true;
    routingDirty = false;
  } catch (error) {
    showRoutingError(`分流规则加载失败: ${error.message}`);
  } finally {
    routingLoadingState = false;
    updateRoutingSaveState();
    renderRoutingModeBanner();
    renderRoutingRules();
  }
};

const saveRoutingRules = async () => {
  if (routingSavingState) return;
  const normalized = routingRules.map((rule) => normalizeRoutingRule(rule));
  const nextErrors = buildRoutingRuleErrors(normalized);
  routingRuleErrors = nextErrors;
  const normalizedRulesets = routingRulesets.map((ruleset) => ({
    id: String(ruleset.id || `ruleset-${Date.now()}-${routingRulesetCounter++}`),
    kind: ruleset.kind,
    presetId: ruleset.kind === 'builtin' ? String(ruleset.presetId || '').trim() : null,
    name: String(ruleset.name || '').trim(),
    enabled: ruleset.enabled !== false,
    target: ruleset.target,
    nodeId: ruleset.target === 'node' ? String(ruleset.nodeId || '').trim() : null,
    groupId: ruleset.target === 'node_group' ? String(ruleset.groupId || '').trim() : null,
    entries: ruleset.kind === 'custom' ? (ruleset.entries || []).map((entry) => normalizeRoutingRulesetEntry(entry)) : [],
    note: String(ruleset.note || '').trim()
  }));
  const nextRulesetErrors = buildRoutingRulesetErrors(normalizedRulesets);
  routingRulesetErrors = nextRulesetErrors;
  if (Object.values(nextErrors).some((errors) => Object.keys(errors).length > 0)
    || Object.values(nextRulesetErrors.rulesetErrors || {}).some((errors) => Object.keys(errors).length > 0)
    || Object.values(nextRulesetErrors.entryErrors || {}).some((group) => Object.values(group).some((errors) => Object.keys(errors).length > 0))) {
    routingDirty = true;
    renderRoutingRules();
    showToast('请先修正分流规则中的错误', 'error');
    return;
  }

  routingSavingState = true;
  updateRoutingSaveState();
  try {
    const payload = await requestJson('/api/system/rules', {
      method: 'PUT',
      body: JSON.stringify({ customRules: normalized, rulesets: normalizedRulesets })
    });
    routingRules = (payload.customRules || payload.rules || []).map((rule) => createRoutingRuleDraft(rule));
    routingRulesets = (payload.rulesets || []).map((ruleset) => createRoutingRulesetDraft(ruleset));
    nodeGroups = payload.nodeGroups || nodeGroups;
    routingBuiltinRulesets = payload.builtinRulesets || routingBuiltinRulesets;
    routingNodeOptions = payload.core?.nodes || currentCoreState?.nodes || routingNodeOptions;
    renderRoutingRulesetPresetOptions();
    routingRuleErrors = buildRoutingRuleErrors(routingRules);
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = false;
    routingSavedFlashUntil = Date.now() + 3000;
    updateCoreStatus(payload.core);
    routingObservabilityEntries = extractRoutingObservability(payload.core);
    renderRoutingRules();

    setTimeout(() => {
      if (Date.now() >= routingSavedFlashUntil) {
        updateRoutingSaveState();
      }
    }, 3100);

    if (payload.autoRestarted) {
      showToast('分流规则已保存并自动应用到核心', 'success');
    } else if (getRoutingMode() !== 'rule') {
      showToast('分流规则已保存，切换到“规则分流”后才会生效', 'info');
    } else {
      showToast('分流规则已保存', 'success');
    }
  } catch (error) {
    showToast(`分流规则保存失败: ${error.message}`, 'error');
  } finally {
    routingSavingState = false;
    updateRoutingSaveState();
  }
};

const flagFromCountryCode = (countryCode) => {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) {
    return null;
  }

  return String.fromCodePoint(...[...normalized].map((char) => 0x1F1E6 + char.charCodeAt(0) - 65));
};

const nodeGroupDisplayNames = (() => {
  try {
    return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'region' });
  } catch {
    return null;
  }
})();

const getNodeGroupDisplayName = (group) => {
  if (!group || typeof group !== 'object') {
    return '';
  }

  const code = String(group.countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/u.test(code) && nodeGroupDisplayNames) {
    return nodeGroupDisplayNames.of(code) || code;
  }

  const fromName = String(group.name || '').match(/^国家\/([A-Za-z]{2})$/u)?.[1];
  if (fromName && nodeGroupDisplayNames) {
    const normalized = fromName.toUpperCase();
    return nodeGroupDisplayNames.of(normalized) || normalized;
  }

  return String(group.name || '').trim();
};

const renderGeoIpStatus = (status = geoIpStatus) => {
  geoIpStatus = status || null;
  if (!routingGeoIpNote) return;

  if (!geoIpStatus) {
    routingGeoIpNote.textContent = 'GeoIP: --';
    if (geoIpRefreshBtn) geoIpRefreshBtn.disabled = false;
    return;
  }

  if (geoIpStatus.pending) {
    routingGeoIpNote.textContent = 'GeoIP: 更新中...';
  } else if (geoIpStatus.ready) {
    routingGeoIpNote.textContent = geoIpStatus.downloadedAt
      ? `GeoIP: ${new Date(geoIpStatus.downloadedAt).toLocaleString('zh-CN')}`
      : 'GeoIP: 已就绪';
  } else if (geoIpStatus.lastError) {
    routingGeoIpNote.textContent = `GeoIP: 失败`;
  } else {
    routingGeoIpNote.textContent = 'GeoIP: --';
  }

  if (geoIpRefreshBtn) {
    geoIpRefreshBtn.disabled = Boolean(geoIpStatus.pending);
    geoIpRefreshBtn.textContent = geoIpStatus.pending ? 'GeoIP 下载中...' : '刷新 GeoIP';
  }
};

const renderRulesetDatabaseStatus = (status = rulesetDatabaseStatus) => {
  rulesetDatabaseStatus = status || null;
  if (!routingDbNote) return;

  if (!rulesetDatabaseStatus) {
    routingDbNote.textContent = '上次更新 --';
    if (rulesetDbRefreshBtn) rulesetDbRefreshBtn.disabled = false;
    return;
  }

  if (rulesetDatabaseStatus.pending) {
    routingDbNote.textContent = '更新中...';
  } else if (rulesetDatabaseStatus.ready) {
    routingDbNote.textContent = rulesetDatabaseStatus.downloadedAt
      ? `上次更新 ${new Date(rulesetDatabaseStatus.downloadedAt).toLocaleString('zh-CN')}`
      : '上次更新 --';
  } else if (rulesetDatabaseStatus.lastError) {
    routingDbNote.textContent = `更新失败：${rulesetDatabaseStatus.lastError}`;
  } else {
    routingDbNote.textContent = '上次更新 --';
  }

  if (rulesetDbRefreshBtn) {
    rulesetDbRefreshBtn.disabled = Boolean(rulesetDatabaseStatus.pending);
    rulesetDbRefreshBtn.textContent = rulesetDatabaseStatus.pending ? '规则库下载中...' : '更新规则库';
  }
};

const renderSystemProxyNodeOptions = (nodes, activeNodeId) => {
  if (!dashActiveNodeSelect) return;

  const currentValue = activeNodeId || '';
  dashActiveNodeSelect.innerHTML = [
    '<option value="">默认首个节点</option>',
    ...nodes.map((node) => {
      const label = node.name || node.server || node.id;
      return `<option value="${node.id}">${label}</option>`;
    })
  ].join('');
  dashActiveNodeSelect.value = currentValue;
};

// Restart warning state
let isRestartRequired = false;
const updateRestartWarning = (required) => {
  if (required === undefined) return;
  isRestartRequired = required;
  if (isRestartRequired) {
    saveRestartBtn.classList.add('pulse-warning');
    saveRestartBtn.textContent = '保存并重启代理器 (需重启)';
  } else {
    saveRestartBtn.classList.remove('pulse-warning');
    saveRestartBtn.textContent = '保存并重启代理器';
  }
};

const syncNodeMutationFeedback = (payload, successMessage) => {
  if (payload.core) {
    updateCoreStatus(payload.core);
  }

  if (payload.autoRestarted) {
    updateRestartWarning(false);
    showToast('节点变更已自动应用到核心', 'success');
    return;
  }

  updateRestartWarning(payload.restartRequired);
  if (successMessage) {
    showToast(successMessage, 'success');
  }
};

const renderProxyEndpoints = (proxyProfile = {}) => {
  const listenHost = proxyProfile.listenHost || '127.0.0.1';
  const defaultEndpoint = proxyProfile.systemDefaultEndpoint || {
    protocol: 'http',
    host: listenHost,
    port: proxyProfile.unifiedHttpPort || 20101,
    url: `http://${listenHost}:${proxyProfile.unifiedHttpPort || 20101}`
  };
  if (sidebarDefaultProxy) {
    sidebarDefaultProxy.textContent = defaultEndpoint.url;
  }
};

const updateCoreStatus = (core) => {
  if (!core) return;
  currentCoreState = core;
  coreStatusIndicator.className = 'status-dot tooltip';
  const dashSwitch = document.getElementById('master-switch');
  const dashText = document.getElementById('master-status-text');
  const systemProxy = core.systemProxy || {};
  const proxyProfile = core.proxy || {};
  const activeNode = proxyProfile.activeNode;

  renderProxyEndpoints(proxyProfile);

  if (systemProxyModeSelect && proxyProfile.mode) {
    systemProxyModeSelect.value = proxyProfile.mode;
  }

   renderRoutingModeBanner();

  if (dashActiveNodeSelect) {
    dashActiveNodeSelect.value = proxyProfile.activeNodeId || '';
  }

  // Update auto-start toggle if settings are available in the broader scope or passed core
  if (autoStartToggle && core.settings) {
    autoStartToggle.checked = !!core.settings.autoStart;
  } else if (autoStartToggle && currentCoreState?.settings) {
     autoStartToggle.checked = !!currentCoreState.settings.autoStart;
  }

  if (uptimeTimer) {
    clearInterval(uptimeTimer);
    uptimeTimer = null;
  }

  const renderUptime = () => {
    if (!dashUptime) return;
    if (!core.startedAt) {
      dashUptime.textContent = '00:00:00';
      return;
    }

    const diff = Math.max(0, Date.now() - new Date(core.startedAt).getTime());
    const totalSeconds = Math.floor(diff / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    dashUptime.textContent = `${hours}:${minutes}:${seconds}`;
  };

  renderUptime();
  if (core.status === 'running' && core.startedAt) {
    uptimeTimer = setInterval(renderUptime, 1000);
  }

  if (core.status === 'running' && systemProxy.enabled) {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if(dashSwitch) {
      dashSwitch.classList.remove('off');
      dashSwitch.classList.add('on');
      dashText.textContent = '系统代理接管中';
      dashText.className = 'status-pill is-running';
    }
  } else if (core.status === 'running') {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '核心运行中，系统代理未接管';
      dashText.className = 'status-pill is-idle';
    }
  } else if (core.status === 'crashed') {
    coreStatusIndicator.classList.add('crashed');
    coreStatusIndicator.title = '多次崩溃，需手动重启';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎已崩溃，请手动重启';
      dashText.className = 'status-pill is-error';
    }
  } else if (core.status === 'error') {
    coreStatusIndicator.classList.add('error');
    coreStatusIndicator.title = '异常终止';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎运行异常';
      dashText.className = 'status-pill is-error';
    }
  } else {
    coreStatusIndicator.classList.add('stopped');
    coreStatusIndicator.title = systemProxy.enabled ? '核心已停止，检测到外部系统代理' : '已停止';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = systemProxy.enabled ? '核心已停止，系统代理仍被外部占用' : '系统代理已关闭';
      dashText.className = 'status-pill is-off';
    }
  }
};

// Modal Elements
const editModal = document.querySelector('#edit-modal');
const editJsonInput = document.querySelector('#edit-json-input');
const editCountryOverrideInput = document.querySelector('#edit-node-country-override');
const saveNodeBtn = document.querySelector('#save-node-btn');
const closeModalBtns = document.querySelectorAll('#close-modal-top, .cancel-modal-btn');
let currentEditNodeId = null;

window.showToast = (message, type = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => {
      if (toast.parentNode) toast.remove();
    });
  }, 3000);
};

let nodesData = [];
let groupsData = [];
let nodeSearchQuery = '';
let selectedNodeIds = new Set();
let currentGroup = null;

const groupTabsEl = document.querySelector('#group-tabs');
const addGroupBtn = document.querySelector('#add-group-btn');

const renderGroupTabs = () => {
  if (!groupTabsEl) return;
  // Merge stored groups with groups derived from nodes (preserve order, no duplicates)
  const nodeGroups = nodesData.map(n => n.group).filter(Boolean);
  const allGroups = [...new Set([...groupsData, ...nodeGroups])];
  const hasUngrouped = nodesData.some(n => !n.group);

  const tabs = [
    { key: null, label: '全部', count: nodesData.length }
  ];
  for (const g of allGroups) {
    tabs.push({ key: g, label: g, count: nodesData.filter(n => n.group === g).length, renameable: true });
  }
  if (hasUngrouped) {
    tabs.push({ key: '__ungrouped__', label: '未分组', count: nodesData.filter(n => !n.group).length });
  }

  groupTabsEl.innerHTML = tabs.map(t => {
    const isActive = activeGroupTab === t.key;
    const actions = t.renameable ? `<span class="group-tab-actions">
      <button class="group-tab-action-btn group-rename-btn" data-group="${t.key}" title="重命名">✎</button>
      <button class="group-tab-action-btn group-delete-btn" data-group="${t.key}" title="删除">✕</button>
    </span>` : '';
    return `<button type="button" class="group-tab${isActive ? ' active' : ''}" data-key="${t.key ?? ''}">${t.label}<span class="group-tab-count">${t.count}</span>${actions}</button>`;
  }).join('');

  // Tab 切换
  groupTabsEl.querySelectorAll('.group-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.group-tab-actions')) return;
      const key = btn.dataset.key === '' ? null : btn.dataset.key;
      activeGroupTab = key;
      currentGroup = key === null || key === '__ungrouped__' ? null : key;
      renderGroupTabs();
      renderNodesElement();
    });
  });

  // 重命名
  groupTabsEl.querySelectorAll('.group-rename-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const oldName = btn.dataset.group;
      const newName = await showInputModal(`重命名分组 "${oldName}"`, oldName);
      if (!newName || newName.trim() === oldName) return;
      try {
        await requestJson('/api/groups/rename', { method: 'PUT', body: JSON.stringify({ from: oldName, to: newName.trim() }) });
        if (activeGroupTab === oldName) { activeGroupTab = newName.trim(); currentGroup = newName.trim(); }
        showToast('分组已重命名', 'success');
        loadNodes();
      } catch (err) { showToast(`重命名失败: ${err.message}`, 'error'); }
    });
  });

  // 删除
  groupTabsEl.querySelectorAll('.group-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.group;
      if (!await showConfirmModal(`删除分组 "${name}"`, '该分组下的所有节点将移入未分组。')) return;
      try {
        await requestJson('/api/groups', { method: 'DELETE', body: JSON.stringify({ name }) });
        if (activeGroupTab === name) { activeGroupTab = null; currentGroup = null; }
        showToast('分组已删除', 'success');
        loadNodes();
      } catch (err) { showToast(`删除失败: ${err.message}`, 'error'); }
    });
  });
};

addGroupBtn?.addEventListener('click', async () => {
  const name = await showInputModal('新建分组名称');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  try {
    const payload = await requestJson('/api/groups', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
    groupsData = payload.groups || groupsData;
    activeGroupTab = trimmed;
    currentGroup = trimmed;
    renderGroupTabs();
  } catch (error) {
    showToast(`创建分组失败: ${error.message}`, 'error');
  }
});

const showInlineMessage = (target, message, tone = '') => {
  target.textContent = message;
  target.className = tone ? `state-msg ${tone}` : 'state-msg';
  target.classList.remove('hidden');
};

const showConfirmModal = (title, body) => new Promise((resolve) => {
  const overlay = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-body').textContent = body;
  overlay.classList.add('active');
  const finish = (val) => {
    overlay.classList.remove('active');
    document.getElementById('confirm-modal-ok').replaceWith(document.getElementById('confirm-modal-ok').cloneNode(true));
    document.getElementById('confirm-modal-cancel').replaceWith(document.getElementById('confirm-modal-cancel').cloneNode(true));
    resolve(val);
  };
  document.getElementById('confirm-modal-ok').addEventListener('click', () => finish(true));
  document.getElementById('confirm-modal-cancel').addEventListener('click', () => finish(false));
});

const showInputModal = (title, defaultValue = '') => new Promise((resolve) => {
  const overlay = document.getElementById('input-modal');
  const titleEl = document.getElementById('input-modal-title');
  const field = document.getElementById('input-modal-field');
  const confirmBtn = document.getElementById('input-modal-confirm');
  const cancelBtn = document.getElementById('input-modal-cancel');
  const closeBtn = document.getElementById('input-modal-close');

  titleEl.textContent = title;
  field.value = defaultValue;
  overlay.classList.add('active');
  setTimeout(() => { field.focus(); field.select(); }, 50);

  const finish = (value) => {
    overlay.classList.remove('active');
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    closeBtn.replaceWith(closeBtn.cloneNode(true));
    resolve(value);
  };

  document.getElementById('input-modal-confirm').addEventListener('click', () => finish(field.value));
  document.getElementById('input-modal-cancel').addEventListener('click', () => finish(null));
  document.getElementById('input-modal-close').addEventListener('click', () => finish(null));
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(field.value); if (e.key === 'Escape') finish(null); }, { once: true });
});

const showNodeGroupConfigModal = (mode = 'create', group = null) => new Promise((resolve) => {
  if (!nodeGroupModal) {
    resolve(null);
    return;
  }

  editingNodeGroupId = group?.id || null;
  nodeGroupModalTitle.textContent = mode === 'edit' ? '编辑节点组' : '新增节点组';
  nodeGroupModalConfirm.textContent = mode === 'edit' ? '保存配置' : '创建节点组';

  const currentType = String(group?.type || 'custom');
  nodeGroupModalName.value = String(group?.name || '');
  nodeGroupModalType.value = currentType === 'country' ? 'country' : 'custom';
  nodeGroupModalCountry.value = String(group?.countryCode || '').toUpperCase();
  nodeGroupModalIconMode.value = String(group?.iconMode || 'auto');
  nodeGroupModalIconEmoji.value = String(group?.iconEmoji || '');
  nodeGroupModalNote.value = String(group?.note || '');

  const selectedNodeId = String(group?.selectedNodeId || '');
  nodeGroupModalDefaultNode.innerHTML = [
    '<option value="">创建后再选择</option>',
    ...routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === selectedNodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`)
  ].join('');

  const updateNodeGroupModalFields = () => {
    const isCountry = nodeGroupModalType.value === 'country';
    nodeGroupModalCountry.disabled = !isCountry;
    if (!isCountry) {
      nodeGroupModalCountry.value = '';
    }
    nodeGroupModalEmojiWrap.classList.toggle('hidden', nodeGroupModalIconMode.value !== 'emoji');
  };

  updateNodeGroupModalFields();
  nodeGroupModalError.classList.add('hidden');
  nodeGroupModal.classList.add('active');
  setTimeout(() => nodeGroupModalName.focus(), 50);

  const finish = (value) => {
    nodeGroupModal.classList.remove('active');
    nodeGroupModalConfirm.onclick = null;
    nodeGroupModalCancel.onclick = null;
    nodeGroupModalClose.onclick = null;
    nodeGroupModalType.onchange = null;
    nodeGroupModalIconMode.onchange = null;
    editingNodeGroupId = null;
    resolve(value);
  };

  const submit = () => {
    const name = String(nodeGroupModalName.value || '').trim();
    const type = nodeGroupModalType.value === 'country' ? 'country' : 'custom';
    const countryCode = String(nodeGroupModalCountry.value || '').trim().toUpperCase();
    const iconMode = ['auto', 'emoji', 'none'].includes(nodeGroupModalIconMode.value) ? nodeGroupModalIconMode.value : 'auto';
    const iconEmoji = String(nodeGroupModalIconEmoji.value || '').trim();
    const note = String(nodeGroupModalNote.value || '').trim();
    const selectedNodeId = String(nodeGroupModalDefaultNode.value || '').trim();

    if (!name && !(type === 'country' && countryCode)) {
      showInlineMessage(nodeGroupModalError, '请填写节点组名称', 'error');
      return;
    }
    if (type === 'country' && countryCode && !/^[A-Z]{2}$/u.test(countryCode)) {
      showInlineMessage(nodeGroupModalError, '国家代码必须是 2 位字母（如 JP / US）', 'error');
      return;
    }
    if (iconMode === 'emoji' && !iconEmoji) {
      showInlineMessage(nodeGroupModalError, '图标样式为 Emoji 时请填写图标', 'error');
      return;
    }

    const payload = {
      name,
      type,
      countryCode: type === 'country' ? (countryCode || null) : null,
      iconMode,
      iconEmoji: iconMode === 'emoji' ? iconEmoji : '',
      note,
      selectedNodeId: selectedNodeId || null
    };
    finish(payload);
  };

  nodeGroupModalConfirm.onclick = submit;
  nodeGroupModalCancel.onclick = () => finish(null);
  nodeGroupModalClose.onclick = () => finish(null);
  nodeGroupModalType.onchange = updateNodeGroupModalFields;
  nodeGroupModalIconMode.onchange = updateNodeGroupModalFields;
});

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body;
};

// Obscure IP to match the screenshot design pattern
const maskAddress = (address) => {
  if (!address) return '未知地址';
  const parts = address.split('.');
  if (parts.length === 4 && !parts.some(isNaN)) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (address.length > 8) {
    return address.substring(0, 4) + '***' + address.substring(address.length - 4);
  }
  return address;
};

// 当前激活的分组 Tab，null = 全部
let activeGroupTab = null;

const renderNodeRow = (node, activeNodeId) => {
  const protText = (node.type || 'SOCKS').toUpperCase();
  const transText = (node.transport || 'tcp').toLowerCase();
  let secText = '-';
  if (node.security && node.security !== 'none') secText = node.security.toLowerCase();
  else if (node.tls) secText = 'tls';
  const maskedIp = maskAddress(node.server);
  const localPortStr = node.localPort ? node.localPort : (node.port || '未知');
  const isActive = node.id === activeNodeId;
  const activeClass = isActive ? 'active-row' : '';
  const activeBadge = isActive ? `<span class="pill pill-active"><i class="ph ph-lightning"></i> 此刻生效</span>` : '';
  const allGroups = [...new Set([...groupsData, ...nodesData.map(n => n.group).filter(Boolean)])];
  const flagEmoji = node.flagEmoji || flagFromCountryCode(node.countryCode);
  const flagTitle = node.countryName || node.countryCode || 'GeoIP 数据准备中';
  const countryOverrideBadge = node.countryOverridden ? '<span class="pill pill-dark">手动国家</span>' : '';
  const groupMenuItems = [
    `<div class="group-menu-item${!node.group ? ' active' : ''}" data-group="">未分组</div>`,
    ...allGroups.map(g => `<div class="group-menu-item${node.group === g ? ' active' : ''}" data-group="${g}">${g}</div>`)
  ].join('');
  return `
    <tr data-id="${node.id}" class="node-row ${activeClass}">
      <td class="node-check-cell"><input type="checkbox" class="node-checkbox" data-id="${node.id}"></td>
      <td><span class="pill pill-protocol">${protText}</span>${activeBadge}</td>
      <td>
        <div class="node-info">
          <div class="node-primary-line">
            <span class="node-flag${flagEmoji ? '' : ' is-placeholder'}" title="${flagTitle}">${flagEmoji || '---'}</span>
            <span class="node-name">${node.name || '未命名节点'}</span>
          </div>
          <span class="node-ip">${maskedIp}</span>
          <span class="node-port">本地出口: ${localPortStr}</span>${countryOverrideBadge}
        </div>
      </td>
      <td>
        <span class="pill pill-dark">${transText}</span>
        <span class="pill pill-dark">${secText}</span>
      </td>
      <td><span class="latency" id="test-result-${node.id}">-</span></td>
      <td class="row-actions-cell">
        <div class="row-actions">
          <button type="button" class="row-action-btn share-node-btn" data-id="${node.id}" title="复制代理链接"><i class="ph ph-share-network"></i></button>
          <button type="button" class="row-action-btn test-node-btn" data-id="${node.id}" title="测试延迟"><i class="ph ph-activity"></i></button>
          <button type="button" class="row-action-btn country-node-btn" data-id="${node.id}" title="修正国家归属"><i class="ph ph-flag-banner"></i></button>
          <button type="button" class="row-action-btn detail-node-btn" data-id="${node.id}" title="编辑详情"><i class="ph ph-pencil-simple"></i></button>
          <div class="move-group-wrap" data-id="${node.id}">
            <button type="button" class="row-action-btn move-group-btn" data-id="${node.id}" title="移至分组"><i class="ph ph-folder-simple-arrow"></i></button>
            <div class="group-menu">${groupMenuItems}</div>
          </div>
          <button type="button" class="row-action-btn btn-danger-icon delete-node-btn" data-id="${node.id}" title="删除"><i class="ph ph-trash"></i></button>
        </div>
      </td>
    </tr>`;
};

const copyNodeShareLink = async (id) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node?.shareLink) {
    showToast('该节点暂不支持分享链接', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(node.shareLink);
    showToast('代理链接已复制', 'success');
  } catch (error) {
    showToast(`复制失败: ${error.message || '请检查剪贴板权限'}`, 'error');
  }
};

const setNodeCountryOverride = async (id) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node) {
    return;
  }

  const currentValue = String(node.countryCodeOverride || node.countryCode || '').trim().toUpperCase();
  const input = await showInputModal('设置国家代码（ISO2，留空清除手动覆盖）', currentValue);
  if (input === null) {
    return;
  }

  const normalized = String(input || '').trim().toUpperCase();
  if (normalized && !/^[A-Z]{2}$/u.test(normalized)) {
    showToast('国家代码格式错误，请输入 2 位字母（如 JP / US）', 'error');
    return;
  }

  try {
    const payload = await requestJson('/api/nodes/country', {
      method: 'PUT',
      body: JSON.stringify({ id, countryCode: normalized || null })
    });
    nodesData = payload.nodes || nodesData;
    groupsData = payload.groups || groupsData;
    renderGroupTabs();
    renderNodesElement();
    showToast(normalized ? '国家归属已修正' : '已清除手动国家覆盖', 'success');
  } catch (error) {
    showToast(`国家归属更新失败: ${error.message}`, 'error');
  }
};

const renderNodesElement = () => {
  const nodesGroupEmpty = document.querySelector('#nodes-group-empty');
  const nodesSearchEmpty = document.querySelector('#nodes-search-empty');

  nodesLoading.classList.add('hidden');
  nodesError.classList.add('hidden');
  nodesError.textContent = '';
  nodesGroupEmpty?.classList.add('hidden');
  nodesSearchEmpty?.classList.add('hidden');

  if (nodesData.length === 0) {
    nodesState.classList.remove('hidden');
    nodesEmpty.classList.remove('hidden');
    nodesList.classList.add('hidden');
    nodeCountLabel.textContent = `节点数: 0`;
    return;
  }

  nodesEmpty.classList.add('hidden');

  const activeNodeId = currentCoreState?.proxy?.activeNodeId || null;

  // 按当前 Tab 过滤
  let visibleNodes = activeGroupTab === null
    ? nodesData
    : activeGroupTab === '__ungrouped__'
      ? nodesData.filter(n => !n.group)
      : nodesData.filter(n => n.group === activeGroupTab);

  // 搜索过滤
  const q = nodeSearchQuery.toLowerCase();
  if (q) {
    visibleNodes = visibleNodes.filter(n =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.server || '').toLowerCase().includes(q)
    );
  }

  // 空状态
  if (visibleNodes.length === 0) {
    nodesState.classList.remove('hidden');
    nodesList.classList.add('hidden');
    nodeCountLabel.textContent = `节点数: ${nodesData.length}`;
    if (q) {
      nodesSearchEmpty?.classList.remove('hidden');
    } else {
      nodesGroupEmpty?.classList.remove('hidden');
    }
    return;
  }

  nodesState.classList.add('hidden');
  nodesList.classList.remove('hidden');
  nodeCountLabel.textContent = `节点数: ${nodesData.length}（显示 ${visibleNodes.length}）`;

  nodesTbody.innerHTML = visibleNodes.map(n => renderNodeRow(n, activeNodeId)).join('');

  nodesTbody.querySelectorAll('.test-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); testNode(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.share-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); copyNodeShareLink(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.delete-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.detail-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.country-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); setNodeCountryOverride(btn.dataset.id); });
  });

  nodesTbody.querySelectorAll('.move-group-wrap').forEach(wrap => {
    const menuBtn = wrap.querySelector('.move-group-btn');
    const menu = wrap.querySelector('.group-menu');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.group-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
    menu.querySelectorAll('.group-menu-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        const nodeId = wrap.dataset.id;
        const group = item.dataset.group || null;
        try {
          const payload = await requestJson('/api/nodes/group', {
            method: 'PUT',
            body: JSON.stringify({ nodeIds: [nodeId], group })
          });
          nodesData = payload.nodes;
          groupsData = payload.groups || groupsData;
          renderGroupTabs();
          renderNodesElement();
          showToast('节点已移至分组', 'success');
        } catch (err) {
          showToast(`移动失败: ${err.message}`, 'error');
        }
      });
    });
  });

  const sortTh = document.getElementById('sort-latency-th');
  if (sortTh && !sortTh.dataset.bound) {
    sortTh.dataset.bound = '1';
    sortTh.addEventListener('click', () => {
      const asc = sortTh.dataset.sort !== 'asc';
      sortTh.dataset.sort = asc ? 'asc' : 'desc';
      sortTh.querySelector('.sort-indicator').textContent = asc ? '↑' : '↓';
      const getMs = id => {
        const el = document.getElementById(`test-result-${id}`);
        const v = parseInt(el?.textContent);
        return isNaN(v) ? (asc ? Infinity : -1) : v;
      };
      nodesData = [...nodesData].sort((a, b) => asc ? getMs(a.id) - getMs(b.id) : getMs(b.id) - getMs(a.id));
      renderNodesElement();
    });
  }

  // Checkboxes
  const selectAllCb = document.getElementById('select-all-nodes');
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
    selectAllCb.addEventListener('change', () => {
      document.querySelectorAll('.node-checkbox').forEach(cb => {
        cb.checked = selectAllCb.checked;
        if (selectAllCb.checked) selectedNodeIds.add(cb.dataset.id);
        else selectedNodeIds.delete(cb.dataset.id);
      });
      updateBulkBar();
    });
  }
  nodesTbody.querySelectorAll('.node-checkbox').forEach(cb => {
    cb.checked = selectedNodeIds.has(cb.dataset.id);
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) selectedNodeIds.add(cb.dataset.id);
      else selectedNodeIds.delete(cb.dataset.id);
      const all = nodesTbody.querySelectorAll('.node-checkbox');
      const checked = [...all].filter(c => c.checked).length;
      if (selectAllCb) {
        selectAllCb.checked = checked === all.length;
        selectAllCb.indeterminate = checked > 0 && checked < all.length;
      }
      updateBulkBar();
    });
  });

  nodesTbody.querySelectorAll('.node-row').forEach(row => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.node-check-cell') || e.target.closest('.row-actions')) return;
      const nodeId = row.dataset.id;
      if (currentCoreState?.proxy?.activeNodeId === nodeId) return;
      try {
        await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ activeNodeId: nodeId })
        });
        showToast('节点切换触发，引擎重载中...', 'info');
        loadNodes();
      } catch (err) {
        showToast(`节点切换失败: ${err.message}`, 'error');
      }
    });
  });
};

const loadNodes = async () => {
  nodesState.classList.remove('hidden');
  nodesLoading.classList.remove('hidden');
  nodesEmpty.classList.add('hidden');
  nodesList.classList.add('hidden');
  nodesError.classList.add('hidden');

  try {
    const payload = await requestJson('/api/nodes');
    nodesData = payload.nodes || [];
    groupsData = payload.groups || [];
    geoIpStatus = payload.geoIp || null;
    selectedNodeIds.clear();
    renderGroupTabs();
    renderNodesElement();
    renderGeoIpStatus(payload.geoIp || null);
    updateCoreStatus(payload.core);
    renderSystemProxyNodeOptions(nodesData, payload.core?.proxy?.activeNodeId);
  } catch (error) {
    nodesState.classList.remove('hidden');
    nodesLoading.classList.add('hidden');
    nodesError.classList.remove('hidden');
    nodesError.textContent = `加载节点失败: ${error.message}`;
  }
};

const loadSystemStatus = async () => {
  try {
    const payload = await requestJson('/api/system/status');
    renderGeoIpStatus(payload.geoIp || payload.core?.geoIp || null);
    renderRulesetDatabaseStatus(payload.rulesetDatabase || payload.core?.rulesetDatabase || null);
    updateCoreStatus(payload.core);
    routingNodeOptions = payload.core?.nodes || routingNodeOptions;
    routingObservabilityEntries = extractRoutingObservability(payload.core);
    renderRoutingObservability();
    await loadRoutingHits();
  } catch (error) {
    showToast(`系统状态加载失败: ${error.message}`, 'error');
  }
};

const refreshGeoIp = async () => {
  if (!geoIpRefreshBtn) return;
  geoIpRefreshBtn.disabled = true;
  geoIpRefreshBtn.textContent = 'GeoIP 下载中...';
  try {
    const payload = await requestJson('/api/system/geoip/refresh', { method: 'POST' });
    renderGeoIpStatus(payload.geoIp || null);
    await loadNodes();
    showToast(payload.geoIp?.ready ? 'GeoIP 数据已刷新' : 'GeoIP 刷新已触发，正在后台准备', 'success');
  } catch (error) {
    renderGeoIpStatus(geoIpStatus);
    showToast(`GeoIP 刷新失败: ${error.message}`, 'error');
  } finally {
    renderGeoIpStatus(geoIpStatus);
  }
};

const refreshRulesetDatabase = async () => {
  if (!rulesetDbRefreshBtn) return;
  rulesetDbRefreshBtn.disabled = true;
  rulesetDbRefreshBtn.textContent = '规则库下载中...';
  try {
    const payload = await requestJson('/api/system/rulesets/refresh', { method: 'POST' });
    renderRulesetDatabaseStatus(payload.rulesetDatabase || null);
    await loadSystemStatus();
    showToast(payload.rulesetDatabase?.ready ? '规则库已刷新' : '规则库刷新已触发，正在后台准备', 'success');
  } catch (error) {
    renderRulesetDatabaseStatus(rulesetDatabaseStatus);
    showToast(`规则库刷新失败: ${error.message}`, 'error');
  } finally {
    renderRulesetDatabaseStatus(rulesetDatabaseStatus);
  }
};

const importLink = async (e) => {
  e.preventDefault();
  const link = importUrlInput.value.trim();
  if (!link) return;

  const btn = importForm.querySelector('button[type="submit"]');
  btn.textContent = '导入中...';
  btn.disabled = true;

  try {
    const payload = await requestJson('/api/nodes/import-link', {
      method: 'POST',
      body: JSON.stringify({ link, group: currentGroup || undefined })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload, `已导入 ${payload.importedCount || 1} 个节点`);
    importUrlInput.value = '';
    importForm.classList.add('hidden');
  } catch (error) {
    showInlineMessage(nodesError, `导入失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = '确定导入';
    btn.disabled = false;
  }
};

const syncSub = async (e) => {
  e.preventDefault();
  const url = syncUrlInput.value.trim();
  if (!url) return;

  const btn = syncForm.querySelector('button[type="submit"]');
  btn.textContent = '同步中...';
  btn.disabled = true;

  try {
    const payload = await requestJson('/api/subscriptions/sync', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    syncUrlInput.value = '';
    syncForm.classList.add('hidden');
    showInlineMessage(nodesError, `已从订阅导入 ${payload.importedCount} 个节点。${payload.autoRestarted ? ' 已自动应用。' : ''}`, 'success');
  } catch (error) {
    showInlineMessage(nodesError, `同步失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = '开始同步';
    btn.disabled = false;
  }
};

const deleteNode = async (id) => {
  if (!confirm('确定要删除此节点吗？')) return;
  try {
    const payload = await requestJson('/api/nodes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload, '节点已删除');
  } catch (error) {
    showInlineMessage(nodesError, `删除失败: ${error.message}`, 'error');
  }
};

const applyLatencyResult = (result) => {
  const resultEl = document.querySelector(`#test-result-${result.id}`);
  if (!resultEl) return;

  resultEl.className = 'latency';
  if (result.ok) {
    resultEl.textContent = `${result.latencyMs}ms`;
    resultEl.classList.add(result.latencyMs < 150 ? 'good' : (result.latencyMs < 400 ? 'warn' : 'bad'));
    return;
  }

  resultEl.textContent = '失败';
  resultEl.classList.add('error');
  resultEl.title = result.error || '测试失败';
};

const resetLatencyPlaceholders = (ids) => {
  ids.forEach((id) => {
    const resultEl = document.querySelector(`#test-result-${id}`);
    if (!resultEl) return;
    resultEl.textContent = '-';
    resultEl.className = 'latency';
    resultEl.title = '';
  });
};

const testNode = async (id) => {
  const resultEl = document.querySelector(`#test-result-${id}`);
  if (!resultEl) return;
  resultEl.textContent = '测试中...';
  resultEl.className = 'latency';

  try {
    const payload = await requestJson('/api/nodes/test', {
      method: 'POST',
      body: JSON.stringify({ id })
    });

    if (payload.core) {
      updateCoreStatus(payload.core);
    }
    if (payload.autoStarted) {
      showToast('已自动启动核心并完成延迟测试', 'success');
    }

    applyLatencyResult({ id, ok: true, latencyMs: payload.latencyMs });
  } catch (error) {
    applyLatencyResult({ id, ok: false, error: error.message || '未知错误' });
    showToast(`延迟测试失败: ${error.message || '未知错误'}`, 'error');
  }
};

const updateBulkBar = () => {
  const bar = document.getElementById('bulk-action-bar');
  const label = document.getElementById('bulk-count-label');
  if (!bar) return;
  if (selectedNodeIds.size === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  label.textContent = `已选 ${selectedNodeIds.size} 个节点`;
  const menu = document.getElementById('bulk-group-menu');
  if (menu) {
    const allGroups = [...new Set([...groupsData, ...nodesData.map(n => n.group).filter(Boolean)])];
    menu.innerHTML = [
      `<div class="group-menu-item" data-group="">未分组</div>`,
      ...allGroups.map(g => `<div class="group-menu-item" data-group="${g}">${g}</div>`)
    ].join('');
    menu.querySelectorAll('.group-menu-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        const group = item.dataset.group || null;
        try {
          const payload = await requestJson('/api/nodes/group', {
            method: 'PUT',
            body: JSON.stringify({ nodeIds: [...selectedNodeIds], group })
          });
          nodesData = payload.nodes;
          groupsData = payload.groups || groupsData;
          selectedNodeIds.clear();
          renderGroupTabs();
          renderNodesElement();
          showToast('批量移至分组完成', 'success');
        } catch (err) { showToast(`移动失败: ${err.message}`, 'error'); }
      });
    });
  }
};

const testAllNodes = async () => {
  let targetNodes = activeGroupTab === null
    ? nodesData
    : activeGroupTab === '__ungrouped__'
      ? nodesData.filter(n => !n.group)
      : nodesData.filter(n => n.group === activeGroupTab);
  if (nodeSearchQuery) {
    const q = nodeSearchQuery.toLowerCase();
    targetNodes = targetNodes.filter(n =>
      (n.name || '').toLowerCase().includes(q) || (n.server || '').toLowerCase().includes(q)
    );
  }
  if (!targetNodes.length) {
    showToast('暂无可测试节点', 'info');
    return;
  }

  if (testAllBtn) {
    testAllBtn.disabled = true;
    testAllBtn.textContent = `测试 0/${targetNodes.length}...`;
  }

  targetNodes.forEach((node) => {
    const resultEl = document.querySelector(`#test-result-${node.id}`);
    if (resultEl) { resultEl.textContent = '测试中...'; resultEl.className = 'latency'; resultEl.title = ''; }
  });

  try {
    const payload = await requestJson('/api/nodes/test-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: targetNodes.map((node) => node.id) })
    });

    if (payload.core) updateCoreStatus(payload.core);

    let done = 0;
    payload.results.forEach(r => {
      applyLatencyResult(r);
      done++;
      if (testAllBtn) testAllBtn.textContent = `测试 ${done}/${targetNodes.length}...`;
    });

    const successCount = payload.results.filter((r) => r.ok).length;
    const failedCount = payload.results.length - successCount;
    const autoStartText = payload.autoStarted ? '，并已自动启动核心' : '';
    showToast(`批量测试完成：成功 ${successCount}，失败 ${failedCount}${autoStartText}`, failedCount ? 'info' : 'success');
  } catch (error) {
    resetLatencyPlaceholders(targetNodes.map((node) => node.id));
    showToast(`批量测试失败: ${error.message}`, 'error');
  } finally {
    if (testAllBtn) {
      testAllBtn.disabled = false;
      testAllBtn.textContent = '批量测试';
    }
  }
};

const runCoreAction = async (action) => {
  const btn = saveRestartBtn;
  const originalText = btn.textContent;
  btn.textContent = '处理中...';
  try {
    const payload = await requestJson(`/api/core/${action}`, { method: 'POST' });
    showToast('操作成功，代理已重启应用。', 'success');
    updateRestartWarning(false);
    updateCoreStatus(payload.core);
    await loadNodes();
  } catch (error) {
    showToast(`操作失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = originalText;
  }
};

showImportBtn?.addEventListener('click', () => {
  importForm.classList.toggle('hidden');
  syncForm.classList.add('hidden');
  if (!importForm.classList.contains('hidden')) importUrlInput.focus();
});

testAllBtn?.addEventListener('click', testAllNodes);

// Bulk action bar
document.getElementById('bulk-move-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('bulk-group-menu');
  if (menu) menu.classList.toggle('open');
});

document.getElementById('bulk-delete-btn')?.addEventListener('click', async () => {
  if (!selectedNodeIds.size) return;
  if (!await showConfirmModal(`删除 ${selectedNodeIds.size} 个节点`, '此操作不可撤销，确认删除所选节点？')) return;
  try {
    await Promise.all([...selectedNodeIds].map(id =>
      requestJson('/api/nodes', { method: 'DELETE', body: JSON.stringify({ id }) })
    ));
    selectedNodeIds.clear();
    await loadNodes();
    showToast('批量删除完成', 'success');
  } catch (err) { showToast(`删除失败: ${err.message}`, 'error'); }
});

document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => {
  selectedNodeIds.clear();
  renderNodesElement();
  updateBulkBar();
});

const nodeSearchInput = document.querySelector('#node-search');
nodeSearchInput?.addEventListener('input', (e) => {
  nodeSearchQuery = e.target.value.trim();
  if (nodeSearchQuery && activeGroupTab !== null) {
    activeGroupTab = null;
    currentGroup = null;
    renderGroupTabs();
  }
  renderNodesElement();
});

showSyncBtn?.addEventListener('click', () => {
  syncForm.classList.toggle('hidden');
  importForm.classList.add('hidden');
  if (!syncForm.classList.contains('hidden')) syncUrlInput.focus();
});

manualAddBtn?.addEventListener('click', () => {
  currentEditNodeId = null;
  const skeleton = {
    type: "vless",
    server: "",
    port: 443,
    uuid: "",
    transport: "tcp",
    security: "none"
  };
  editJsonInput.value = JSON.stringify(skeleton, null, 2);
  const groupInput = document.querySelector('#edit-node-group');
  if (groupInput) groupInput.value = currentGroup || '';
  if (editCountryOverrideInput) editCountryOverrideInput.value = '';
  editModal.classList.add('active');
});

closePanelBtn?.addEventListener('click', () => {
  window.close();
  showToast('即将关闭面板...', 'info');
});

document.querySelectorAll('.cancel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    importForm.classList.add('hidden');
    syncForm.classList.add('hidden');
  });
});

importForm?.addEventListener('submit', importLink);
syncForm?.addEventListener('submit', syncSub);

// Modal logic
const closeModal = () => {
  editModal.classList.remove('active');
  currentEditNodeId = null;
  editJsonInput.value = '';
  const groupInput = document.querySelector('#edit-node-group');
  if (groupInput) groupInput.value = '';
  if (editCountryOverrideInput) editCountryOverrideInput.value = '';
};

closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

const editNodeGroupInput = document.querySelector('#edit-node-group');

const openEditModal = (id) => {
  const node = nodesData.find(n => n.id === id);
  if (!node) return;
  currentEditNodeId = id;
  const editData = { ...node };
  delete editData.countryCode;
  delete editData.countryName;
  delete editData.flagEmoji;
  delete editData.countryOverridden;
  if (editNodeGroupInput) editNodeGroupInput.value = node.group || '';
  if (editCountryOverrideInput) editCountryOverrideInput.value = node.countryCodeOverride || '';
  editJsonInput.value = JSON.stringify(editData, null, 2);
  editModal.classList.add('active');
};

saveNodeBtn?.addEventListener('click', async () => {
  saveNodeBtn.textContent = '保存中...';
  saveNodeBtn.disabled = true;
  
  try {
    const updatedData = JSON.parse(editJsonInput.value);
    const groupValue = editNodeGroupInput ? editNodeGroupInput.value.trim() || null : undefined;
    const countryOverrideValue = editCountryOverrideInput ? editCountryOverrideInput.value.trim().toUpperCase() : '';
    if (countryOverrideValue && !/^[A-Z]{2}$/u.test(countryOverrideValue)) {
      throw new Error('国家代码格式错误，请填写 2 位字母（如 JP / US）');
    }
    if (groupValue !== undefined) updatedData.group = groupValue;
    if (editCountryOverrideInput) updatedData.countryCodeOverride = countryOverrideValue || null;

    let path = '/api/nodes';
    let method = 'PUT';

    // Create Mode
    if (!currentEditNodeId) {
      path = '/api/nodes/raw';
      method = 'POST';
    } else {
      updatedData.id = currentEditNodeId;
    }
    
    const payload = await requestJson(path, {
      method,
      body: JSON.stringify(updatedData)
    });
    
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    closeModal();
    if (!payload.autoRestarted) {
      showToast(currentEditNodeId ? '节点配置已更新。' : '节点已手动添加。', 'success');
    }
  } catch (err) {
    showToast(`保存失败: ${err.message}`, 'error');
  } finally {
    saveNodeBtn.textContent = '保存设置';
    saveNodeBtn.disabled = false;
  }
});

saveRestartBtn?.addEventListener('click', () => {
  runCoreAction('restart');
});

// --- TAURI SHELL ROUTER LOGIC ---
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    btn.classList.add('active');
    
    views.forEach(v => v.classList.remove('active'));
    const targetId = btn.getAttribute('data-target');
    const targetView = document.getElementById(targetId);
    if (targetView) targetView.classList.add('active');
    if (targetId === 'dashboard-view') {
      startTrafficPolling();
      stopRoutingStatusPolling();
      stopNodeGroupAutoTest();
    } else if (targetId === 'routing-view') {
      loadSystemStatus();
      loadRoutingRules(true);
      stopRoutingStatusPolling();
      stopNodeGroupAutoTest();
      stopTrafficPolling();
    } else if (targetId === 'node-groups-view') {
      loadNodeGroups().then(() => {
        startNodeGroupAutoTest();
        runNodeGroupAutoBackfillIfNeeded();
      });
      stopRoutingStatusPolling();
      stopTrafficPolling();
    } else if (targetId === 'routing-logs-view') {
      loadSystemStatus();
      startRoutingStatusPolling();
      stopNodeGroupAutoTest();
      stopTrafficPolling();
      markRoutingHitsAsSeen();
      updateRoutingLogNavBadge(false);
    } else {
      stopRoutingStatusPolling();
      stopNodeGroupAutoTest();
      stopTrafficPolling();
    }
  });
});

// --- DASHBOARD MASTER SWITCH LOGIC ---
const masterSwitch = document.getElementById('master-switch');
const masterStatusText = document.getElementById('master-status-text');

if (masterSwitch) {
  masterSwitch.addEventListener('click', async () => {
    const isCurrentlyOn = masterSwitch.classList.contains('on');
    masterSwitch.disabled = true;
    try {
      if (isCurrentlyOn) {
        await requestJson('/api/system/proxy/disable', { method: 'POST' });
        await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ systemProxyEnabled: false })
        });
        const stopPayload = await requestJson('/api/core/stop', { method: 'POST' });
        updateCoreStatus(stopPayload.core);
        masterSwitch.classList.remove('on');
        masterSwitch.classList.add('off');
        masterStatusText.textContent = '系统代理已关闭';
        showToast('系统代理已关闭', 'info');
      } else {
        const selectedMode = systemProxyModeSelect?.value || 'rule';
        await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({
            routingMode: selectedMode,
            systemProxyEnabled: true
          })
        });
        const startPayload = await requestJson('/api/core/start', { method: 'POST' });
        updateCoreStatus(startPayload.core);
        masterSwitch.classList.remove('off');
        masterSwitch.classList.add('on');
        masterStatusText.textContent = '系统代理接管中';
        showToast('系统代理已启动', 'success');
      }
      await loadNodes();
      await loadSystemStatus();
    } catch (err) {
      showToast(`操作失败: ${err.message}`, 'error');
    } finally {
      masterSwitch.disabled = false;
    }
  });
}

if (systemProxyModeSelect) {
  systemProxyModeSelect.addEventListener('change', async (event) => {
    const nextMode = event.target.value;
    try {
      const payload = await requestJson('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify({ routingMode: nextMode })
      });
      updateCoreStatus(payload.core);
      updateRestartWarning(payload.restartRequired);
      renderRoutingModeBanner();
      showToast(payload.autoRestarted ? '代理模式已更新并自动应用' : '代理模式已更新', 'success');
    } catch (error) {
      showToast(`模式更新失败: ${error.message}`, 'error');
      if (currentCoreState?.proxy?.mode) {
        systemProxyModeSelect.value = currentCoreState.proxy.mode;
      }
    }
  });
}

if (dashActiveNodeSelect) {
  dashActiveNodeSelect.addEventListener('change', async (event) => {
    const activeNodeId = event.target.value || null;
    try {
      const payload = await requestJson('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify({ activeNodeId })
      });
      // In some responses, core is top-level, in others it's nested
      const coreData = payload.core || payload;
      updateCoreStatus(coreData);
      renderSystemProxyNodeOptions(nodesData, coreData.proxy?.activeNodeId);
      updateRestartWarning(payload.restartRequired);
      if (payload.autoRestarted) {
        showToast('系统代理节点已切换并自动应用', 'success');
      } else if (payload.restartRequired) {
        showToast('系统代理节点已切换，运行中的核心已进入待应用状态', 'info');
      } else {
        showToast('系统代理节点已切换', 'success');
      }
    } catch (error) {
      showToast(`节点切换失败: ${error.message}`, 'error');
      if (currentCoreState?.proxy?.activeNodeId !== undefined) {
        dashActiveNodeSelect.value = currentCoreState.proxy.activeNodeId || '';
      }
    }
  });
}

if (autoStartToggle) {
  autoStartToggle.addEventListener('change', async (event) => {
    const isEnabled = event.target.checked;
    try {
      await requestJson('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify({ autoStart: isEnabled })
      });
      showToast(`开机自启动已${isEnabled ? '开启' : '禁用'}`, 'success');
    } catch (error) {
      showToast(`设置失败: ${error.message}`, 'error');
      // Revert UI state on failure
      event.target.checked = !isEnabled;
    }
  });
}

routingAddRuleBtn?.addEventListener('click', () => openRoutingRuleModal());

routingAddRulesetBtn?.addEventListener('click', () => {
  routingRulesets.push(createRoutingRulesetDraft({ kind: 'custom', name: `自定义规则集 ${routingRulesets.length + 1}`, entries: [createRoutingRulesetEntryDraft()] }));
  routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
  routingDirty = true;
  renderRoutingRules();
});

routingSaveBtn?.addEventListener('click', saveRoutingRules);

routingRulesetPresetSelect?.addEventListener('change', () => {
  const builtin = getBuiltinRulesetById(routingRulesetPresetSelect.value);
  if (!builtin) {
    return;
  }
  routingRulesets.push(createRoutingRulesetDraft({
    kind: 'builtin',
    presetId: builtin.id,
    name: builtin.name,
    target: 'default'
  }));
  routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
  routingRulesetPresetSelect.value = '';
  routingDirty = true;
  renderRoutingRules();
  showToast(`已添加规则集 ${builtin.name}`, 'success');
});

routingPresetSelect?.addEventListener('change', () => {
  const rulesToAppend = applyRoutingPreset(routingPresetSelect.value);
  if (!rulesToAppend.length) {
    return;
  }
  routingRules = [...routingRules, ...rulesToAppend];
  routingRuleErrors = buildRoutingRuleErrors(routingRules);
  routingDirty = true;
  routingPresetSelect.value = '';
  renderRoutingRules();
  showToast('已插入预设分流模板，可按需修改后保存', 'success');
});

routingObservabilityRefreshBtn?.addEventListener('click', loadSystemStatus);

routingRuleModalConfirm?.addEventListener('click', submitRoutingRuleModal);
routingRuleModalClose?.addEventListener('click', closeRoutingRuleModal);
routingRuleModalCancel?.addEventListener('click', closeRoutingRuleModal);
routingRuleModalAction?.addEventListener('change', () => {
  if (routingRuleModalNode) {
    if (routingRuleModalAction.value === 'node_group') {
      routingRuleModalNode.innerHTML = ['<option value="">选择节点组</option>', ...nodeGroups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(getNodeGroupDisplayName(group))}</option>`)].join('');
    } else if (routingRuleModalAction.value === 'node') {
      routingRuleModalNode.innerHTML = ['<option value="">选择节点</option>', ...routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name || node.server || node.id)}</option>`)].join('');
    }
  }
  if (routingRuleModalNodeField) {
    routingRuleModalNodeField.classList.toggle('hidden', !['node', 'node_group'].includes(routingRuleModalAction.value));
  }
});

routingLogSearchInput?.addEventListener('input', (event) => {
  applyRoutingLogSearch(event.target.value || '');
});

routingLogKindFilter?.addEventListener('change', () => {
  routingLogKindQuery = routingLogKindFilter.value || 'all';
  renderRoutingObservability();
});

routingLogViewStatsBtn?.addEventListener('click', () => {
  routingLogViewMode = 'stats';
  updateRoutingLogViewModeButtons();
  renderRoutingObservability();
});

routingLogViewTimelineBtn?.addEventListener('click', () => {
  routingLogViewMode = 'timeline';
  updateRoutingLogViewModeButtons();
  renderRoutingObservability();
});

routingLogSearchClearBtn?.addEventListener('click', () => {
  routingLogSearchQuery = '';
  if (routingLogSearchInput) {
    routingLogSearchInput.value = '';
    routingLogSearchInput.focus();
  }
  updateRoutingLogSearchControls();
  renderRoutingObservability();
});

geoIpRefreshBtn?.addEventListener('click', refreshGeoIp);
rulesetDbRefreshBtn?.addEventListener('click', refreshRulesetDatabase);
nodeGroupAutoIntervalSelect?.addEventListener('change', async () => {
  const nextIntervalSec = Number.parseInt(nodeGroupAutoIntervalSelect.value, 10);
  if (!Number.isInteger(nextIntervalSec) || nextIntervalSec < 60) {
    showToast('自动测速周期无效', 'error');
    return;
  }

  nodeGroupAutoTestIntervalMs = nextIntervalSec * 1000;
  renderNodeGroupTestMeta();
  await persistNodeGroupTestingState();

  if (document.getElementById('node-groups-view')?.classList.contains('active')) {
    stopNodeGroupAutoTest();
    startNodeGroupAutoTest();
  }

  showToast(`自动测速周期已更新为 ${Math.round(nextIntervalSec / 60)} 分钟`, 'success');
});

nodeGroupSearchInput?.addEventListener('input', (event) => {
  nodeGroupSearchQuery = String(event.target?.value || '').trim();
  renderNodeGroups();
});

nodeGroupAddBtn?.addEventListener('click', async () => {
  const payload = await showNodeGroupConfigModal('create');
  if (!payload) return;
  await requestJson('/api/node-groups', { method: 'POST', body: JSON.stringify(payload) });
  await loadNodeGroups();
});

// Window Titlebar Mocks
document.getElementById('titlebar-close')?.addEventListener('click', () => {
  showToast('Tauri 退出指令正在开发中...', 'info');
});

// Close group menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.group-menu.open').forEach(m => m.classList.remove('open'));
});

// Init
updateRoutingLogViewModeButtons();
loadNodes();
loadSystemStatus();
startTrafficPolling();
