export const closeRoutingRuleModal = ({ routingRuleModal, routingRuleModalError, setEditingRoutingRuleId }) => {
  setEditingRoutingRuleId(null);
  routingRuleModal?.classList.remove('active');
  if (routingRuleModalError) {
    routingRuleModalError.textContent = '';
    routingRuleModalError.classList.add('hidden');
  }
};

export const openRoutingRuleModal = ({
  rule = null,
  setEditingRoutingRuleId,
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
}) => {
  setEditingRoutingRuleId(rule?.id || null);
  if (routingRuleModalTitle) {
    routingRuleModalTitle.textContent = rule ? '编辑规则' : '新增规则';
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

export const submitRoutingRuleModal = ({
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
  setRoutingRules,
  buildRoutingRuleErrors,
  setRoutingRuleErrors,
  setRoutingDirty,
  closeRoutingRuleModal,
  renderRoutingRules,
}) => {
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

  const nextRules = editingRoutingRuleId
    ? routingRules.map((rule) => rule.id === editingRoutingRuleId ? draft : rule)
    : [...routingRules, draft];

  setRoutingRules(nextRules);
  setRoutingRuleErrors(buildRoutingRuleErrors(nextRules));
  setRoutingDirty(true);
  closeRoutingRuleModal();
  renderRoutingRules();
};

const renderRuleRow = ({ row, escapeHtml }) => {
  const { data: rule, summary } = row;
  const errors = row.errors || {};
  const targetError = errors.nodeId || errors.nodeGroupId || '';

  return `
    <div class="routing-unified-row" data-row-kind="rule" data-rule-id="${escapeHtml(rule.id)}">
      <div class="routing-unified-main">
        <div class="routing-unified-handle">
          <button type="button" class="btn-outline routing-action-btn routing-move-up-btn" data-rule-id="${escapeHtml(rule.id)}" ${row.isFirst ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-outline routing-action-btn routing-move-down-btn" data-rule-id="${escapeHtml(rule.id)}" ${row.isLast ? 'disabled' : ''}>↓</button>
        </div>
        <div class="routing-unified-type">
          <span class="routing-chip is-accent">手动</span>
          <span class="routing-chip">${escapeHtml(summary.typeLabel)}</span>
        </div>
        <label class="routing-field routing-unified-field routing-unified-match">
          <span class="routing-field-label">匹配</span>
          <input class="routing-input ${errors.value ? 'has-error' : ''}" data-field="value" data-rule-id="${escapeHtml(rule.id)}" value="${escapeHtml(rule.value)}" placeholder="${rule.type === 'ip_cidr' ? '10.0.0.0/8' : 'example.com'}" autocomplete="off">
          <span class="routing-field-error">${escapeHtml(errors.value || '')}</span>
        </label>
        <label class="routing-field routing-unified-field routing-unified-target">
          <span class="routing-field-label">类型</span>
          <select class="routing-select ${errors.type ? 'has-error' : ''}" data-field="type" data-rule-id="${escapeHtml(rule.id)}">
            <option value="domain" ${rule.type === 'domain' ? 'selected' : ''}>域名</option>
            <option value="domain_suffix" ${rule.type === 'domain_suffix' ? 'selected' : ''}>后缀</option>
            <option value="domain_keyword" ${rule.type === 'domain_keyword' ? 'selected' : ''}>关键词</option>
            <option value="ip_cidr" ${rule.type === 'ip_cidr' ? 'selected' : ''}>CIDR</option>
          </select>
          <span class="routing-field-error">${escapeHtml(errors.type || '')}</span>
        </label>
        <label class="routing-field routing-unified-field routing-unified-target">
          <span class="routing-field-label">去向</span>
          <select class="routing-select ${errors.action ? 'has-error' : ''}" data-field="action" data-rule-id="${escapeHtml(rule.id)}">
            <option value="default" ${rule.action === 'default' ? 'selected' : ''}>默认代理</option>
            <option value="direct" ${rule.action === 'direct' ? 'selected' : ''}>直连</option>
            <option value="node" ${rule.action === 'node' ? 'selected' : ''}>指定节点</option>
            <option value="node_group" ${rule.action === 'node_group' ? 'selected' : ''}>节点组</option>
          </select>
          <span class="routing-field-error">${escapeHtml(errors.action || '')}</span>
        </label>
        <div class="routing-field routing-unified-field routing-unified-dest">
          <span class="routing-field-label">目标</span>
          ${rule.action === 'node'
            ? `<select class="routing-select ${errors.nodeId ? 'has-error' : ''}" data-field="nodeId" data-rule-id="${escapeHtml(rule.id)}"><option value="">选择节点</option>${row.routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === rule.nodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`).join('')}</select>`
            : rule.action === 'node_group'
              ? `<select class="routing-select ${errors.nodeGroupId ? 'has-error' : ''}" data-field="nodeGroupId" data-rule-id="${escapeHtml(rule.id)}"><option value="">选择节点组</option>${row.nodeGroups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === rule.nodeGroupId ? 'selected' : ''}>${escapeHtml(row.getNodeGroupDisplayName(group))}</option>`).join('')}</select>`
              : `<input class="routing-input" data-field="note" data-rule-id="${escapeHtml(rule.id)}" value="${escapeHtml(rule.note)}" placeholder="备注" autocomplete="off">`}
          <span class="routing-field-error">${escapeHtml(targetError)}</span>
        </div>
        <div class="routing-unified-meta">${summary.metaLabel ? `<span class="routing-inline-note">${escapeHtml(summary.metaLabel)}</span>` : ''}</div>
        <div class="routing-unified-actions">
          <button type="button" class="btn-outline routing-edit-btn" data-rule-id="${escapeHtml(rule.id)}">编辑</button>
          <button type="button" class="btn-outline routing-delete-btn" data-rule-id="${escapeHtml(rule.id)}">删除</button>
        </div>
      </div>
    </div>`;
};

const renderRulesetRow = ({ row, escapeHtml, renderRulesetRuntimeMeta }) => {
  const { data: ruleset, summary } = row;
  const rulesetErrors = (row.rulesetErrors?.rulesetErrors || {})[ruleset.id] || {};
  const entryErrors = (row.rulesetErrors?.entryErrors || {})[ruleset.id] || {};
  const destError = rulesetErrors.nodeId || rulesetErrors.groupId || '';

  return `
    <div class="routing-unified-row" data-row-kind="ruleset" data-ruleset-id="${escapeHtml(ruleset.id)}">
      <div class="routing-unified-main">
        <div class="routing-unified-handle">
          <button type="button" class="btn-outline routing-action-btn routing-ruleset-move-up-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" ${row.isFirst ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-outline routing-action-btn routing-ruleset-move-down-btn" data-ruleset-id="${escapeHtml(ruleset.id)}" ${row.isLast ? 'disabled' : ''}>↓</button>
        </div>
        <div class="routing-unified-type">
          <span class="routing-chip ${ruleset.kind === 'builtin' ? 'is-builtin' : 'is-custom'}">${ruleset.kind === 'builtin' ? '内置' : '自定义'}</span>
          <span class="routing-chip">规则集</span>
        </div>
        <label class="routing-field routing-unified-field routing-unified-match">
          <span class="routing-field-label">名称</span>
          <input class="routing-input ${rulesetErrors.name ? 'has-error' : ''}" data-ruleset-field="name" data-ruleset-id="${escapeHtml(ruleset.id)}" value="${escapeHtml(ruleset.name)}" ${ruleset.kind === 'custom' ? '' : 'readonly'}>
          <span class="routing-field-error">${escapeHtml(rulesetErrors.name || rulesetErrors.presetId || '')}</span>
        </label>
        <div class="routing-unified-gap" aria-hidden="true"></div>
        <label class="routing-field routing-unified-field routing-unified-target">
          <span class="routing-field-label">去向</span>
          <select class="routing-select ${rulesetErrors.target ? 'has-error' : ''}" data-ruleset-field="target" data-ruleset-id="${escapeHtml(ruleset.id)}">
            <option value="default" ${ruleset.target === 'default' ? 'selected' : ''}>默认代理</option>
            <option value="direct" ${ruleset.target === 'direct' ? 'selected' : ''}>直连</option>
            <option value="node" ${ruleset.target === 'node' ? 'selected' : ''}>指定节点</option>
            <option value="node_group" ${ruleset.target === 'node_group' ? 'selected' : ''}>节点组</option>
          </select>
          <span class="routing-field-error">${escapeHtml(rulesetErrors.target || '')}</span>
        </label>
        <div class="routing-field routing-unified-field routing-unified-dest">
          <span class="routing-field-label">目标</span>
          ${ruleset.target === 'node'
            ? `<select class="routing-select ${rulesetErrors.nodeId ? 'has-error' : ''}" data-ruleset-field="nodeId" data-ruleset-id="${escapeHtml(ruleset.id)}"><option value="">选择节点</option>${row.routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === ruleset.nodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`).join('')}</select>`
            : ruleset.target === 'node_group'
              ? `<select class="routing-select ${rulesetErrors.groupId ? 'has-error' : ''}" data-ruleset-field="groupId" data-ruleset-id="${escapeHtml(ruleset.id)}"><option value="">选择节点组</option>${row.nodeGroups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === ruleset.groupId ? 'selected' : ''}>${escapeHtml(row.getNodeGroupDisplayName(group))}</option>`).join('')}</select>`
              : `<div class="routing-unified-static">${escapeHtml(summary.targetLabel)}</div>`}
          <span class="routing-field-error">${escapeHtml(destError)}</span>
        </div>
        <div class="routing-unified-meta">
          <label class="routing-ruleset-inline-switch">
            <input type="checkbox" data-ruleset-field="enabled" data-ruleset-id="${escapeHtml(ruleset.id)}" ${ruleset.enabled ? 'checked' : ''}>
            <span>启用</span>
          </label>
          <div class="routing-ruleset-runtime-inline">${renderRulesetRuntimeMeta({ ruleset, routingBuiltinRulesets: row.routingBuiltinRulesets, rulesetDatabaseStatus: row.rulesetDatabaseStatus, escapeHtml })}</div>
        </div>
        <div class="routing-unified-actions">
          <button type="button" class="btn-outline routing-delete-ruleset-btn" data-ruleset-id="${escapeHtml(ruleset.id)}">删除</button>
        </div>
      </div>
      ${ruleset.kind === 'custom' ? `
        <div class="routing-unified-subrows">
          <div class="routing-inline-note">${escapeHtml(summary.metaLabel || '0 条')}</div>
          <div class="routing-field-error">${escapeHtml(rulesetErrors.entries || '')}</div>
          ${(ruleset.entries || []).map((entry) => {
            const entryError = entryErrors[entry.id] || {};
            return `
              <div class="routing-ruleset-entry" data-ruleset-entry-id="${escapeHtml(entry.id)}">
                <select class="routing-select ${entryError.type ? 'has-error' : ''}" data-ruleset-entry-field="type" data-ruleset-id="${escapeHtml(ruleset.id)}" data-ruleset-entry-id="${escapeHtml(entry.id)}">
                  <option value="domain" ${entry.type === 'domain' ? 'selected' : ''}>域名</option>
                  <option value="domain_suffix" ${entry.type === 'domain_suffix' ? 'selected' : ''}>后缀</option>
                  <option value="domain_keyword" ${entry.type === 'domain_keyword' ? 'selected' : ''}>关键词</option>
                  <option value="ip_cidr" ${entry.type === 'ip_cidr' ? 'selected' : ''}>CIDR</option>
                </select>
                <input class="routing-input ${entryError.value ? 'has-error' : ''}" data-ruleset-entry-field="value" data-ruleset-id="${escapeHtml(ruleset.id)}" data-ruleset-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(entry.value)}" placeholder="规则值" autocomplete="off">
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
};

export const renderRoutingRules = ({
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
  unifiedRows,
  escapeHtml,
  getNodeGroupDisplayName,
  renderRulesetRuntimeMeta,
  updateRoutingSaveState,
  renderRoutingModeBanner,
  onRuleFieldChange,
  onRuleDelete,
  onRuleMove,
  onRuleEdit,
  onRulesetFieldChange,
  onRulesetDelete,
  onRulesetMove,
  onRulesetAddEntry,
  onRulesetEntryFieldChange,
  onRulesetEntryDelete,
  renderRoutingObservability,
  onRenderError,
}) => {
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

    const rulesetCount = unifiedRows.filter((row) => row.kind === 'ruleset').length;
    const ruleCount = unifiedRows.filter((row) => row.kind === 'rule').length;

    routingRulesContainer.innerHTML = `
      <div class="routing-unified-list">
        <div class="routing-unified-header">
          <div>
            <div class="routing-section-title">规则列表</div>
            <div class="routing-section-note">内置规则集、自定义规则集、手动规则统一展示。规则集和手动规则暂时各自维护顺序。</div>
          </div>
          <div class="routing-unified-stats">
            <span class="routing-chip">规则集 ${rulesetCount}</span>
            <span class="routing-chip">规则 ${ruleCount}</span>
          </div>
        </div>
        <div class="routing-unified-columns" aria-hidden="true">
          <span>排序</span>
          <span>类别</span>
          <span>名称 / 匹配</span>
          <span>规则类型</span>
          <span>去向</span>
          <span>目标 / 备注</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        ${unifiedRows.map((row) => {
          const sameKindRows = unifiedRows.filter((item) => item.kind === row.kind);
          const sameKindIndex = sameKindRows.findIndex((item) => item.id === row.id);
          const rowContext = {
            ...row,
            isFirst: sameKindIndex === 0,
            isLast: sameKindIndex === sameKindRows.length - 1,
            routingNodeOptions,
            nodeGroups,
            getNodeGroupDisplayName,
            routingBuiltinRulesets,
            routingRuleErrors,
            rulesetErrors: routingRulesetErrors,
            rulesetDatabaseStatus: row.rulesetDatabaseStatus,
          };
          return row.kind === 'rule'
            ? renderRuleRow({ row: rowContext, escapeHtml })
            : renderRulesetRow({ row: rowContext, escapeHtml, renderRulesetRuntimeMeta });
        }).join('')}
      </div>`;

    routingRulesContainer.querySelectorAll('[data-field]').forEach((input) => {
      const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, (event) => onRuleFieldChange(input, event));
    });

    routingRulesContainer.querySelectorAll('.routing-delete-btn').forEach((button) => {
      button.addEventListener('click', () => onRuleDelete(button.dataset.ruleId));
    });

    routingRulesContainer.querySelectorAll('.routing-move-up-btn').forEach((button) => {
      button.addEventListener('click', () => onRuleMove(button.dataset.ruleId, -1));
    });

    routingRulesContainer.querySelectorAll('.routing-move-down-btn').forEach((button) => {
      button.addEventListener('click', () => onRuleMove(button.dataset.ruleId, 1));
    });

    routingRulesContainer.querySelectorAll('.routing-edit-btn').forEach((button) => {
      button.addEventListener('click', () => onRuleEdit(button.dataset.ruleId));
    });

    routingRulesContainer.querySelectorAll('[data-ruleset-field]').forEach((input) => {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => onRulesetFieldChange(input, event));
    });

    routingRulesContainer.querySelectorAll('.routing-delete-ruleset-btn').forEach((button) => {
      button.addEventListener('click', () => onRulesetDelete(button.dataset.rulesetId));
    });

    routingRulesContainer.querySelectorAll('.routing-ruleset-move-up-btn').forEach((button) => {
      button.addEventListener('click', () => onRulesetMove(button.dataset.rulesetId, -1));
    });

    routingRulesContainer.querySelectorAll('.routing-ruleset-move-down-btn').forEach((button) => {
      button.addEventListener('click', () => onRulesetMove(button.dataset.rulesetId, 1));
    });

    routingRulesContainer.querySelectorAll('.routing-add-ruleset-entry-btn').forEach((button) => {
      button.addEventListener('click', () => onRulesetAddEntry(button.dataset.rulesetId));
    });

    routingRulesContainer.querySelectorAll('[data-ruleset-entry-field]').forEach((input) => {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => onRulesetEntryFieldChange(input, event));
    });

    routingRulesContainer.querySelectorAll('.routing-delete-ruleset-entry-btn').forEach((button) => {
      button.addEventListener('click', () => onRulesetEntryDelete(button.dataset.rulesetId, button.dataset.rulesetEntryId));
    });

    renderRoutingObservability();
  } catch (error) {
    console.error('[RoutingUI] render failed', error);
    onRenderError(error);
  }
};
