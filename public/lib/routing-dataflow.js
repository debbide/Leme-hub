export const showRoutingError = ({ routingError, routingLoading, routingEmpty, routingRulesContainer, message }) => {
  if (!routingError || !routingLoading || !routingEmpty || !routingRulesContainer) return;
  routingLoading.classList.add('hidden');
  routingEmpty.classList.add('hidden');
  routingRulesContainer.classList.add('hidden');
  routingError.classList.remove('hidden');
  const messageEl = routingError.querySelector('.state-msg');
  if (messageEl) messageEl.textContent = message;
};

export const loadRoutingRulesData = async ({
  force = false,
  routingLoaded,
  routingDirty,
  routingLoadingState,
  setRoutingLoadingState,
  setRoutingRuleErrors,
  setRoutingRulesetErrors,
  renderRoutingRules,
  requestJson,
  createRoutingRuleDraft,
  createRoutingRulesetDraft,
  setRoutingRules,
  setRoutingRulesets,
  setRoutingRowOrder,
  nodeGroups,
  setNodeGroups,
  setRoutingBuiltinRulesets,
  currentCoreState,
  setRoutingNodeOptions,
  renderRoutingRulesetPresetOptions,
  buildRoutingRuleErrors,
  buildRoutingRulesetErrors,
  updateCoreStatus,
  extractRoutingObservability,
  setRoutingObservabilityEntries,
  setRoutingLoaded,
  setRoutingDirty,
  showRoutingError,
  updateRoutingSaveState,
  renderRoutingModeBanner,
}) => {
  // Never discard unsaved local edits — not on view switches, not on explicit refresh.
  // Only fetch from server on first load or when the editor is clean.
  if (routingLoaded && routingDirty) {
    renderRoutingRules();
    updateRoutingSaveState?.();
    renderRoutingModeBanner?.();
    return;
  }
  if (!force && routingLoaded) {
    renderRoutingRules();
    return;
  }
  if (routingLoadingState) return;

  setRoutingLoadingState(true);
  setRoutingRuleErrors({});
  setRoutingRulesetErrors({ rulesetErrors: {}, entryErrors: {} });
  renderRoutingRules();

  try {
    const payload = await requestJson('/api/system/rules');
    // Re-check dirty after the await: user may have edited while loading.
    if (routingDirty) {
      if (payload.core) updateCoreStatus(payload.core);
      return;
    }
    const nextRules = (payload.customRules || payload.rules || []).filter((rule) => rule && typeof rule === 'object').map((rule) => createRoutingRuleDraft(rule));
    const nextRulesets = (payload.rulesets || []).filter((ruleset) => ruleset && typeof ruleset === 'object').map((ruleset) => createRoutingRulesetDraft(ruleset));
    setRoutingRules(nextRules);
    setRoutingRulesets(nextRulesets);
    setRoutingRowOrder(payload.routingItems || []);
    setNodeGroups(payload.nodeGroups || nodeGroups);
    setRoutingBuiltinRulesets(payload.builtinRulesets || []);
    setRoutingNodeOptions(payload.core?.nodes || currentCoreState?.nodes || []);
    renderRoutingRulesetPresetOptions();
    setRoutingRuleErrors(buildRoutingRuleErrors(nextRules));
    setRoutingRulesetErrors(buildRoutingRulesetErrors(nextRulesets));
    if (payload.core) updateCoreStatus(payload.core);
    setRoutingObservabilityEntries(extractRoutingObservability(payload.core));
    setRoutingLoaded(true);
    setRoutingDirty(false);
  } catch (error) {
    showRoutingError(`分流规则加载失败: ${error.message}`);
  } finally {
    setRoutingLoadingState(false);
    updateRoutingSaveState();
    renderRoutingModeBanner();
    renderRoutingRules();
  }
};

export const saveRoutingRulesData = async ({
  routingSavingState,
  routingRules,
  normalizeRoutingRule,
  buildRoutingRuleErrors,
  setRoutingRuleErrors,
  routingRulesets,
  routingRowOrder,
  normalizeRoutingRulesetEntry,
  buildRoutingRulesetErrors,
  setRoutingRulesetErrors,
  setRoutingRowOrder,
  setRoutingDirty,
  renderRoutingRules,
  showToast,
  showConfirmModal,
  setRoutingSavingState,
  updateRoutingSaveState,
  requestJson,
  createRoutingRuleDraft,
  createRoutingRulesetDraft,
  setRoutingRules,
  setRoutingRulesets,
  buildRoutingItemsFromUnifiedRows,
  nodeGroups,
  setNodeGroups,
  routingBuiltinRulesets,
  setRoutingBuiltinRulesets,
  currentCoreState,
  setRoutingNodeOptions,
  renderRoutingRulesetPresetOptions,
  updateCoreStatus,
  extractRoutingObservability,
  setRoutingObservabilityEntries,
  setRoutingSavedFlashUntil,
  getRoutingMode,
}) => {
  if (routingSavingState) return;
  const normalized = routingRules.map((rule) => normalizeRoutingRule(rule));
  const nextErrors = buildRoutingRuleErrors(normalized);
  setRoutingRuleErrors(nextErrors);

  const normalizedRulesets = routingRulesets.map((ruleset) => ({
    id: String(ruleset.id || `ruleset-${Date.now()}`),
    kind: ruleset.kind,
    presetId: ruleset.kind === 'builtin' ? String(ruleset.presetId || '').trim() : null,
    name: String(ruleset.name || '').trim(),
    enabled: ruleset.enabled !== false,
    target: ruleset.target,
    nodeId: ruleset.target === 'node' ? String(ruleset.nodeId || '').trim() : null,
    groupId: ruleset.target === 'node_group' ? String(ruleset.groupId || '').trim() : null,
    entries: ruleset.kind === 'custom' ? (ruleset.entries || []).map((entry) => normalizeRoutingRulesetEntry(entry)) : [],
    url: ruleset.kind === 'remote' ? String(ruleset.url || '').trim() : null,
    format: ruleset.kind === 'remote' ? ruleset.format || 'binary' : null,
    note: String(ruleset.note || '').trim()
  }));
  const nextRulesetErrors = buildRoutingRulesetErrors(normalizedRulesets);
  setRoutingRulesetErrors(nextRulesetErrors);

  if (Object.values(nextErrors).some((errors) => Object.keys(errors).length > 0)
    || Object.values(nextRulesetErrors.rulesetErrors || {}).some((errors) => Object.keys(errors).length > 0)
    || Object.values(nextRulesetErrors.entryErrors || {}).some((group) => Object.values(group).some((errors) => Object.keys(errors).length > 0))) {
    setRoutingDirty(true);
    renderRoutingRules();
    showToast('请先修正分流规则中的错误', 'error');
    return;
  }

  setRoutingSavingState(true);
  updateRoutingSaveState();
  try {
    const normalizedRoutingItems = buildRoutingItemsFromUnifiedRows({
      rules: normalized,
      rulesets: normalizedRulesets,
      orderedRows: routingRowOrder,
    });
    const allowEmptyRoutingClear = normalizedRoutingItems.length === 0
      ? typeof showConfirmModal === 'function'
        ? await showConfirmModal('清空分流配置', '当前保存结果为空，会删除全部分流规则。确认继续吗？')
        : confirm('当前保存结果为空，会删除全部分流规则。确认继续吗？')
      : false;
    if (normalizedRoutingItems.length === 0 && !allowEmptyRoutingClear) {
      setRoutingDirty(true);
      renderRoutingRules();
      showToast('已取消清空分流配置', 'info');
      return;
    }
    const payload = await requestJson('/api/system/rules', {
      method: 'PUT',
      body: JSON.stringify({
        routingItems: normalizedRoutingItems,
        customRules: normalized,
        rulesets: normalizedRulesets,
        allowEmptyRoutingClear,
      })
    });
    const nextRules = (payload.customRules || payload.rules || []).filter((rule) => rule && typeof rule === 'object').map((rule) => createRoutingRuleDraft(rule));
    const nextRulesets = (payload.rulesets || []).filter((ruleset) => ruleset && typeof ruleset === 'object').map((ruleset) => createRoutingRulesetDraft(ruleset));
    setRoutingRules(nextRules);
    setRoutingRulesets(nextRulesets);
    setRoutingRowOrder(payload.routingItems || normalizedRoutingItems);
    setNodeGroups(payload.nodeGroups || nodeGroups);
    setRoutingBuiltinRulesets(payload.builtinRulesets || routingBuiltinRulesets);
    setRoutingNodeOptions(payload.core?.nodes || currentCoreState?.nodes || []);
    renderRoutingRulesetPresetOptions();
    setRoutingRuleErrors(buildRoutingRuleErrors(nextRules));
    setRoutingRulesetErrors(buildRoutingRulesetErrors(nextRulesets));
    setRoutingDirty(false);
    const savedUntil = Date.now() + 3000;
    setRoutingSavedFlashUntil(savedUntil);
    updateCoreStatus(payload.core);
    setRoutingObservabilityEntries(extractRoutingObservability(payload.core));
    renderRoutingRules();

    setTimeout(() => {
      if (Date.now() >= savedUntil) {
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
    setRoutingSavingState(false);
    updateRoutingSaveState();
  }
};
