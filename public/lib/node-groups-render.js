export const renderNodeGroups = ({
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
  onToggleExpanded,
  onSelectNode,
  onCountryOverride,
  onTestGroup,
  onToggleSort,
  onTestSingleNode,
  onDeleteGroup,
  onEditGroup,
}) => {
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
    if (!query) return true;
    const haystacks = [
      getNodeGroupDisplayName(group),
      group.name,
      group.note,
      group.countryCode,
    ].map((value) => String(value || '').toLowerCase());
    return haystacks.some((value) => value.includes(query));
  });

  if (nodeGroupSearchCount) {
    nodeGroupSearchCount.textContent = query ? `${filteredGroups.length}/${orderedGroups.length}` : `${orderedGroups.length}`;
  }

  if (!filteredGroups.length) {
    nodeGroupsList.innerHTML = '<div class="routing-section-empty">没有匹配的节点组</div>';
    return;
  }

  const renderGroupCard = (group) => {
    const countryMeta = parseCountryMeta(group);
    let groupNodes = group.nodeIds.map((nodeId) => routingNodeOptions.find((item) => item.id === nodeId)).filter(Boolean);
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
          ? `<span class="node-group-country-flag" title="${escapeHtml(countryMeta.code)}"><img class="node-group-country-flag-img" src="https://flagcdn.com/24x18/${countryMeta.code.toLowerCase()}.png" alt="${escapeHtml(countryMeta.code)}" loading="lazy" decoding="async" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';"><span class="node-group-country-flag-fallback">${countryMeta.flag || escapeHtml(countryMeta.code)}</span></span>`
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
          ${groupNodes.slice(0, 10).map((node) => `<span class="node-group-preview-dot${node.id === group.selectedNodeId ? ' is-selected' : ''}" title="${escapeHtml(node.name || node.server || node.id)}"></span>`).join('')}
          ${groupNodes.length > 10 ? `<span class="node-group-preview-more">+${groupNodes.length - 10}</span>` : ''}
        </div>
        <div class="routing-rule-card">
          <div class="routing-section-note">点击节点卡片即可切换当前生效节点</div>
          <div class="routing-ruleset-entries node-group-node-cards">
            ${groupNodes.length ? groupNodes.map((node) => {
              const latencyBadge = formatNodeGroupLatencyBadge(node.id);
              return `<article class="node-group-node-card node-group-node-card-select${node.id === group.selectedNodeId ? ' is-selected' : ''}" data-group-id="${escapeHtml(group.id)}" data-node-id="${escapeHtml(node.id)}" role="button" tabindex="0" title="点击设为当前生效节点"><div class="node-group-node-top"><span class="node-group-node-name">${escapeHtml(node.name || node.server || node.id)}</span><span class="node-group-node-latency ${latencyBadge.cls}" id="group-latency-${escapeHtml(group.id)}-${escapeHtml(node.id)}" title="${escapeHtml(latencyBadge.title)}">${escapeHtml(latencyBadge.text)}</span></div><div class="node-group-node-meta">${escapeHtml(node.server || '')}${node.port ? `:${escapeHtml(String(node.port))}` : ''}</div><div class="node-group-node-meta">${escapeHtml(String((node.type || '').toUpperCase() || 'UNKNOWN'))} · 本地 ${escapeHtml(String(node.localPort || node.local_port || '-'))}${node.id === group.selectedNodeId ? ' · 当前生效' : ''}</div><button type="button" class="node-group-node-test-fab" data-node-id="${escapeHtml(node.id)}" title="测试该节点延迟" aria-label="测试该节点延迟"><i class="ph ph-activity"></i></button><button type="button" class="node-group-country-override-fab" data-node-id="${escapeHtml(node.id)}" title="校准地区" aria-label="校准地区"><i class="ph ph-flag-banner"></i></button></article>`;
            }).join('') : '<div class="routing-section-note">该组暂无节点</div>'}
          </div>
        </div>
      </details>`;
  };

  nodeGroupsList.innerHTML = `<div class="node-group-cards">${filteredGroups.map(renderGroupCard).join('')}</div>`;

  nodeGroupsList.querySelectorAll('.node-group-card').forEach((card) => {
    const groupId = card.dataset.groupId;
    if (!groupId) return;
    card.addEventListener('toggle', () => onToggleExpanded(groupId, card.open));
  });
  nodeGroupsList.querySelectorAll('.node-group-node-card-select').forEach((card) => {
    const handleSelect = async () => {
      const groupId = card.dataset.groupId;
      const selectedNodeId = card.dataset.nodeId;
      if (!groupId || !selectedNodeId) return;
      await onSelectNode(groupId, selectedNodeId);
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
      await onCountryOverride(button.dataset.nodeId);
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-test-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onTestGroup(button.dataset.groupId);
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-sort-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggleSort();
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-node-test-fab').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onTestSingleNode(button.dataset.nodeId);
    });
  });
  nodeGroupsList.querySelectorAll('.node-group-delete-btn').forEach((button) => {
    button.addEventListener('click', async () => onDeleteGroup(button.dataset.groupId));
  });
  nodeGroupsList.querySelectorAll('.node-group-edit-btn').forEach((button) => {
    button.addEventListener('click', async () => onEditGroup(button.dataset.groupId));
  });
};
