export const bindRoutingEvents = ({
  routingAddRuleBtn,
  openRoutingRuleModal,
  routingAddRulesetBtn,
  createRoutingRulesetDraft,
  createRoutingRulesetEntryDraft,
  getRoutingRulesets,
  setRoutingRulesets,
  buildRoutingRulesetErrors,
  setRoutingRulesetErrors,
  setRoutingDirty,
  renderRoutingRules,
  routingSaveBtn,
  saveRoutingRules,
  routingRulesetPresetSelect,
  getBuiltinRulesetById,
  showToast,
  routingPresetSelect,
  applyRoutingPreset,
  getRoutingRules,
  setRoutingRules,
  buildRoutingRuleErrors,
  setRoutingRuleErrors,
  routingObservabilityRefreshBtn,
  loadSystemStatus,
  routingRuleModalConfirm,
  submitRoutingRuleModal,
  routingRuleModalClose,
  closeRoutingRuleModal,
  routingRuleModalCancel,
  routingRuleModalAction,
  routingRuleModalNode,
  nodeGroups,
  getNodeGroupDisplayName,
  routingNodeOptions,
  escapeHtml,
  routingRuleModalNodeField,
  routingLogSearchInput,
  applyRoutingLogSearch,
  routingLogKindFilter,
  setRoutingLogKindQuery,
  renderRoutingObservability,
  routingLogViewStatsBtn,
  setRoutingLogViewMode,
  updateRoutingLogViewModeButtons,
  routingLogViewTimelineBtn,
  routingLogSearchClearBtn,
  resetRoutingLogSearch,
  updateRoutingLogSearchControls,
}) => {
  routingAddRuleBtn?.addEventListener('click', () => openRoutingRuleModal());

  routingAddRulesetBtn?.addEventListener('click', () => {
    const rulesets = getRoutingRulesets();
    const nextRulesets = [...rulesets, createRoutingRulesetDraft({ kind: 'custom', name: `自定义规则集 ${rulesets.length + 1}`, entries: [createRoutingRulesetEntryDraft()] })];
    setRoutingRulesets(nextRulesets);
    setRoutingRulesetErrors(buildRoutingRulesetErrors(nextRulesets));
    setRoutingDirty(true);
    renderRoutingRules();
  });

  routingSaveBtn?.addEventListener('click', saveRoutingRules);

  routingRulesetPresetSelect?.addEventListener('change', () => {
    const builtin = getBuiltinRulesetById(routingRulesetPresetSelect.value);
    if (!builtin) return;
    const nextRulesets = [...getRoutingRulesets(), createRoutingRulesetDraft({
      kind: 'builtin',
      presetId: builtin.id,
      name: builtin.name,
      target: 'default'
    })];
    setRoutingRulesets(nextRulesets);
    setRoutingRulesetErrors(buildRoutingRulesetErrors(nextRulesets));
    routingRulesetPresetSelect.value = '';
    setRoutingDirty(true);
    renderRoutingRules();
    showToast(`已添加规则集 ${builtin.name}`, 'success');
  });

  routingPresetSelect?.addEventListener('change', () => {
    const rulesToAppend = applyRoutingPreset(routingPresetSelect.value);
    if (!rulesToAppend.length) return;
    const nextRules = [...getRoutingRules(), ...rulesToAppend];
    setRoutingRules(nextRules);
    setRoutingRuleErrors(buildRoutingRuleErrors(nextRules));
    setRoutingDirty(true);
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
    setRoutingLogKindQuery(routingLogKindFilter.value || 'all');
    renderRoutingObservability();
  });

  routingLogViewStatsBtn?.addEventListener('click', () => {
    setRoutingLogViewMode('stats');
    updateRoutingLogViewModeButtons();
    renderRoutingObservability();
  });

  routingLogViewTimelineBtn?.addEventListener('click', () => {
    setRoutingLogViewMode('timeline');
    updateRoutingLogViewModeButtons();
    renderRoutingObservability();
  });

  routingLogSearchClearBtn?.addEventListener('click', () => {
    resetRoutingLogSearch();
    if (routingLogSearchInput) {
      routingLogSearchInput.value = '';
      routingLogSearchInput.focus();
    }
    updateRoutingLogSearchControls();
    renderRoutingObservability();
  });
};
