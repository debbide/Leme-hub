import { escapeHtml } from './utils.js';

export const renderGroupTabs = ({
  groupTabsEl,
  nodesData,
  groupsData,
  subscriptionsData,
  activeGroupTab,
  setActiveGroupTab,
  setCurrentGroup,
  renderNodesElement,
  showInputModal,
  showConfirmModal,
  requestJson,
  showToast,
  loadNodes,
  getSubscriptionForGroup = () => null,
  isSubscriptionRefreshing = () => false,
}) => {
  if (!groupTabsEl) return;

  const nodeGroups = nodesData.map((node) => node.group).filter(Boolean);
  const allGroups = [...new Set([...groupsData, ...nodeGroups])];
  const subscriptionGroups = new Set((subscriptionsData || []).map((item) => item.groupName).filter(Boolean));
  const hasUngrouped = nodesData.some((node) => !node.group);

  const tabs = [
    { key: null, label: '全部', count: nodesData.length }
  ];
  for (const group of allGroups) {
    const subscription = getSubscriptionForGroup(group);
    const isRefreshing = subscription ? isSubscriptionRefreshing(subscription.id) : false;
    const subscriptionStatus = subscription
      ? isRefreshing
        ? 'syncing'
        : subscription.lastStatus === 'success'
          ? 'success'
          : subscription.lastStatus === 'error'
            ? 'error'
            : 'idle'
      : null;
    const subscriptionLabel = subscription
      ? isRefreshing
        ? '刷新中'
        : subscription.lastStatus === 'error'
          ? '失败'
          : '订阅'
      : '';
    tabs.push({
      key: group,
      label: group,
      count: nodesData.filter((node) => node.group === group).length,
      renameable: true,
      deleteable: !subscriptionGroups.has(group),
      managedBySubscription: subscriptionGroups.has(group),
      subscriptionStatus,
      subscriptionLabel
    });
  }
  if (hasUngrouped) {
    tabs.push({ key: '__ungrouped__', label: '未分组', count: nodesData.filter((node) => !node.group).length });
  }

  const validKeys = new Set(tabs.map((tab) => tab.key));
  let activeKey = activeGroupTab;
  if (!validKeys.has(activeGroupTab)) {
    activeKey = null;
    setActiveGroupTab(null);
    setCurrentGroup(null);
  }

  groupTabsEl.innerHTML = tabs.map((tab) => {
    const isActive = activeKey === tab.key;
    const safeKey = tab.key == null ? '' : escapeHtml(tab.key);
    const safeLabel = escapeHtml(tab.label);
    const safeCount = escapeHtml(String(tab.count));
    const title = tab.managedBySubscription
      ? `订阅分组：${tab.label}，点击查看订阅详情`
      : tab.key === null
        ? '查看全部节点'
        : tab.key === '__ungrouped__'
          ? '查看未分组节点'
          : `查看分组：${tab.label}`;
    const safeTitle = escapeHtml(title);
    const actions = tab.renameable ? `
      <span class="group-tab-actions">
        <button class="group-tab-action-btn group-rename-btn" data-group="${safeKey}" title="重命名" aria-label="重命名分组"><i class="ph ph-pencil-simple"></i></button>
        ${tab.deleteable ? `<button class="group-tab-action-btn group-delete-btn" data-group="${safeKey}" title="删除" aria-label="删除分组"><i class="ph ph-trash"></i></button>` : ''}
      </span>
    ` : '';
    const badge = tab.managedBySubscription ? `<span class="group-tab-badge is-${tab.subscriptionStatus || 'idle'}">${escapeHtml(tab.subscriptionLabel || '订阅')}</span>` : '';
    return `<button type="button" class="group-tab${isActive ? ' active' : ''}${tab.managedBySubscription ? ' is-subscription' : ''}" data-key="${safeKey}" title="${safeTitle}">${safeLabel}${badge}<span class="group-tab-count">${safeCount}</span>${actions}</button>`;
  }).join('');

  groupTabsEl.querySelectorAll('.group-tab').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.target.closest('.group-tab-actions')) return;
      const key = button.dataset.key === '' ? null : button.dataset.key;
      setActiveGroupTab(key);
      setCurrentGroup(key === null || key === '__ungrouped__' ? null : key);
      renderNodesElement();
    });
  });

  groupTabsEl.querySelectorAll('.group-rename-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const oldName = button.dataset.group;
      const newName = await showInputModal(`重命名分组 “${oldName}”`, oldName);
      if (!newName || newName.trim() === oldName) return;
      try {
        await requestJson('/api/groups/rename', { method: 'PUT', body: JSON.stringify({ from: oldName, to: newName.trim() }) });
        if (activeGroupTab === oldName) {
          setActiveGroupTab(newName.trim());
          setCurrentGroup(newName.trim());
        }
        showToast('分组已重命名', 'success');
        loadNodes();
      } catch (error) {
        showToast(`重命名失败: ${error.message}`, 'error');
      }
    });
  });

  groupTabsEl.querySelectorAll('.group-delete-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const name = button.dataset.group;
      if (!await showConfirmModal(`删除分组 “${name}”`, '该分组下的所有节点将移入未分组，确认继续吗？')) return;
      try {
        await requestJson('/api/groups', { method: 'DELETE', body: JSON.stringify({ name }) });
        if (activeGroupTab === name) {
          setActiveGroupTab(null);
          setCurrentGroup(null);
        }
        showToast('分组已删除', 'success');
        loadNodes();
      } catch (error) {
        showToast(`删除失败: ${error.message}`, 'error');
      }
    });
  });
};

export const updateBulkBar = ({
  selectedNodeIds,
  groupsData,
  nodesData,
  requestJson,
  setNodesData,
  setGroupsData,
  clearSelectedNodeIds,
  renderGroupTabs,
  renderNodesElement,
  syncNodeMutationFeedback,
  showToast,
}) => {
  const bar = document.getElementById('bulk-action-bar');
  const label = document.getElementById('bulk-count-label');
  const trigger = document.getElementById('bulk-move-btn');
  if (!bar) return;
  if (selectedNodeIds.size === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  const selectedNodes = nodesData.filter((node) => selectedNodeIds.has(node.id));
  const containsSubscriptionNode = selectedNodes.some((node) => node.source === 'subscription');
  label.textContent = containsSubscriptionNode
    ? `已选 ${selectedNodeIds.size} 个节点（含订阅节点，不能改组）`
    : `已选 ${selectedNodeIds.size} 个节点`;

  if (trigger) {
    trigger.disabled = containsSubscriptionNode;
    trigger.title = containsSubscriptionNode ? '订阅节点固定在专属分组，不能批量改组' : '';
  }

  const menu = document.getElementById('bulk-group-menu');
  if (!menu) return;
  if (containsSubscriptionNode) {
    menu.classList.remove('open');
  }

  const allGroups = [...new Set([...groupsData, ...nodesData.map((node) => node.group).filter(Boolean)])];
  menu.innerHTML = [
    '<div class="group-menu-item" data-group="">未分组</div>',
    ...allGroups.map((group) => {
      const safeGroup = escapeHtml(group);
      return `<div class="group-menu-item" data-group="${safeGroup}">${safeGroup}</div>`;
    })
  ].join('');

  menu.querySelectorAll('.group-menu-item').forEach((item) => {
    item.addEventListener('click', async (event) => {
      event.stopPropagation();
      menu.classList.remove('open');
      const group = item.dataset.group || null;
      try {
        const payload = await requestJson('/api/nodes/group', {
          method: 'PUT',
          body: JSON.stringify({ nodeIds: [...selectedNodeIds], group })
        });
        setNodesData(payload.nodes);
        setGroupsData(payload.groups || groupsData);
        clearSelectedNodeIds();
        renderGroupTabs();
        renderNodesElement();
        syncNodeMutationFeedback(payload, '批量移动分组完成');
      } catch (error) {
        showToast(`移动失败: ${error.message}`, 'error');
      }
    });
  });
};

export const testAllNodes = async ({
  activeGroupTab,
  nodesData,
  nodeSearchQuery,
  testAllBtn,
  requestJson,
  updateCoreStatus,
  applyLatencyResult,
  resetLatencyPlaceholders,
  markLatencyTesting,
  setNodeTestingActionState,
  getLatencyTestingElapsed,
  showToast,
}) => {
  let targetNodes = activeGroupTab === null
    ? nodesData
    : activeGroupTab === '__ungrouped__'
      ? nodesData.filter((node) => !node.group)
      : nodesData.filter((node) => node.group === activeGroupTab);

  if (nodeSearchQuery) {
    const query = nodeSearchQuery.toLowerCase();
    targetNodes = targetNodes.filter((node) =>
      (node.name || '').toLowerCase().includes(query) || (node.server || '').toLowerCase().includes(query)
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
    markLatencyTesting?.(node.id);
    setNodeTestingActionState?.(node.id, true);
  });

  try {
    const payload = await requestJson('/api/nodes/test-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: targetNodes.map((node) => node.id) })
    });

    if (payload.core) updateCoreStatus(payload.core);

    let done = 0;
    payload.results.forEach((result) => {
      applyLatencyResult({
        ...result,
        elapsedMs: getLatencyTestingElapsed?.(result.id)
      });
      done += 1;
      if (testAllBtn) testAllBtn.textContent = `测试 ${done}/${targetNodes.length}...`;
      setNodeTestingActionState?.(result.id, false);
    });

    const successCount = payload.results.filter((result) => result.ok).length;
    const failedCount = payload.results.length - successCount;
    const autoStartText = payload.autoStarted ? '，并已自动启动核心' : '';
    showToast(`批量测试完成：成功 ${successCount}，失败 ${failedCount}${autoStartText}`, failedCount ? 'info' : 'success');
  } catch (error) {
    resetLatencyPlaceholders(targetNodes.map((node) => node.id));
    showToast(`批量测试失败: ${error.message}`, 'error');
  } finally {
    targetNodes.forEach((node) => setNodeTestingActionState?.(node.id, false));
    if (testAllBtn) {
      testAllBtn.disabled = false;
      testAllBtn.textContent = '批量测试';
    }
  }
};
