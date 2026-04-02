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
const dashDefaultProxy = document.querySelector('#dash-default-proxy');
const dashHttpProxy = document.querySelector('#dash-http-proxy');
const dashHttpNote = document.querySelector('#dash-http-note');
const dashGeoIpStatus = document.querySelector('#dash-geoip-status');
const dashGeoIpNote = document.querySelector('#dash-geoip-note');
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
const routingLogResultCount = document.querySelector('#routing-log-result-count');
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

let currentCoreState = null;
let uptimeTimer = null;
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
let routingObservabilityEntries = [];
let routingHits = [];
let routingStatusPoller = null;
let routingLogSearchQuery = '';
let routingBuiltinRulesets = [];
let routingNodeOptions = [];
let editingRoutingRuleId = null;

const ROUTING_RULE_TYPES = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr'];
const ROUTING_RULE_ACTIONS = ['default', 'direct', 'node'];
const ROUTING_RULESET_TARGETS = ['default', 'direct', 'node'];
let routingRuleCounter = 0;
let routingRulesetCounter = 0;
let routingRulesetEntryCounter = 0;

const createRoutingRuleDraft = (rule = {}) => ({
  id: rule.id || `draft-${Date.now()}-${routingRuleCounter++}`,
  type: ROUTING_RULE_TYPES.includes(rule.type) ? rule.type : 'domain_suffix',
  value: String(rule.value || ''),
  action: ROUTING_RULE_ACTIONS.includes(rule.action) ? rule.action : 'direct',
  nodeId: String(rule.nodeId || ''),
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
  note: String(rule.note || '').trim()
});

const updateRoutingSaveState = () => {
  if (!routingSaveBtn) return;
  routingSaveBtn.disabled = routingSavingState || routingLoadingState || !routingDirty;
  routingSaveBtn.textContent = routingSavingState ? '保存中...' : (routingDirty ? '保存路由表' : '路由表已保存');
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
    routingHits = payload.hits || [];
    routingObservabilityEntries = routingHits.map((hit) => `[Routing Hit] ${hit.kind}:${hit.name} -> ${hit.outboundName || hit.outbound || hit.target} | ${hit.host}`);
    renderRoutingObservability();
  } catch {
    // fall back to log-derived entries
  }
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
  }

  if (routingLogSystemProxy) {
    routingLogSystemProxy.textContent = currentCoreState?.proxy?.systemProxyEnabled ? '已启用' : '未启用';
  }

  if (routingLogCoreStatus) {
    routingLogCoreStatus.textContent = currentCoreState?.status === 'running' ? '运行中' : '未运行';
  }

  const query = routingLogSearchQuery.trim().toLowerCase();

  if (routingHits.length) {
    const groupedHits = new Map();
    routingHits.forEach((hit) => {
      const key = `${hit.kind}:${hit.name}->${hit.outboundName || hit.outbound || hit.target}`;
      if (!groupedHits.has(key)) {
        groupedHits.set(key, {
          ...hit,
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
      const haystacks = [group.name, group.outboundName || group.outbound || group.target, ...Array.from(group.hosts), group.rule || '', group.rulePayload || '']
        .map((value) => String(value || '').toLowerCase());
      return !query || haystacks.some((value) => value.includes(query));
    });

    if (routingLogResultCount) {
      routingLogResultCount.textContent = query
        ? `显示 ${filteredGroups.reduce((sum, item) => sum + item.count, 0)} / ${routingHits.length} 条命中`
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

    routingObservabilityLines.innerHTML = filteredGroups.map((group, index) => {
      const hosts = Array.from(group.hosts);
      const sampleHosts = hosts.slice(0, 3);
      const moreCount = hosts.length - sampleHosts.length;
      const detailId = `routing-hit-detail-${index}`;
      return `
        <details class="routing-hit-card">
          <summary class="routing-hit-header">
            <div class="routing-hit-title">
              <span class="routing-chip is-accent">${highlight(group.kind)}</span>
              <span class="routing-hit-name">${highlight(group.name)}</span>
              <span class="routing-hit-arrow">→</span>
              <span class="routing-hit-target">${highlight(group.outboundName || group.outbound || group.target)}</span>
            </div>
            <div class="routing-hit-count">${group.count} 次命中</div>
          </summary>
          <div class="routing-hit-hosts">
            ${sampleHosts.map((host) => `<span class="routing-hit-host">${highlight(host)}</span>`).join('')}
            ${moreCount > 0 ? `<span class="routing-hit-host-more">+${moreCount}</span>` : ''}
          </div>
          <div class="routing-hit-details" id="${detailId}">
            ${group.items.slice(0, 8).map((item) => `
              <div class="routing-hit-detail-row">
                <span class="routing-hit-detail-host">${highlight(item.host)}${item.port ? `:${highlight(String(item.port))}` : ''}</span>
                <span class="routing-hit-detail-meta">${highlight(item.outboundName || item.outbound || item.target)}</span>
                ${item.rule ? `<span class="routing-hit-detail-meta">rule=${highlight(String(item.rule))}</span>` : ''}
                ${item.rulePayload ? `<span class="routing-hit-detail-meta">payload=${highlight(String(item.rulePayload))}</span>` : ''}
              </div>`).join('')}
          </div>
        </details>`;
    }).join('');
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
  
  // Render grouped cards
  filteredGroups.forEach(group => {
    const displayHosts = group.hostsArray.slice(0, 3);
    const moreCount = group.hostsArray.length - 3;
    
    html += `
      <div class="routing-hit-card">
        <div class="routing-hit-header">
          <div class="routing-hit-title">
            <span class="routing-chip is-accent">${highlight(group.kind)}</span>
            <span class="routing-hit-name">${highlight(group.name)}</span>
            <span class="routing-hit-arrow">→</span>
            <span class="routing-hit-target">${highlight(group.target)}</span>
          </div>
          <div class="routing-hit-count">${group.count} 次命中</div>
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
};

const updateRoutingLogSearchControls = () => {
  if (routingLogSearchClearBtn) {
    routingLogSearchClearBtn.classList.toggle('hidden', !routingLogSearchQuery.trim());
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
    routingRuleModalNode.innerHTML = ['<option value="">选择节点</option>', ...routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === (rule?.nodeId || '') ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`)].join('');
  }
  if (routingRuleModalNodeField) routingRuleModalNodeField.classList.toggle('hidden', (rule?.action || 'default') !== 'node');
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
  const actions = [];

  if (coreStatus !== 'running') {
    actions.push('<button type="button" class="btn-outline" data-routing-action="start-core">启动核心</button>');
  }

  if (!routingRules.length && !routingRulesets.length) {
    copy = '当前还没有分流规则。可以先新增规则，或者用右上角预设模板快速生成一组起步规则。';
    routingModeBanner.classList.add('is-inactive');
  } else if (!systemProxyEnabled) {
    copy = '系统代理当前未启用：规则已经保存，但统一入口没有开启，所以这些规则不会被命中。';
    routingModeBanner.classList.add('is-direct');
    actions.push('<button type="button" class="btn-primary" data-routing-action="enable-system-proxy-rule">启用系统代理</button>');
  } else if (mode === 'rule') {
    routingModeBanner.classList.add('is-active');
    copy = '当前处于规则分流模式：规则集和手写规则正在参与系统代理统一入口的流量分发。';
  } else if (mode === 'direct') {
    routingModeBanner.classList.add('is-direct');
    copy = '当前处于直连退出模式：规则仍可编辑，但系统代理流量会全部直连，不使用这些规则。';
  } else {
    routingModeBanner.classList.add('is-inactive');
    copy = '当前处于全局接管模式：规则仍可编辑，但系统代理流量会统一走当前默认节点，不使用这些规则。';
  }

  routingModeBanner.innerHTML = `
    <div class="routing-mode-copy">${escapeHtml(copy)}</div>
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
            <div class="routing-ruleset-top">
              <div>
                <div class="routing-rule-title">${escapeHtml(ruleset.name || rulesetKindLabel)}</div>
                <div class="routing-ruleset-meta">
                  <span class="routing-chip is-accent">${rulesetKindLabel}</span>
                  <span class="routing-chip ${ruleset.enabled ? 'is-success' : ''}">${ruleset.enabled ? '已启用' : '已停用'}</span>
                </div>
              </div>
              <div class="routing-ruleset-actions">
                <button type="button" class="btn-outline routing-action-btn routing-ruleset-move-up-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-outline routing-action-btn routing-ruleset-move-down-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" ${index === routingRulesets.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-outline routing-delete-ruleset-btn" data-ruleset-id="${escapeHtml(ruleset.id)}">删除</button>
              </div>
            </div>
            <div class="routing-ruleset-grid">
              <label class="routing-field">
                <span class="routing-field-label">名称</span>
                <input class="routing-input ${rulesetErrors.name ? 'has-error' : ''}" data-ruleset-field="name" data-ruleset-id="${escapeHtml(ruleset.id)}" value="${escapeHtml(ruleset.name)}" ${ruleset.kind === 'custom' ? '' : 'readonly'}>
                <span class="routing-field-error">${escapeHtml(rulesetErrors.name || '')}</span>
              </label>
              <label class="routing-field">
                <span class="routing-field-label">规则集来源</span>
                ${ruleset.kind === 'custom'
                  ? '<input class="routing-input" value="自定义条目" readonly>'
                  : '<input class="routing-input" value="内置规则集" readonly>'}
                <span class="routing-field-error">${escapeHtml(rulesetErrors.presetId || '')}</span>
              </label>
              <label class="routing-field">
                <span class="routing-field-label">流量去向</span>
                <select class="routing-select ${rulesetErrors.target ? 'has-error' : ''}" data-ruleset-field="target" data-ruleset-id="${escapeHtml(ruleset.id)}">
                  <option value="default" ${ruleset.target === 'default' ? 'selected' : ''}>默认代理</option>
                  <option value="direct" ${ruleset.target === 'direct' ? 'selected' : ''}>直连</option>
                  <option value="node" ${ruleset.target === 'node' ? 'selected' : ''}>指定节点</option>
                </select>
                <span class="routing-field-error">${escapeHtml(rulesetErrors.target || '')}</span>
              </label>
              <label class="routing-field">
                <span class="routing-field-label">节点</span>
                <select class="routing-select ${rulesetErrors.nodeId ? 'has-error' : ''}" data-ruleset-field="nodeId" data-ruleset-id="${escapeHtml(ruleset.id)}" ${ruleset.target === 'node' ? '' : 'disabled'}>
                  ${buildNodeOptions(ruleset.nodeId)}
                </select>
                <span class="routing-field-error">${escapeHtml(rulesetErrors.nodeId || '')}</span>
              </label>
            </div>
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
            </select>
            <span class="routing-field-error">${escapeHtml(errors.action || '')}</span>
          </label>
          <label class="routing-field">
            <span class="routing-field-label">节点 / 备注</span>
            ${rule.action === 'node'
              ? `<select class="routing-select ${errors.nodeId ? 'has-error' : ''}" data-field="nodeId" data-rule-id="${escapeHtml(rule.id)}"><option value="">选择节点</option>${routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === rule.nodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`).join('')}</select>`
              : `<input class="routing-input" data-field="note" data-rule-id="${escapeHtml(rule.id)}" value="${escapeHtml(rule.note)}" placeholder="可选，便于区分规则" autocomplete="off">`}
            <span class="routing-field-error">${escapeHtml(errors.nodeId || '')}</span>
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
    routingBuiltinRulesets = payload.builtinRulesets || routingBuiltinRulesets;
    routingNodeOptions = payload.core?.nodes || currentCoreState?.nodes || routingNodeOptions;
    renderRoutingRulesetPresetOptions();
    routingRuleErrors = buildRoutingRuleErrors(routingRules);
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = false;
    updateCoreStatus(payload.core);
    routingObservabilityEntries = extractRoutingObservability(payload.core);
    renderRoutingRules();

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

const renderGeoIpStatus = (status = geoIpStatus) => {
  geoIpStatus = status || null;
  if (!dashGeoIpStatus || !dashGeoIpNote) return;

  if (!geoIpStatus) {
    dashGeoIpStatus.textContent = '未初始化';
    dashGeoIpNote.textContent = 'GeoIP 状态尚未返回';
    if (geoIpRefreshBtn) geoIpRefreshBtn.disabled = false;
    return;
  }

  if (geoIpStatus.pending) {
    dashGeoIpStatus.textContent = '下载中';
    dashGeoIpNote.textContent = '正在后台准备国家库，完成后刷新节点列表即可显示国旗';
  } else if (geoIpStatus.ready) {
    dashGeoIpStatus.textContent = '已就绪';
    dashGeoIpNote.textContent = geoIpStatus.downloadedAt
      ? `本地国家库可用，上次更新时间 ${new Date(geoIpStatus.downloadedAt).toLocaleString('zh-CN')}`
      : '本地国家库可用';
  } else if (geoIpStatus.lastError) {
    dashGeoIpStatus.textContent = '下载失败';
    dashGeoIpNote.textContent = `GeoIP 下载失败：${geoIpStatus.lastError}`;
  } else {
    dashGeoIpStatus.textContent = '等待下载';
    dashGeoIpNote.textContent = '首次启动会在后台自动下载国家库';
  }

  if (geoIpRefreshBtn) {
    geoIpRefreshBtn.disabled = Boolean(geoIpStatus.pending);
    geoIpRefreshBtn.textContent = geoIpStatus.pending ? 'GeoIP 下载中...' : '刷新 GeoIP';
  }
};

const renderRulesetDatabaseStatus = (status = rulesetDatabaseStatus) => {
  rulesetDatabaseStatus = status || null;
  if (!routingDbStatus || !routingDbNote) return;

  if (!rulesetDatabaseStatus) {
    routingDbStatus.textContent = '未初始化';
    routingDbNote.textContent = '规则库状态尚未返回';
    if (rulesetDbRefreshBtn) rulesetDbRefreshBtn.disabled = false;
    return;
  }

  if (rulesetDatabaseStatus.pending) {
    routingDbStatus.textContent = '下载中';
    routingDbNote.textContent = '正在下载 geosite-cn / geoip-cn 规则库';
  } else if (rulesetDatabaseStatus.ready) {
    routingDbStatus.textContent = '已就绪';
    routingDbNote.textContent = rulesetDatabaseStatus.downloadedAt
      ? `规则库可用，上次更新时间 ${new Date(rulesetDatabaseStatus.downloadedAt).toLocaleString('zh-CN')}`
      : '规则库可用';
  } else if (rulesetDatabaseStatus.lastError) {
    routingDbStatus.textContent = '下载失败';
    routingDbNote.textContent = `规则库下载失败：${rulesetDatabaseStatus.lastError}`;
  } else {
    routingDbStatus.textContent = '等待下载';
    routingDbNote.textContent = '点击“更新规则库”后即可启用数据库规则';
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
  const httpEndpoint = proxyProfile.systemSocksEndpoint || proxyProfile.httpCompatibilityEndpoint || {
    protocol: 'socks5',
    host: listenHost,
    port: proxyProfile.unifiedSocksPort || 20100,
    url: `socks5://${listenHost}:${proxyProfile.unifiedSocksPort || 20100}`
  };

  if (dashDefaultProxy) {
    dashDefaultProxy.textContent = defaultEndpoint.url;
  }

  if (dashHttpProxy) {
    dashHttpProxy.textContent = httpEndpoint.url;
  }

  if (dashHttpNote) {
    dashHttpNote.textContent = '用于手动代理、分流和兼容 SOCKS5 的客户端';
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
    }
  } else if (core.status === 'running') {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '核心运行中，系统代理未接管';
    }
  } else if (core.status === 'crashed') {
    coreStatusIndicator.classList.add('crashed');
    coreStatusIndicator.title = '多次崩溃，需手动重启';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎已崩溃，请手动重启';
    }
  } else if (core.status === 'error') {
    coreStatusIndicator.classList.add('error');
    coreStatusIndicator.title = '异常终止';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎运行异常';
    }
  } else {
    coreStatusIndicator.classList.add('stopped');
    coreStatusIndicator.title = systemProxy.enabled ? '核心已停止，检测到外部系统代理' : '已停止';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = systemProxy.enabled ? '核心已停止，系统代理仍被外部占用' : '系统代理已关闭';
    }
  }
};

// Modal Elements
const editModal = document.querySelector('#edit-modal');
const editJsonInput = document.querySelector('#edit-json-input');
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
          <span class="node-port">本地出口: ${localPortStr}</span>
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
};

closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

const editNodeGroupInput = document.querySelector('#edit-node-group');

const openEditModal = (id) => {
  const node = nodesData.find(n => n.id === id);
  if (!node) return;
  currentEditNodeId = id;
  const editData = { ...node };
  if (editNodeGroupInput) editNodeGroupInput.value = node.group || '';
  editJsonInput.value = JSON.stringify(editData, null, 2);
  editModal.classList.add('active');
};

saveNodeBtn?.addEventListener('click', async () => {
  saveNodeBtn.textContent = '保存中...';
  saveNodeBtn.disabled = true;
  
  try {
    const updatedData = JSON.parse(editJsonInput.value);
    const groupValue = editNodeGroupInput ? editNodeGroupInput.value.trim() || null : undefined;
    if (groupValue !== undefined) updatedData.group = groupValue;

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
    if (targetId === 'routing-view') {
      loadSystemStatus();
      loadRoutingRules(true);
      stopRoutingStatusPolling();
    } else if (targetId === 'routing-logs-view') {
      loadSystemStatus();
      startRoutingStatusPolling();
    } else {
      stopRoutingStatusPolling();
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
  if (routingRuleModalNodeField) {
    routingRuleModalNodeField.classList.toggle('hidden', routingRuleModalAction.value !== 'node');
  }
});

routingLogSearchInput?.addEventListener('input', (event) => {
  applyRoutingLogSearch(event.target.value || '');
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

// Window Titlebar Mocks
document.getElementById('titlebar-close')?.addEventListener('click', () => {
  showToast('Tauri 退出指令正在开发中...', 'info');
});

// Close group menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.group-menu.open').forEach(m => m.classList.remove('open'));
});

// Init
loadNodes();
loadSystemStatus();
