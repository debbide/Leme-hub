import { createToastController, showConfirmModal, showInputModal } from './lib/ui.js';
import { renderGroupTabs as renderGroupTabsView, testAllNodes as testAllNodesView, updateBulkBar as updateBulkBarView } from './lib/nodes-controller.js';
import { deleteNodeRecord, importNodeLink, loadNodesData, syncSubscriptionNodes, testSingleNode } from './lib/nodes-data.js';
import { pollTraffic as pollTrafficView, renderProxyEndpoints as renderProxyEndpointsView, renderSystemProxyNodeOptions as renderSystemProxyNodeOptionsView, updateCoreStatus as updateCoreStatusView, updateSpeedCard as updateSpeedCardView } from './lib/dashboard-system.js';
import { formatNodeGroupLatencyBadge as formatNodeGroupLatencyBadgeView, getEffectiveGroupNodeIds as getEffectiveGroupNodeIdsView, loadNodeGroupsData, persistNodeGroupTestingState as persistNodeGroupTestingStateView, renderNodeGroupTestMeta as renderNodeGroupTestMetaView, showNodeGroupConfigModal as showNodeGroupConfigModalView } from './lib/node-groups.js';
import { applyLatencyPrioritySwitch as applyLatencyPrioritySwitchView, stopNodeGroupAutoTest as stopNodeGroupAutoTestView, startNodeGroupAutoTest as startNodeGroupAutoTestView, testNodeGroupNodes as testNodeGroupNodesView, testSingleNodeInGroup as testSingleNodeInGroupView, runNodeGroupAutoBackfillIfNeeded as runNodeGroupAutoBackfillIfNeededView } from './lib/node-groups-auto.js';
import { renderNodeGroups as renderNodeGroupsView } from './lib/node-groups-render.js';
import { closeNodeEditModal as closeNodeEditModalView, openNodeEditModal as openNodeEditModalView, prepareManualNodeDraft, saveNodeEdit } from './lib/node-edit-modal.js';
import { bindNodeEditEvents } from './lib/node-edit-bindings.js';
import { bindNodesPanelEvents } from './lib/nodes-bindings.js';
import { applyLatencyResult, copyNodeShareLink, renderNodeRow, resetLatencyPlaceholders, showInlineMessage } from './lib/nodes-ui.js';
import { applyRoutingPreset, buildRoutingRuleErrors, buildRoutingRulesetErrors, createRoutingRuleDraft, createRoutingRulesetDraft, createRoutingRulesetEntryDraft, getBuiltinRulesetById, normalizeRoutingRule, normalizeRoutingRulesetEntry, renderRulesetRuntimeMeta, validateRoutingRule } from './lib/routing-core.js';
import { closeRoutingRuleModal as closeRoutingRuleModalView, openRoutingRuleModal as openRoutingRuleModalView, renderRoutingRules as renderRoutingRulesView, renderRoutingRulesetsSection as renderRoutingRulesetsSectionView, submitRoutingRuleModal as submitRoutingRuleModalView } from './lib/routing-editor.js';
import { bindRoutingEvents } from './lib/routing-bindings.js';
import { loadRoutingRulesData, saveRoutingRulesData, showRoutingError as showRoutingErrorView } from './lib/routing-dataflow.js';
import { bindSystemEvents } from './lib/system-bindings.js';
import { loadSystemRuntimeStatus, refreshGeoIpData, refreshRulesetDatabaseState, runCoreAction as runCoreActionView, startRoutingStatusPolling as startRoutingStatusPollingView, startTrafficPolling as startTrafficPollingView, stopRoutingStatusPolling as stopRoutingStatusPollingView, stopTrafficPolling as stopTrafficPollingView } from './lib/system-runtime.js';
import { extractRoutingObservability, renderRoutingObservability as renderRoutingObservabilityView } from './lib/routing-observability.js';
import { markRoutingHitsAsSeen as markRoutingHitsAsSeenView, renderRoutingModeBanner as renderRoutingModeBannerView, updateRoutingLogNavBadge as updateRoutingLogNavBadgeView, updateRoutingLogSearchControls as updateRoutingLogSearchControlsView, updateRoutingLogViewModeButtons as updateRoutingLogViewModeButtonsView } from './lib/routing-ui.js';
import { bindAppMiscEvents, bindWindowChromeFallbacks, runInitialAppBootstrap } from './lib/app-init.js';
import { bindViewLifecycle } from './lib/view-lifecycle.js';
import { debounce, escapeHtml, escapeRegExp, flagFromCountryCode, requestJson } from './lib/utils.js';

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
const getRoutingMode = () => currentCoreState?.proxy?.mode || systemProxyModeSelect?.value || 'rule';

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

const loadNodeGroups = () => loadNodeGroupsData({
  nodeGroupsList,
  requestJson,
  nodeGroupExpandedIds,
  setNodeGroups: (value) => { nodeGroups = value || []; },
  setNodeGroupExpandedIds: (value) => { nodeGroupExpandedIds = value; },
  nodeGroupAutoSwitchState,
  setNodeGroupAutoSwitchState: (value) => { nodeGroupAutoSwitchState = value; },
  routingNodeOptions,
  setRoutingNodeOptions: (value) => { routingNodeOptions = value || []; },
  nodeGroupAutoIntervalSelect,
  setNodeGroupAutoTestIntervalMs: (value) => { nodeGroupAutoTestIntervalMs = value; },
  setNodeGroupLatencyMap: (value) => { nodeGroupLatencyMap = value; },
  setNodeGroupLastTestAt: (value) => { nodeGroupLastTestAt = value; },
  renderNodeGroupTestMeta,
  renderNodeGroups,
});

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

const renderNodeGroupTestMeta = () => renderNodeGroupTestMetaView({
  nodeGroupsLastTestEl,
  nodeGroupsNextTestEl,
  nodeGroupLastTestAt,
  nodeGroupAutoTestIntervalMs,
});

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

const persistNodeGroupTestingState = () => persistNodeGroupTestingStateView({
  nodeGroupSavingTestingState,
  setNodeGroupSavingTestingState: (value) => { nodeGroupSavingTestingState = value; },
  requestJson,
  nodeGroupAutoTestIntervalMs,
  nodeGroupLatencyMap,
  nodeGroupLastTestAt,
});

const applyLatencyPrioritySwitch = (group, testResults = [], options = {}) => applyLatencyPrioritySwitchView({
  group,
  testResults,
  options,
  requestJson,
  nodeGroups,
  setNodeGroups: (value) => { nodeGroups = value || []; },
  nodeGroupAutoSwitchState,
  routingNodeOptions,
  NODE_GROUP_SWITCH_FAIL_THRESHOLD,
  NODE_GROUP_SWITCH_COOLDOWN_MS,
  NODE_GROUP_SWITCH_DELTA_MS,
  showToast,
});

const formatNodeGroupLatencyBadge = (nodeId) => formatNodeGroupLatencyBadgeView({
  nodeId,
  nodeGroupTestingNodeIds,
  nodeGroupLatencyMap,
});

const getExistingNodeIdSet = () => new Set((routingNodeOptions || []).map((node) => node.id));

const getEffectiveGroupNodeIds = (group) => getEffectiveGroupNodeIdsView({ group, routingNodeOptions });

const testNodeGroupNodes = (groupId, options = {}) => testNodeGroupNodesView({
  groupId,
  options,
  nodeGroups,
  getEffectiveGroupNodeIds,
  nodeGroupTestingGroupIds,
  nodeGroupTestingNodeIds,
  renderNodeGroups,
  requestJson,
  nodeGroupLatencyMap,
  nodeGroupLastTestAt,
  setNodeGroupLastTestAt: (value) => { nodeGroupLastTestAt = value; },
  renderNodeGroupTestMeta,
  persistNodeGroupTestingState,
  applyLatencyPrioritySwitch,
  updateCoreStatus,
  showToast,
});

const testSingleNodeInGroup = (nodeId, options = {}) => testSingleNodeInGroupView({
  nodeId,
  options,
  nodeGroupTestingNodeIds,
  renderNodeGroups,
  requestJson,
  nodeGroupLatencyMap,
  setNodeGroupLastTestAt: (value) => { nodeGroupLastTestAt = value; },
  renderNodeGroupTestMeta,
  persistNodeGroupTestingState,
  updateCoreStatus,
  showToast,
});

const stopNodeGroupAutoTest = () => stopNodeGroupAutoTestView({
  nodeGroupAutoTestTimer,
  setNodeGroupAutoTestTimer: (value) => { nodeGroupAutoTestTimer = value; },
  nodeGroupAutoTestStatusTimer,
  setNodeGroupAutoTestStatusTimer: (value) => { nodeGroupAutoTestStatusTimer = value; },
});

const startNodeGroupAutoTest = () => startNodeGroupAutoTestView({
  nodeGroupAutoTestTimer,
  setNodeGroupAutoTestTimer: (value) => { nodeGroupAutoTestTimer = value; },
  setNodeGroupAutoTestStatusTimer: (value) => { nodeGroupAutoTestStatusTimer = value; },
  nodeGroups,
  getEffectiveGroupNodeIds,
  testNodeGroupNodes,
  nodeGroupAutoTestIntervalMs,
  renderNodeGroupTestMeta,
});

const runNodeGroupAutoBackfillIfNeeded = () => runNodeGroupAutoBackfillIfNeededView({
  nodeGroups,
  getEffectiveGroupNodeIds,
  nodeGroupLatencyMap,
  testNodeGroupNodes,
});

const renderNodeGroups = () => renderNodeGroupsView({
  nodeGroupsList,
  nodeGroups,
  routingNodeOptions,
  nodeGroupSortByLatency,
  nodeGroupSearchQuery,
  nodeGroupSearchCount,
  nodeGroupExpandedIds,
  nodeGroupLatencyMap,
  getNodeGroupDisplayName,
  getEffectiveGroupNodeIds,
  formatNodeGroupLatencyBadge,
  flagFromCountryCode,
  escapeHtml,
  onToggleExpanded: (groupId, isOpen) => {
    if (isOpen) {
      nodeGroupExpandedIds.add(groupId);
    } else {
      nodeGroupExpandedIds.delete(groupId);
    }
  },
  onSelectNode: async (groupId, selectedNodeId) => {
    await requestJson('/api/node-groups/selection', { method: 'PUT', body: JSON.stringify({ id: groupId, selectedNodeId }) });
    await loadNodeGroups();
  },
  onCountryOverride: async (nodeId) => {
    await setNodeCountryOverride(nodeId);
    await loadNodeGroups();
  },
  onTestGroup: async (groupId) => {
    await testNodeGroupNodes(groupId);
  },
  onToggleSort: () => {
    nodeGroupSortByLatency = !nodeGroupSortByLatency;
    renderNodeGroups();
    showToast(nodeGroupSortByLatency ? '已启用按延迟排序' : '已关闭按延迟排序', 'info');
  },
  onTestSingleNode: async (nodeId) => {
    await testSingleNodeInGroup(nodeId);
  },
  onDeleteGroup: async (groupId) => {
    await requestJson('/api/node-groups', { method: 'DELETE', body: JSON.stringify({ id: groupId }) });
    await loadNodeGroups();
  },
  onEditGroup: async (groupId) => {
    const group = nodeGroups.find((item) => item.id === groupId);
    if (!group) return;
    const payload = await showNodeGroupConfigModal('edit', group);
    if (!payload) return;
    await requestJson('/api/node-groups', { method: 'PUT', body: JSON.stringify({ id: group.id, ...payload }) });
    await loadNodeGroups();
  },
});

const renderRoutingObservability = () => renderRoutingObservabilityView({
  routingObservability,
  routingObservabilityLines,
  routingObservabilityStatus,
  routingLogMode,
  routingLogSystemProxy,
  routingLogCoreStatus,
  routingLogResultCount,
  currentCoreState,
  getRoutingMode,
  routingHits,
  routingObservabilityEntries,
  routingLogSearchQuery,
  routingLogKindQuery,
  routingLogViewMode,
  routingHitCountSnapshot,
  setRoutingHitCountSnapshot: (value) => { routingHitCountSnapshot = value; },
  escapeHtml,
  escapeRegExp,
});

const updateRoutingLogSearchControls = () => updateRoutingLogSearchControlsView({
  routingLogSearchClearBtn,
  routingLogSearchQuery,
});

const updateRoutingLogViewModeButtons = () => updateRoutingLogViewModeButtonsView({
  routingLogViewMode,
  routingLogViewStatsBtn,
  routingLogViewTimelineBtn,
});

const markRoutingHitsAsSeen = (hits = routingHits) => {
  routingLogUnreadCount = markRoutingHitsAsSeenView({ hits, routingLogSeenIds });
};

const updateRoutingLogNavBadge = (animate = false) => updateRoutingLogNavBadgeView({
  routingLogNavBadge,
  routingLogUnreadCount,
  animate,
});

const applyRoutingLogSearch = debounce((value) => {
  routingLogSearchQuery = value;
  updateRoutingLogSearchControls();
  renderRoutingObservability();
}, 250);

const stopRoutingStatusPolling = () => stopRoutingStatusPollingView({
  routingStatusPoller,
  setRoutingStatusPoller: (value) => { routingStatusPoller = value; },
});

const startRoutingStatusPolling = () => startRoutingStatusPollingView({
  stopRoutingStatusPolling,
  setRoutingStatusPoller: (value) => { routingStatusPoller = value; },
  loadSystemStatus,
});

const stopTrafficPolling = () => stopTrafficPollingView({
  trafficPoller,
  setTrafficPoller: (value) => { trafficPoller = value; },
});

const updateSpeedCard = (downloadRate = 0, uploadRate = 0) => updateSpeedCardView({
  dashSpeedValue,
  downloadRate,
  uploadRate,
  speedHistory,
  setSpeedHistory: (value) => { speedHistory = value; },
});

const pollTraffic = () => pollTrafficView({
  requestJson,
  currentCoreState,
  getLastTrafficSample: () => lastTrafficSample,
  setLastTrafficSample: (value) => { lastTrafficSample = value; },
  updateSpeedCard,
});

const startTrafficPolling = () => startTrafficPollingView({
  trafficPoller,
  pollTraffic,
  setTrafficPoller: (value) => { trafficPoller = value; },
  TRAFFIC_POLL_INTERVAL_MS,
});

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

const closeRoutingRuleModal = () => closeRoutingRuleModalView({
  routingRuleModal,
  routingRuleModalError,
  setEditingRoutingRuleId: (value) => { editingRoutingRuleId = value; },
});

const openRoutingRuleModal = (rule = null) => openRoutingRuleModalView({
  rule,
  setEditingRoutingRuleId: (value) => { editingRoutingRuleId = value; },
  routingRuleModalTitle,
  routingRuleModalType,
  routingRuleModalAction,
  routingRuleModalValue,
  routingRuleModalNode,
  routingRuleModalNodeField,
  routingRuleModalNote,
  routingRuleModalError,
  routingRuleModal,
  nodeGroups,
  routingNodeOptions,
  getNodeGroupDisplayName,
  escapeHtml,
});

const submitRoutingRuleModal = () => submitRoutingRuleModalView({
  editingRoutingRuleId,
  routingRuleModalType,
  routingRuleModalAction,
  routingRuleModalValue,
  routingRuleModalNode,
  routingRuleModalNote,
  createRoutingRuleDraft,
  validateRoutingRule,
  routingRuleModalError,
  routingRules,
  setRoutingRules: (value) => { routingRules = value; },
  buildRoutingRuleErrors,
  setRoutingRuleErrors: (value) => { routingRuleErrors = value; },
  setRoutingDirty: (value) => { routingDirty = value; },
  closeRoutingRuleModal,
  renderRoutingRules,
});

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

const renderRoutingModeBanner = () => renderRoutingModeBannerView({
  routingModeBanner,
  getRoutingMode,
  currentCoreState,
  routingRules,
  routingRulesets,
  escapeHtml,
  escapeRegExp,
  onEnableSystemProxyRule: () => enableRuleRoutingFlow({ enableSystemProxy: true }),
  onStartCore: () => runCoreAction('start'),
});

const renderRoutingRulesetsSection = () => renderRoutingRulesetsSectionView({
  routingRulesets,
  routingRulesetErrors,
  routingBuiltinRulesets,
  routingNodeOptions,
  nodeGroups,
  getNodeGroupDisplayName,
  renderRulesetRuntimeMeta,
  escapeHtml,
});

const renderRoutingRules = () => renderRoutingRulesView({
  routingRulesContainer,
  routingLoading,
  routingEmpty,
  routingError,
  routingLoadingState,
  routingRules,
  routingRulesets,
  routingRuleErrors,
  nodeGroups,
  routingNodeOptions,
  escapeHtml,
  getNodeGroupDisplayName,
  renderRoutingRulesetsSection,
  updateRoutingSaveState,
  renderRoutingModeBanner,
  onRuleFieldChange: (input, event) => {
    const ruleId = input.dataset.ruleId;
    const field = input.dataset.field;
    const targetRule = routingRules.find((item) => item.id === ruleId);
    if (!targetRule || !field) return;
    targetRule[field] = event.target.value;
    routingRuleErrors = buildRoutingRuleErrors(routingRules);
    routingDirty = true;
    renderRoutingRules();
  },
  onRuleDelete: (ruleId) => {
    routingRules = routingRules.filter((rule) => rule.id !== ruleId);
    delete routingRuleErrors[ruleId];
    routingDirty = true;
    renderRoutingRules();
  },
  onRuleMove: (ruleId, offset) => moveRoutingRule(ruleId, offset),
  onRuleEdit: (ruleId) => {
    const rule = routingRules.find((item) => item.id === ruleId);
    if (rule) openRoutingRuleModal(rule);
  },
  onRulesetFieldChange: (input, event) => {
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
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = true;
    renderRoutingRules();
  },
  onRulesetDelete: (rulesetId) => {
    routingRulesets = routingRulesets.filter((ruleset) => ruleset.id !== rulesetId);
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = true;
    renderRoutingRules();
  },
  onRulesetMove: (rulesetId, offset) => moveRoutingRuleset(rulesetId, offset),
  onRulesetAddEntry: (rulesetId) => {
    const ruleset = routingRulesets.find((item) => item.id === rulesetId);
    if (!ruleset) return;
    ruleset.entries.push(createRoutingRulesetEntryDraft());
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = true;
    renderRoutingRules();
  },
  onRulesetEntryFieldChange: (input, event) => {
    const ruleset = routingRulesets.find((item) => item.id === input.dataset.rulesetId);
    const entry = ruleset?.entries.find((item) => item.id === input.dataset.rulesetEntryId);
    if (!ruleset || !entry) return;
    entry[input.dataset.rulesetEntryField] = event.target.value;
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = true;
    renderRoutingRules();
  },
  onRulesetEntryDelete: (rulesetId, entryId) => {
    const ruleset = routingRulesets.find((item) => item.id === rulesetId);
    if (!ruleset) return;
    ruleset.entries = ruleset.entries.filter((entry) => entry.id !== entryId);
    routingRulesetErrors = buildRoutingRulesetErrors(routingRulesets);
    routingDirty = true;
    renderRoutingRules();
  },
  renderRoutingObservability,
  onRenderError: (error) => {
    routingLoadingState = false;
    showRoutingError(`分流页面渲染失败: ${error.message}`);
  },
});

const showRoutingError = (message) => showRoutingErrorView({
  routingError,
  routingLoading,
  routingEmpty,
  routingRulesContainer,
  message,
});

const loadRoutingRules = (force = false) => loadRoutingRulesData({
  force,
  routingLoaded,
  routingDirty,
  routingLoadingState,
  setRoutingLoadingState: (value) => { routingLoadingState = value; },
  setRoutingRuleErrors: (value) => { routingRuleErrors = value; },
  setRoutingRulesetErrors: (value) => { routingRulesetErrors = value; },
  renderRoutingRules,
  requestJson,
  createRoutingRuleDraft,
  createRoutingRulesetDraft,
  setRoutingRules: (value) => { routingRules = value; },
  setRoutingRulesets: (value) => { routingRulesets = value; },
  nodeGroups,
  setNodeGroups: (value) => { nodeGroups = value || []; },
  setRoutingBuiltinRulesets: (value) => { routingBuiltinRulesets = value || []; },
  currentCoreState,
  setRoutingNodeOptions: (value) => { routingNodeOptions = value || []; },
  renderRoutingRulesetPresetOptions,
  buildRoutingRuleErrors,
  buildRoutingRulesetErrors,
  updateCoreStatus,
  extractRoutingObservability,
  setRoutingObservabilityEntries: (value) => { routingObservabilityEntries = value || []; },
  setRoutingLoaded: (value) => { routingLoaded = value; },
  setRoutingDirty: (value) => { routingDirty = value; },
  showRoutingError,
  updateRoutingSaveState,
  renderRoutingModeBanner,
});

const saveRoutingRules = () => saveRoutingRulesData({
  routingSavingState,
  routingRules,
  normalizeRoutingRule,
  buildRoutingRuleErrors,
  setRoutingRuleErrors: (value) => { routingRuleErrors = value; },
  routingRulesets,
  normalizeRoutingRulesetEntry,
  buildRoutingRulesetErrors,
  setRoutingRulesetErrors: (value) => { routingRulesetErrors = value; },
  setRoutingDirty: (value) => { routingDirty = value; },
  renderRoutingRules,
  showToast,
  setRoutingSavingState: (value) => { routingSavingState = value; },
  updateRoutingSaveState,
  requestJson,
  createRoutingRuleDraft,
  createRoutingRulesetDraft,
  setRoutingRules: (value) => { routingRules = value; },
  setRoutingRulesets: (value) => { routingRulesets = value; },
  nodeGroups,
  setNodeGroups: (value) => { nodeGroups = value || []; },
  routingBuiltinRulesets,
  setRoutingBuiltinRulesets: (value) => { routingBuiltinRulesets = value || []; },
  currentCoreState,
  setRoutingNodeOptions: (value) => { routingNodeOptions = value || []; },
  renderRoutingRulesetPresetOptions,
  updateCoreStatus,
  extractRoutingObservability,
  setRoutingObservabilityEntries: (value) => { routingObservabilityEntries = value || []; },
  setRoutingSavedFlashUntil: (value) => { routingSavedFlashUntil = value; },
  getRoutingMode,
});

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

const renderSystemProxyNodeOptions = (nodes, activeNodeId) => renderSystemProxyNodeOptionsView({
  dashActiveNodeSelect,
  nodes,
  activeNodeId,
});

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

const renderProxyEndpoints = (proxyProfile = {}) => renderProxyEndpointsView({
  proxyProfile,
  sidebarDefaultProxy,
});

const updateCoreStatus = (core) => updateCoreStatusView({
  core,
  setCurrentCoreState: (value) => { currentCoreState = value; },
  coreStatusIndicator,
  systemProxyModeSelect,
  renderRoutingModeBanner,
  dashActiveNodeSelect,
  autoStartToggle,
  getCurrentCoreState: () => currentCoreState,
  getUptimeTimer: () => uptimeTimer,
  setUptimeTimer: (value) => { uptimeTimer = value; },
  dashUptime,
  renderProxyEndpoints,
});

// Modal Elements
const editModal = document.querySelector('#edit-modal');
const editJsonInput = document.querySelector('#edit-json-input');
const editCountryOverrideInput = document.querySelector('#edit-node-country-override');
const saveNodeBtn = document.querySelector('#save-node-btn');
const closeModalBtns = document.querySelectorAll('#close-modal-top, .cancel-modal-btn');
let currentEditNodeId = null;

const { showToast } = createToastController(toastContainer);
window.showToast = showToast;

let nodesData = [];
let groupsData = [];
let nodeSearchQuery = '';
let selectedNodeIds = new Set();
let currentGroup = null;

const groupTabsEl = document.querySelector('#group-tabs');
const addGroupBtn = document.querySelector('#add-group-btn');

const renderGroupTabs = () => renderGroupTabsView({
  groupTabsEl,
  nodesData,
  groupsData,
  activeGroupTab,
  setActiveGroupTab: (value) => { activeGroupTab = value; },
  setCurrentGroup: (value) => { currentGroup = value; },
  renderNodesElement: () => {
    renderGroupTabs();
    renderNodesElement();
  },
  showInputModal,
  showConfirmModal,
  requestJson,
  showToast,
  loadNodes,
});

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

const showNodeGroupConfigModal = (mode = 'create', group = null) => showNodeGroupConfigModalView({
  mode,
  group,
  nodeGroupModal,
  nodeGroupModalTitle,
  nodeGroupModalConfirm,
  nodeGroupModalName,
  nodeGroupModalType,
  nodeGroupModalCountry,
  nodeGroupModalIconMode,
  nodeGroupModalIconEmoji,
  nodeGroupModalNote,
  nodeGroupModalDefaultNode,
  nodeGroupModalEmojiWrap,
  nodeGroupModalError,
  nodeGroupModalCancel,
  nodeGroupModalClose,
  routingNodeOptions,
  escapeHtml,
  showInlineMessage,
  setEditingNodeGroupId: (value) => { editingNodeGroupId = value; },
});

// 当前激活的分组 Tab，null = 全部
let activeGroupTab = null;

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

  nodesTbody.innerHTML = visibleNodes.map((node) => renderNodeRow({
    node,
    activeNodeId,
    groupsData,
    nodesData,
    escapeHtml,
  })).join('');

  nodesTbody.querySelectorAll('.test-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); testNode(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.share-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyNodeShareLink({ id: btn.dataset.id, nodesData, showToast });
    });
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

const loadNodes = () => loadNodesData({
  nodesState,
  nodesLoading,
  nodesEmpty,
  nodesList,
  nodesError,
  requestJson,
  setNodesData: (value) => { nodesData = value || []; },
  setGroupsData: (value) => { groupsData = value || []; },
  setGeoIpStatus: (value) => { geoIpStatus = value || null; },
  clearSelectedNodeIds: () => { selectedNodeIds.clear(); },
  renderGroupTabs,
  renderNodesElement,
  renderGeoIpStatus,
  updateCoreStatus,
  renderSystemProxyNodeOptions,
});

const loadSystemStatus = () => loadSystemRuntimeStatus({
  requestJson,
  renderGeoIpStatus,
  renderRulesetDatabaseStatus,
  updateCoreStatus,
  setRoutingNodeOptions: (value) => { if (value) routingNodeOptions = value; },
  extractRoutingObservability,
  renderRoutingObservability: (entries) => {
    routingObservabilityEntries = entries;
    renderRoutingObservability();
  },
  loadRoutingHits,
  showToast,
});

const refreshGeoIp = () => refreshGeoIpData({
  geoIpRefreshBtn,
  requestJson,
  renderGeoIpStatus,
  getGeoIpStatus: () => geoIpStatus,
  loadNodes,
  showToast,
});

const refreshRulesetDatabase = () => refreshRulesetDatabaseState({
  rulesetDbRefreshBtn,
  requestJson,
  renderRulesetDatabaseStatus,
  getRulesetDatabaseStatus: () => rulesetDatabaseStatus,
  loadSystemStatus,
  showToast,
});

const importLink = (event) => importNodeLink({
  event,
  importUrlInput,
  importForm,
  currentGroup,
  requestJson,
  setNodesData: (value) => { nodesData = value || []; },
  renderNodesElement,
  syncNodeMutationFeedback,
  showInlineMessage,
  nodesError,
});

const syncSub = (event) => syncSubscriptionNodes({
  event,
  syncUrlInput,
  syncForm,
  requestJson,
  setNodesData: (value) => { nodesData = value || []; },
  renderNodesElement,
  syncNodeMutationFeedback,
  showInlineMessage,
  nodesError,
});

const deleteNode = (id) => deleteNodeRecord({
  id,
  requestJson,
  setNodesData: (value) => { nodesData = value || []; },
  renderNodesElement,
  syncNodeMutationFeedback,
  showInlineMessage,
  nodesError,
});

const testNode = (id) => testSingleNode({
  id,
  requestJson,
  updateCoreStatus,
  showToast,
  applyLatencyResult,
});

const updateBulkBar = () => updateBulkBarView({
  selectedNodeIds,
  groupsData,
  nodesData,
  requestJson,
  setNodesData: (value) => { nodesData = value || []; },
  setGroupsData: (value) => { groupsData = value || []; },
  clearSelectedNodeIds: () => { selectedNodeIds.clear(); },
  renderGroupTabs,
  renderNodesElement,
  showToast,
});

const testAllNodes = () => testAllNodesView({
  activeGroupTab,
  nodesData,
  nodeSearchQuery,
  testAllBtn,
  requestJson,
  updateCoreStatus,
  applyLatencyResult,
  resetLatencyPlaceholders,
  showToast,
});

const runCoreAction = (action) => runCoreActionView({
  action,
  saveRestartBtn,
  requestJson,
  showToast,
  updateRestartWarning,
  updateCoreStatus,
  loadNodes,
});

bindNodesPanelEvents({
  showImportBtn,
  importForm,
  syncForm,
  importUrlInput,
  testAllBtn,
  testAllNodes,
  selectedNodeIds,
  showConfirmModal,
  requestJson,
  loadNodes,
  showToast,
  renderNodesElement,
  updateBulkBar,
  setNodeSearchQuery: (value) => { nodeSearchQuery = value; },
  getActiveGroupTab: () => activeGroupTab,
  resetActiveGroup: () => {
    activeGroupTab = null;
    currentGroup = null;
  },
  renderGroupTabs,
  showSyncBtn,
  syncUrlInput,
  manualAddBtn,
  prepareManualNodeDraft: () => prepareManualNodeDraft({
    currentGroup,
    setCurrentEditNodeId: (value) => { currentEditNodeId = value; },
    editJsonInput,
    editNodeGroupInput,
    editCountryOverrideInput,
    editModal,
  }),
  closePanelBtn,
  importLink,
  syncSub,
});

// Modal logic
const closeModal = () => closeNodeEditModalView({
  editModal,
  setCurrentEditNodeId: (value) => { currentEditNodeId = value; },
  editJsonInput,
  editNodeGroupInput,
  editCountryOverrideInput,
});

const editNodeGroupInput = document.querySelector('#edit-node-group');

const openEditModal = (id) => openNodeEditModalView({
  id,
  nodesData,
  setCurrentEditNodeId: (value) => { currentEditNodeId = value; },
  editNodeGroupInput,
  editCountryOverrideInput,
  editJsonInput,
  editModal,
});

bindNodeEditEvents({
  closeModalBtns,
  closeModal,
  saveNodeBtn,
  saveNodeEdit: () => saveNodeEdit({
    saveNodeBtn,
    editJsonInput,
    editNodeGroupInput,
    editCountryOverrideInput,
    currentEditNodeId,
    requestJson,
    setNodesData: (value) => { nodesData = value || []; },
    renderNodesElement,
    syncNodeMutationFeedback,
    closeModal,
    showToast,
  }),
  saveRestartBtn,
  runCoreAction,
});

// --- TAURI SHELL ROUTER LOGIC ---
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

bindViewLifecycle({
  navItems,
  views,
  startTrafficPolling,
  stopTrafficPolling,
  loadSystemStatus,
  loadRoutingRules,
  startRoutingStatusPolling,
  stopRoutingStatusPolling,
  loadNodeGroups,
  startNodeGroupAutoTest,
  stopNodeGroupAutoTest,
  runNodeGroupAutoBackfillIfNeeded,
  markRoutingHitsAsSeen,
  updateRoutingLogNavBadge,
});

// --- DASHBOARD MASTER SWITCH LOGIC ---
const masterSwitch = document.getElementById('master-switch');
const masterStatusText = document.getElementById('master-status-text');

bindSystemEvents({
  masterSwitch,
  masterStatusText,
  requestJson,
  systemProxyModeSelect,
  updateCoreStatus,
  showToast,
  loadNodes,
  loadSystemStatus,
  dashActiveNodeSelect,
  renderSystemProxyNodeOptions,
  getNodesData: () => nodesData,
  updateRestartWarning,
  getCurrentCoreState: () => currentCoreState,
  autoStartToggle,
  renderRoutingModeBanner,
});

bindRoutingEvents({
  routingAddRuleBtn,
  openRoutingRuleModal,
  routingAddRulesetBtn,
  createRoutingRulesetDraft,
  createRoutingRulesetEntryDraft,
  getRoutingRulesets: () => routingRulesets,
  setRoutingRulesets: (value) => { routingRulesets = value; },
  buildRoutingRulesetErrors,
  setRoutingRulesetErrors: (value) => { routingRulesetErrors = value; },
  setRoutingDirty: (value) => { routingDirty = value; },
  renderRoutingRules,
  routingSaveBtn,
  saveRoutingRules,
  routingRulesetPresetSelect,
  getBuiltinRulesetById,
  showToast,
  routingPresetSelect,
  applyRoutingPreset,
  getRoutingRules: () => routingRules,
  setRoutingRules: (value) => { routingRules = value; },
  buildRoutingRuleErrors,
  setRoutingRuleErrors: (value) => { routingRuleErrors = value; },
  routingObservabilityRefreshBtn,
  loadSystemStatus,
  routingRuleModalConfirm,
  submitRoutingRuleModal,
  routingRuleModalClose,
  closeRoutingRuleModal,
  routingRuleModalCancel,
  routingRuleModalAction,
  routingRuleModalNode,
  getNodeGroups: () => nodeGroups,
  getNodeGroupDisplayName,
  getRoutingNodeOptions: () => routingNodeOptions,
  escapeHtml,
  routingRuleModalNodeField,
  routingLogSearchInput,
  applyRoutingLogSearch,
  routingLogKindFilter,
  setRoutingLogKindQuery: (value) => { routingLogKindQuery = value; },
  renderRoutingObservability,
  routingLogViewStatsBtn,
  setRoutingLogViewMode: (value) => { routingLogViewMode = value; },
  updateRoutingLogViewModeButtons,
  routingLogViewTimelineBtn,
  routingLogSearchClearBtn,
  resetRoutingLogSearch: () => { routingLogSearchQuery = ''; },
  updateRoutingLogSearchControls,
});

bindAppMiscEvents({
  geoIpRefreshBtn,
  refreshGeoIp,
  rulesetDbRefreshBtn,
  refreshRulesetDatabase,
  nodeGroupAutoIntervalSelect,
  setNodeGroupAutoTestIntervalMs: (value) => { nodeGroupAutoTestIntervalMs = value; },
  renderNodeGroupTestMeta,
  persistNodeGroupTestingState,
  showToast,
  stopNodeGroupAutoTest,
  startNodeGroupAutoTest,
  nodeGroupSearchInput,
  setNodeGroupSearchQuery: (value) => { nodeGroupSearchQuery = value; },
  renderNodeGroups,
  nodeGroupAddBtn,
  showNodeGroupConfigModal,
  requestJson,
  loadNodeGroups,
});

bindWindowChromeFallbacks({ showToast });

runInitialAppBootstrap({
  updateRoutingLogViewModeButtons,
  loadNodes,
  loadSystemStatus,
  startTrafficPolling,
});
