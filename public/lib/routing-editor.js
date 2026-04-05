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

export const renderRoutingRulesetsSection = ({
  routingRulesets,
  routingRulesetErrors,
  routingBuiltinRulesets,
  routingNodeOptions,
  nodeGroups,
  getNodeGroupDisplayName,
  renderRulesetRuntimeMeta,
  escapeHtml,
}) => {
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
              <div class="routing-ruleset-runtime-inline">${renderRulesetRuntimeMeta(ruleset)}</div>
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

export const renderRoutingRules = ({
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
