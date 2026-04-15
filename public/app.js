import { createToastController, showConfirmModal, showInputModal } from './lib/ui.js';
import { createNodesPanelController } from './lib/nodes-panel.js';
import { createRoutingController } from './lib/routing-controller.js';
import { pollTraffic as pollTrafficView, renderProxyEndpoints as renderProxyEndpointsView, renderSystemProxyNodeOptions as renderSystemProxyNodeOptionsView, updateCoreStatus as updateCoreStatusView, updateSpeedCard as updateSpeedCardView } from './lib/dashboard-system.js';
import { createNodeGroupsController } from './lib/node-groups-controller.js';
import { closeNodeEditModal as closeNodeEditModalView, openNodeEditModal as openNodeEditModalView, prepareManualNodeDraft, saveNodeEdit } from './lib/node-edit-modal.js';
import { bindNodeEditEvents } from './lib/node-edit-bindings.js';
import { showInlineMessage } from './lib/nodes-ui.js';
import { bindRoutingEvents } from './lib/routing-bindings.js';
import { bindSystemEvents } from './lib/system-bindings.js';
import { applySystemSettingsSnapshot, loadSystemRuntimeStatus, refreshGeoIpData, refreshRulesetDatabaseState, runCoreAction as runCoreActionView, startRoutingStatusPolling as startRoutingStatusPollingView, startTrafficPolling as startTrafficPollingView, stopRoutingStatusPolling as stopRoutingStatusPollingView, stopTrafficPolling as stopTrafficPollingView } from './lib/system-runtime.js';
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
const syncNameInput = document.querySelector('#sync-name');
const nodeCountLabel = document.querySelector('#node-count-label');
const subscriptionsPanel = document.querySelector('#subscriptions-panel');
const subscriptionsEmpty = document.querySelector('#subscriptions-empty');
const subscriptionsList = document.querySelector('#subscriptions-list');
const subscriptionsSummary = document.querySelector('#subscriptions-summary');
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
const dnsRemoteServerInput = document.querySelector('#dns-remote-server');
const dnsDirectServerInput = document.querySelector('#dns-direct-server');
const dnsBootstrapServerInput = document.querySelector('#dns-bootstrap-server');
const dnsFinalSelect = document.querySelector('#dns-final-select');
const dnsStrategySelect = document.querySelector('#dns-strategy-select');
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
let routingStatusPoller = null;
let lastTrafficSample = null;
let speedHistory = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let geoIpStatus = null;
let rulesetDatabaseStatus = null;
let routingNodeOptions = [];
const TRAFFIC_POLL_INTERVAL_MS = 2000;
const getRoutingMode = () => currentCoreState?.proxy?.mode || systemProxyModeSelect?.value || 'rule';

const loadNodeGroups = () => nodeGroupsController.loadNodeGroups();
const startNodeGroupAutoTest = () => nodeGroupsController.startNodeGroupAutoTest();
const stopNodeGroupAutoTest = () => nodeGroupsController.stopNodeGroupAutoTest();
const runNodeGroupAutoBackfillIfNeeded = () => nodeGroupsController.runNodeGroupAutoBackfillIfNeeded();

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
  } else if (rulesetDatabaseStatus.pending) {
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
    rulesetDbRefreshBtn.disabled = Boolean(rulesetDatabaseStatus?.pending);
    rulesetDbRefreshBtn.textContent = rulesetDatabaseStatus?.pending ? '规则库下载中...' : '更新规则库';
  }

  if (document.getElementById('routing-view')?.classList.contains('active')) {
    routingController?.renderRoutingRules?.();
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
  renderRoutingModeBanner: () => routingController.renderRoutingModeBanner(),
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

const groupTabsEl = document.querySelector('#group-tabs');
const addGroupBtn = document.querySelector('#add-group-btn');

const nodeGroupsController = createNodeGroupsController({
  nodeGroupsList,
  nodeGroupAddBtn,
  nodeGroupModal,
  nodeGroupModalTitle,
  nodeGroupModalName,
  nodeGroupModalType,
  nodeGroupModalCountry,
  nodeGroupModalIconMode,
  nodeGroupModalEmojiWrap,
  nodeGroupModalIconEmoji,
  nodeGroupModalDefaultNode,
  nodeGroupModalNote,
  nodeGroupModalError,
  nodeGroupModalConfirm,
  nodeGroupModalCancel,
  nodeGroupModalClose,
  nodeGroupsLastTestEl,
  nodeGroupsNextTestEl,
  nodeGroupAutoIntervalSelect,
  nodeGroupSearchInput,
  nodeGroupSearchCount,
  requestJson,
  showToast,
  updateCoreStatus,
  loadNodes: () => loadNodes(),
  showInlineMessage,
  escapeHtml,
  getRoutingNodeOptions: () => routingNodeOptions,
  setRoutingNodeOptions: (value) => { routingNodeOptions = value || []; },
});

const nodesPanel = createNodesPanelController({
  nodesList,
  nodesTbody,
  nodesState,
  nodesLoading,
  nodesEmpty,
  nodesError,
  showImportBtn,
  showSyncBtn,
  manualAddBtn,
  testAllBtn,
  closePanelBtn,
  importForm,
  syncForm,
  importUrlInput,
  syncUrlInput,
  syncNameInput,
  nodeCountLabel,
  groupTabsEl,
  addGroupBtn,
  subscriptionsPanel,
  subscriptionsEmpty,
  subscriptionsList,
  subscriptionsSummary,
  showInputModal,
  showConfirmModal,
  showToast,
  requestJson,
  escapeHtml,
  renderGeoIpStatus,
  updateCoreStatus,
  renderSystemProxyNodeOptions,
  syncNodeMutationFeedback,
  prepareManualNodeDraft: (currentGroup) => prepareManualNodeDraft({
    currentGroup,
    setCurrentEditNodeId: (value) => { currentEditNodeId = value; },
    editJsonInput,
    editNodeGroupInput,
    editCountryOverrideInput,
    editModal,
  }),
  openEditModal: (id) => openEditModal(id),
  setGeoIpStatus: (value) => { geoIpStatus = value || null; },
  getCurrentCoreState: () => currentCoreState,
});

const loadNodes = () => nodesPanel.loadNodes();

const routingController = createRoutingController({
  routingModeBanner,
  routingRulesContainer,
  routingLoading,
  routingEmpty,
  routingError,
  routingSaveBtn,
  routingRulesetPresetSelect,
  routingObservability,
  routingObservabilityLines,
  routingObservabilityStatus,
  routingLogMode,
  routingLogSystemProxy,
  routingLogCoreStatus,
  routingLogSearchClearBtn,
  routingLogViewStatsBtn,
  routingLogViewTimelineBtn,
  routingLogResultCount,
  routingLogNavBadge,
  routingRuleModal,
  routingRuleModalTitle,
  routingRuleModalType,
  routingRuleModalAction,
  routingRuleModalNodeField,
  routingRuleModalNode,
  routingRuleModalValue,
  routingRuleModalNote,
  routingRuleModalError,
  requestJson,
  showToast,
  updateCoreStatus,
  runCoreAction: (action) => runCoreAction(action),
  getCurrentCoreState: () => currentCoreState,
  getRoutingMode,
  getNodeGroups: () => nodeGroupsController.getNodeGroups(),
  setNodeGroups: (value) => { nodeGroupsController.setNodeGroups(value || []); },
  getRoutingNodeOptions: () => routingNodeOptions,
  setRoutingNodeOptions: (value) => { routingNodeOptions = value || []; },
  getNodeGroupDisplayName: (group) => nodeGroupsController.getNodeGroupDisplayName(group),
  getRulesetDatabaseStatus: () => rulesetDatabaseStatus,
  escapeHtml,
  escapeRegExp,
});

const loadRoutingHits = () => routingController.loadRoutingHits();
const loadSystemStatus = () => loadSystemRuntimeStatus({
  requestJson,
  renderGeoIpStatus,
  renderRulesetDatabaseStatus,
  updateCoreStatus,
  applySettingsSnapshot: (settings) => applySystemSettingsSnapshot({
    settings,
    autoStartToggle,
    dnsRemoteServerInput,
    dnsDirectServerInput,
    dnsBootstrapServerInput,
    dnsFinalSelect,
    dnsStrategySelect,
  }),
  setRoutingNodeOptions: (value) => { if (value) routingNodeOptions = value; },
  extractRoutingObservability: (core) => routingController.extractRoutingObservability(core),
  renderRoutingObservability: () => routingController.renderRoutingObservability(),
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


const runCoreAction = (action) => runCoreActionView({
  action,
  saveRestartBtn,
  requestJson,
  showToast,
  updateRestartWarning,
  updateCoreStatus,
  loadNodes,
});

nodeGroupsController.bindEvents();
nodesPanel.bindEvents();

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
  nodesData: nodesPanel.getNodesData(),
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
    setNodesData: (value) => { nodesPanel.setNodesData(value || []); },
    renderNodesElement: () => nodesPanel.renderNodesElement(),
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
  loadRoutingRules: (force) => routingController.loadRoutingRules(force),
  startRoutingStatusPolling,
  stopRoutingStatusPolling,
  loadNodeGroups,
  startNodeGroupAutoTest,
  stopNodeGroupAutoTest,
  runNodeGroupAutoBackfillIfNeeded,
  markRoutingHitsAsSeen: (hits) => routingController.markRoutingHitsAsSeen(hits),
  updateRoutingLogNavBadge: (animate) => routingController.updateRoutingLogNavBadge(animate),
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
  getNodesData: () => nodesPanel.getNodesData(),
  updateRestartWarning,
  getCurrentCoreState: () => currentCoreState,
  autoStartToggle,
  renderRoutingModeBanner: () => routingController.renderRoutingModeBanner(),
});

bindRoutingEvents({
  routingAddRuleBtn,
  openRoutingRuleModal: (rule) => routingController.openRoutingRuleModal(rule),
  routingAddRulesetBtn,
  createRoutingRulesetDraft: routingController.createRoutingRulesetDraft,
  createRoutingRulesetEntryDraft: routingController.createRoutingRulesetEntryDraft,
  getRoutingRulesets: () => routingController.getRoutingRulesets(),
  setRoutingRulesets: (value) => routingController.setRoutingRulesets(value),
  buildRoutingRulesetErrors: routingController.buildRoutingRulesetErrors,
  setRoutingRulesetErrors: (value) => routingController.setRoutingRulesetErrors(value),
  setRoutingDirty: (value) => routingController.setRoutingDirty(value),
  renderRoutingRules: () => routingController.renderRoutingRules(),
  routingSaveBtn,
  saveRoutingRules: () => routingController.saveRoutingRules(),
  routingRulesetPresetSelect,
  getBuiltinRulesetById: (presetId) => routingController.getBuiltinRulesetById(routingController.getRoutingBuiltinRulesets(), presetId),
  showToast,
  routingPresetSelect,
  applyRoutingPreset: routingController.applyRoutingPreset,
  getRoutingRules: () => routingController.getRoutingRules(),
  setRoutingRules: (value) => routingController.setRoutingRules(value),
  buildRoutingRuleErrors: routingController.buildRoutingRuleErrors,
  setRoutingRuleErrors: (value) => routingController.setRoutingRuleErrors(value),
  routingObservabilityRefreshBtn,
  loadSystemStatus,
  routingRuleModalConfirm,
  submitRoutingRuleModal: () => routingController.submitRoutingRuleModal(),
  routingRuleModalClose,
  closeRoutingRuleModal: () => routingController.closeRoutingRuleModal(),
  routingRuleModalCancel,
  routingRuleModalAction,
  routingRuleModalNode,
  getNodeGroups: () => nodeGroupsController.getNodeGroups(),
  getNodeGroupDisplayName: (group) => nodeGroupsController.getNodeGroupDisplayName(group),
  getRoutingNodeOptions: () => routingNodeOptions,
  escapeHtml,
  routingRuleModalNodeField,
  routingLogSearchInput,
  applyRoutingLogSearch: (value) => routingController.applyRoutingLogSearch(value),
  routingLogKindFilter,
  setRoutingLogKindQuery: (value) => routingController.setRoutingLogKindQuery(value),
  renderRoutingObservability: () => routingController.renderRoutingObservability(),
  routingLogViewStatsBtn,
  setRoutingLogViewMode: (value) => routingController.setRoutingLogViewMode(value),
  updateRoutingLogViewModeButtons: () => routingController.updateRoutingLogViewModeButtons(),
  routingLogViewTimelineBtn,
  routingLogSearchClearBtn,
  resetRoutingLogSearch: () => routingController.resetRoutingLogSearch(),
  updateRoutingLogSearchControls: () => routingController.updateRoutingLogSearchControls(),
});

bindAppMiscEvents({
  geoIpRefreshBtn,
  refreshGeoIp,
  rulesetDbRefreshBtn,
  refreshRulesetDatabase,
  nodeGroupAutoIntervalSelect,
  setNodeGroupAutoTestIntervalMs: (value) => { nodeGroupsController.setNodeGroupAutoTestIntervalMs(value); },
  renderNodeGroupTestMeta: () => nodeGroupsController.renderNodeGroupTestMeta(),
  persistNodeGroupTestingState: () => nodeGroupsController.persistNodeGroupTestingState(),
  showToast,
  stopNodeGroupAutoTest: () => nodeGroupsController.stopNodeGroupAutoTest(),
  startNodeGroupAutoTest: () => nodeGroupsController.startNodeGroupAutoTest(),
  nodeGroupSearchInput,
  setNodeGroupSearchQuery: (value) => { nodeGroupsController.setNodeGroupSearchQuery(value); },
  renderNodeGroups: () => nodeGroupsController.renderNodeGroups(),
});

bindWindowChromeFallbacks({ showToast });

runInitialAppBootstrap({
  updateRoutingLogViewModeButtons: () => routingController.updateRoutingLogViewModeButtons(),
  loadNodes,
  loadSystemStatus,
  startTrafficPolling,
});
