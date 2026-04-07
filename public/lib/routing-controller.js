import { closeRoutingRuleModal as closeRoutingRuleModalView, openRoutingRuleModal as openRoutingRuleModalView, renderRoutingRules as renderRoutingRulesView, submitRoutingRuleModal as submitRoutingRuleModalView } from './routing-editor.js';
import { loadRoutingRulesData, saveRoutingRulesData, showRoutingError as showRoutingErrorView } from './routing-dataflow.js';
import { extractRoutingObservability, renderRoutingObservability as renderRoutingObservabilityView } from './routing-observability.js';
import { markRoutingHitsAsSeen as markRoutingHitsAsSeenView, renderRoutingModeBanner as renderRoutingModeBannerView, updateRoutingLogNavBadge as updateRoutingLogNavBadgeView, updateRoutingLogSearchControls as updateRoutingLogSearchControlsView, updateRoutingLogViewModeButtons as updateRoutingLogViewModeButtonsView } from './routing-ui.js';
import { applyRoutingPreset, buildRoutingRuleErrors, buildRoutingRulesetErrors, buildUnifiedRoutingRows, createRoutingRuleDraft, createRoutingRulesetDraft, createRoutingRulesetEntryDraft, getBuiltinRulesetById, normalizeRoutingRule, normalizeRoutingRulesetEntry, renderRulesetRuntimeMeta, summarizeUnifiedRoutingRow, validateRoutingRule } from './routing-core.js';
import { debounce } from './utils.js';

export const createRoutingController = ({
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
  runCoreAction,
  getCurrentCoreState,
  getRoutingMode,
  getNodeGroups,
  setNodeGroups,
  getRoutingNodeOptions,
  setRoutingNodeOptions,
  getNodeGroupDisplayName,
  getRulesetDatabaseStatus,
  escapeHtml,
  escapeRegExp,
}) => {
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
  let routingLogSearchQuery = '';
  let routingLogKindQuery = 'all';
  let routingLogViewMode = 'stats';
  let routingBuiltinRulesets = [];
  let editingRoutingRuleId = null;

  const updateRoutingSaveState = () => {
    if (!routingSaveBtn) return;
    const inSavedFlash = !routingDirty && !routingSavingState && Date.now() < routingSavedFlashUntil;
    routingSaveBtn.disabled = routingSavingState || routingLoadingState || !routingDirty;
    routingSaveBtn.textContent = routingSavingState
      ? '保存中...'
      : routingDirty
        ? '保存规则'
        : inSavedFlash
          ? '已保存'
          : '保存规则';
  };

  const renderRoutingRulesetPresetOptions = () => {
    if (!routingRulesetPresetSelect) return;
    routingRulesetPresetSelect.innerHTML = [
      '<option value="">添加内置规则集...</option>',
      ...routingBuiltinRulesets.map((ruleset) => `<option value="${escapeHtml(ruleset.id)}">${escapeHtml(ruleset.name)}</option>`)
    ].join('');
  };

  const renderRoutingObservability = () => renderRoutingObservabilityView({
    routingObservability,
    routingObservabilityLines,
    routingObservabilityStatus,
    routingLogMode,
    routingLogSystemProxy,
    routingLogCoreStatus,
    routingLogResultCount,
    currentCoreState: getCurrentCoreState(),
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
    nodeGroups: getNodeGroups(),
    routingNodeOptions: getRoutingNodeOptions(),
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
    currentCoreState: getCurrentCoreState(),
    routingRules,
    routingRulesets,
    escapeHtml,
    escapeRegExp,
    onEnableSystemProxyRule: () => enableRuleRoutingFlow({ enableSystemProxy: true }),
    onStartCore: () => runCoreAction('start'),
  });

  const showRoutingError = (message) => showRoutingErrorView({
    routingError,
    routingLoading,
    routingEmpty,
    routingRulesContainer,
    message,
  });

  const renderRoutingRules = () => {
    const routingNodeOptions = getRoutingNodeOptions();
    const nodeGroups = getNodeGroups();
    const unifiedRows = buildUnifiedRoutingRows(routingRules, routingRulesets).map((row) => ({
      ...row,
      summary: summarizeUnifiedRoutingRow({
        row,
        routingNodeOptions,
        nodeGroups,
        getNodeGroupDisplayName,
      })
    }));

    return renderRoutingRulesView({
      routingRulesContainer,
      routingLoading,
      routingEmpty,
      routingError,
      routingLoadingState,
      routingRules,
      routingRulesets,
      routingRuleErrors,
      routingRulesetErrors,
      routingBuiltinRulesets,
      routingNodeOptions,
      nodeGroups,
      unifiedRows: unifiedRows.map((row) => ({
        ...row,
        routingNodeOptions,
        nodeGroups,
        getNodeGroupDisplayName,
        routingBuiltinRulesets,
        rulesetErrors: routingRulesetErrors,
        rulesetDatabaseStatus: getRulesetDatabaseStatus(),
      })),
      escapeHtml,
      getNodeGroupDisplayName,
      renderRulesetRuntimeMeta,
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
          const builtin = getBuiltinRulesetById(routingBuiltinRulesets, ruleset.presetId);
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
  };

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
    nodeGroups: getNodeGroups(),
    setNodeGroups,
    setRoutingBuiltinRulesets: (value) => { routingBuiltinRulesets = value || []; },
    currentCoreState: getCurrentCoreState(),
    setRoutingNodeOptions,
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
    nodeGroups: getNodeGroups(),
    setNodeGroups,
    routingBuiltinRulesets,
    setRoutingBuiltinRulesets: (value) => { routingBuiltinRulesets = value || []; },
    currentCoreState: getCurrentCoreState(),
    setRoutingNodeOptions,
    renderRoutingRulesetPresetOptions,
    updateCoreStatus,
    extractRoutingObservability,
    setRoutingObservabilityEntries: (value) => { routingObservabilityEntries = value || []; },
    setRoutingSavedFlashUntil: (value) => { routingSavedFlashUntil = value; },
    getRoutingMode,
  });

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
      routingLogSeenIds = new Set(routingHits.filter((hit) => hit?.id && routingLogSeenIds.has(String(hit.id))).map((hit) => String(hit.id)));

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

  return {
    extractRoutingObservability,
    applyRoutingPreset,
    buildRoutingRuleErrors,
    buildRoutingRulesetErrors,
    createRoutingRulesetDraft,
    createRoutingRulesetEntryDraft,
    getBuiltinRulesetById,
    openRoutingRuleModal,
    closeRoutingRuleModal,
    submitRoutingRuleModal,
    renderRoutingRules,
    renderRoutingModeBanner,
    renderRoutingObservability,
    loadRoutingRules,
    saveRoutingRules,
    loadRoutingHits,
    markRoutingHitsAsSeen,
    updateRoutingLogNavBadge,
    updateRoutingLogSearchControls,
    updateRoutingLogViewModeButtons,
    applyRoutingLogSearch,
    setRoutingLogKindQuery: (value) => { routingLogKindQuery = value; },
    setRoutingLogViewMode: (value) => { routingLogViewMode = value; },
    resetRoutingLogSearch: () => { routingLogSearchQuery = ''; },
    getRoutingRules: () => routingRules,
    setRoutingRules: (value) => { routingRules = value; },
    getRoutingRulesets: () => routingRulesets,
    setRoutingRulesets: (value) => { routingRulesets = value; },
    getRoutingBuiltinRulesets: () => routingBuiltinRulesets,
    setRoutingRuleErrors: (value) => { routingRuleErrors = value; },
    setRoutingRulesetErrors: (value) => { routingRulesetErrors = value; },
    setRoutingDirty: (value) => { routingDirty = value; },
  };
};
