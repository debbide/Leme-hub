import { bindNodesPanelEvents } from './nodes-bindings.js';
import { renderGroupTabs as renderGroupTabsView, testAllNodes as testAllNodesView, updateBulkBar as updateBulkBarView } from './nodes-controller.js';
import { deleteNodeRecord, deleteSubscriptionRecord, importNodeLink, loadNodesData, refreshSubscriptionNodes, syncSubscriptionNodes, testSingleNode } from './nodes-data.js';
import { applyLatencyResult, copyNodeShareLink, copySelectedNodeShareLinks, getLatencyTestingElapsed, markLatencyTesting, openNodeShareQrModal, renderNodeRow, resetLatencyPlaceholders, setNodeTestingActionState, showInlineMessage } from './nodes-ui.js';

const formatDateTime = (value) => {
  if (!value) {
    return '未同步';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未同步';
  }

  return date.toLocaleString('zh-CN');
};

export const createNodesPanelController = ({
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
  getGroupSortOrder,
  setGroupSortOrder,
  closePanelBtn,
  importForm,
  syncForm,
  importUrlInput,
  syncUrlInput,
  syncNameInput,
  nodeCountLabel,
  groupTabsEl,
  addGroupBtn,
  subscriptionDetailPanel,
  showInputModal,
  showConfirmModal,
  showToast,
  requestJson,
  escapeHtml,
  renderGeoIpStatus,
  updateCoreStatus,
  renderSystemProxyNodeOptions,
  syncNodeMutationFeedback,
  prepareManualNodeDraft,
  openEditModal,
  setGeoIpStatus,
  getCurrentCoreState,
}) => {
  let nodesData = [];
  let groupsData = [];
  let subscriptionsData = [];
  let nodeSearchQuery = '';
  let selectedNodeIds = new Set();
  let currentGroup = null;
  let activeGroupTab = null;
  const refreshingSubscriptionIds = new Set();

  const setNodesData = (value) => {
    nodesData = value || [];
  };

  const setGroupsData = (value) => {
    groupsData = value || [];
  };

  const setSubscriptionsData = (value) => {
    subscriptionsData = value || [];
  };

  const clearSelectedNodeIds = () => {
    selectedNodeIds.clear();
  };

  const refreshNodesView = () => {
    renderGroupTabs();
    renderSubscriptionDetail();
    renderNodesElement();
  };

  const getSubscriptionForGroup = (groupName) => subscriptionsData.find((item) => item.groupName === groupName) || null;

  const closeOpenNodeMenus = () => {
    nodesTbody?.querySelectorAll('.node-row.has-open-menu').forEach((row) => {
      row.classList.remove('has-open-menu');
    });
    nodesTbody?.querySelectorAll('.node-action-menu.open, .group-menu.open').forEach((menu) => {
      menu.classList.remove('open');
      menu.classList.remove('is-floating');
      menu.removeAttribute('style');
    });
  };

  const markOpenMenuRow = (element) => {
    const row = element?.closest?.('.node-row');
    row?.classList.add('has-open-menu');
  };

  const closeOpenGroupMenus = () => {
    nodesTbody?.querySelectorAll('.group-menu.open').forEach((menu) => {
      menu.classList.remove('open');
    });
  };

  const openNodeActionMenu = (menu, anchor) => {
    closeOpenNodeMenus();
    markOpenMenuRow(anchor || menu);
    menu.classList.add('open', 'is-floating');
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const containerRect = nodesList?.getBoundingClientRect?.();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    const margin = 12;
    const menuWidth = menu.offsetWidth || 220;
    const rightEdge = containerRect?.right || viewportWidth - margin;
    const topEdge = containerRect?.top || margin;

    menu.style.left = `${Math.max(margin, rightEdge - menuWidth - margin)}px`;
    menu.style.top = `${Math.max(margin, topEdge + margin)}px`;
    menu.style.visibility = '';
  };

  const syncSelectAllState = () => {
    const selectAll = document.getElementById('select-all-nodes');
    if (!selectAll || !nodesTbody) return;
    const all = [...nodesTbody.querySelectorAll('.node-checkbox')];
    const checked = all.filter((item) => item.checked).length;
    selectAll.checked = all.length > 0 && checked === all.length;
    selectAll.indeterminate = checked > 0 && checked < all.length;
  };

  const moveNodeToGroup = async (nodeId, group) => {
    try {
      const payload = await requestJson('/api/nodes/group', {
        method: 'PUT',
        body: JSON.stringify({ nodeIds: [nodeId], group })
      });
      setNodesData(payload.nodes);
      setGroupsData(payload.groups || groupsData);
      refreshNodesView();
      syncNodeMutationFeedback(payload, '节点已移动到分组');
    } catch (error) {
      showToast(`移动失败: ${error.message}`, 'error');
    }
  };

  const switchActiveNode = async (nodeId) => {
    if (getCurrentCoreState()?.proxy?.activeNodeId === nodeId) return;
    try {
      await requestJson('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify({ activeNodeId: nodeId })
      });
      showToast('主节点已切换，旧连接已断开', 'success');
      loadNodes();
    } catch (error) {
      showToast(`节点切换失败: ${error.message}`, 'error');
    }
  };

  const bindNodesTableEvents = () => {
    if (!nodesTbody || nodesTbody.dataset.delegatedBound === '1') return;
    nodesTbody.dataset.delegatedBound = '1';

    nodesTbody.addEventListener('click', async (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;

      const moveGroupButton = target.closest('.move-group-btn');
      if (moveGroupButton && nodesTbody.contains(moveGroupButton)) {
        event.stopPropagation();
        const wrap = moveGroupButton.closest('.move-group-wrap');
        const menu = wrap?.querySelector('.group-menu');
        if (!menu) return;
        const isOpen = menu.classList.contains('open');
        closeOpenGroupMenus();
        if (!isOpen) {
          markOpenMenuRow(moveGroupButton);
          menu.classList.add('open');
        }
        return;
      }

      const groupItem = target.closest('.move-group-wrap .group-menu-item');
      if (groupItem && nodesTbody.contains(groupItem)) {
        event.stopPropagation();
        closeOpenNodeMenus();
        const wrap = groupItem.closest('.move-group-wrap');
        const nodeId = wrap?.dataset.id;
        if (nodeId) {
          await moveNodeToGroup(nodeId, groupItem.dataset.group || null);
        }
        return;
      }

      const actionButton = target.closest('.test-node-btn, .share-node-btn, .qr-node-btn, .delete-node-btn, .detail-node-btn, .country-node-btn');
      if (actionButton && nodesTbody.contains(actionButton)) {
        event.stopPropagation();
        closeOpenNodeMenus();
        const id = actionButton.dataset.id;
        if (actionButton.classList.contains('test-node-btn')) {
          testNode(id);
        } else if (actionButton.classList.contains('share-node-btn')) {
          copyNodeShareLink({ id, nodesData, showToast });
        } else if (actionButton.classList.contains('qr-node-btn')) {
          openNodeShareQrModal({ id, nodesData, showToast });
        } else if (actionButton.classList.contains('delete-node-btn')) {
          deleteNode(id);
        } else if (actionButton.classList.contains('detail-node-btn')) {
          openEditModal(id);
        } else if (actionButton.classList.contains('country-node-btn')) {
          setNodeCountryOverride(id);
        }
        return;
      }

      const row = target.closest('.node-row');
      if (!row || !nodesTbody.contains(row)) return;
      if (target.closest('.node-check-cell') || target.closest('.node-action-menu')) return;
      await switchActiveNode(row.dataset.id);
    });

    nodesTbody.addEventListener('contextmenu', (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const row = target?.closest?.('.node-row');
      if (!row || !nodesTbody.contains(row)) return;
      if (target.closest('.node-check-cell')) return;

      const menu = row.querySelector('.node-action-menu[data-menu-panel="row"]');
      if (!menu) return;
      event.preventDefault();
      event.stopPropagation();
      openNodeActionMenu(menu, row, event);
    });

    nodesTbody.addEventListener('change', (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      const checkbox = target.closest('.node-checkbox');
      if (!checkbox || !nodesTbody.contains(checkbox)) return;
      event.stopPropagation();
      if (checkbox.checked) selectedNodeIds.add(checkbox.dataset.id);
      else selectedNodeIds.delete(checkbox.dataset.id);
      syncSelectAllState();
      updateBulkBar();
    });
  };

  const renderSubscriptionDetail = () => {
    if (!subscriptionDetailPanel) {
      return;
    }

    const subscription = activeGroupTab && activeGroupTab !== '__ungrouped__'
      ? getSubscriptionForGroup(activeGroupTab)
      : null;

    if (!subscription) {
      subscriptionDetailPanel.classList.add('hidden');
      subscriptionDetailPanel.innerHTML = '';
      return;
    }

    const isRefreshing = refreshingSubscriptionIds.has(subscription.id);
    const statusClass = isRefreshing
      ? 'is-syncing'
      : subscription.lastStatus === 'success'
        ? 'is-success'
        : subscription.lastStatus === 'error'
          ? 'is-error'
          : 'is-idle';
    const statusLabel = isRefreshing
      ? '刷新中'
      : subscription.lastStatus === 'success'
        ? '正常'
        : subscription.lastStatus === 'error'
          ? '失败'
          : '未同步';
    const syncedAt = formatDateTime(subscription.lastSyncedAt);
    const imported = subscription.importedCount ? `上次导入 ${subscription.importedCount}` : '未导入';
    const groupName = subscription.groupName || activeGroupTab || '未分配';
    const detail = isRefreshing
      ? '正在下载订阅并更新节点列表...'
      : subscription.lastError
        ? `最近错误：${escapeHtml(subscription.lastError)}`
        : '';

    subscriptionDetailPanel.classList.remove('hidden');
    subscriptionDetailPanel.innerHTML = `
      <div class="subscription-detail-main">
        <div class="subscription-detail-title-row">
          <span class="subscription-detail-kicker">订阅分组</span>
          <strong class="subscription-detail-title">${escapeHtml(subscription.name || subscription.groupName || subscription.url)}</strong>
          <span class="subscription-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="subscription-detail-meta">
          <span>分组 ${escapeHtml(groupName)}</span>
          <span>${escapeHtml(String(subscription.lastNodeCount || 0))} 节点</span>
          <span>${escapeHtml(imported)}</span>
          <span>${escapeHtml(syncedAt)}</span>
        </div>
        <div class="subscription-detail-url" title="${escapeHtml(subscription.url)}">${escapeHtml(subscription.url)}</div>
        ${detail ? `<div class="subscription-detail-note">${detail}</div>` : ''}
      </div>
      <div class="subscription-detail-actions">
        <button type="button" class="btn-outline subscription-edit-btn" data-id="${escapeHtml(subscription.id)}" ${isRefreshing ? 'disabled' : ''} title="编辑订阅链接"><i class="ph ph-pencil-simple"></i><span>编辑</span></button>
        <button type="button" class="btn-outline subscription-refresh-btn" data-id="${escapeHtml(subscription.id)}" ${isRefreshing ? 'disabled' : ''} title="重新拉取该订阅"><i class="ph ph-arrows-clockwise"></i><span>${isRefreshing ? '刷新中...' : '刷新'}</span></button>
        <button type="button" class="btn-outline subscription-delete-btn is-danger" data-id="${escapeHtml(subscription.id)}" ${isRefreshing ? 'disabled' : ''} title="删除订阅和导入节点"><i class="ph ph-trash"></i><span>删除</span></button>
      </div>
    `;

    subscriptionDetailPanel.querySelector('.subscription-edit-btn')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const id = button.dataset.id;
      const target = subscriptionsData.find((item) => item.id === id);
      if (!target) return;

      const nextUrlInput = await showInputModal('编辑订阅链接', target.url);
      if (nextUrlInput === null) return;
      const nextUrl = nextUrlInput.trim();
      if (!nextUrl) return;

      const nextNameInput = await showInputModal('编辑订阅名称（可选）', target.name || '');
      if (nextNameInput === null) return;
      const nextName = nextNameInput.trim();
      if (nextUrl === target.url && nextName === (target.name || '')) return;

      button.disabled = true;
      const label = button.querySelector('span');
      if (label) {
        label.textContent = '保存中...';
      } else {
        button.textContent = '保存中...';
      }
      try {
        await refreshSubscriptionNodes({
          subscriptionId: id,
          url: nextUrl,
          name: nextName,
          requestJson,
          setNodesData,
          setGroupsData,
          setSubscriptionsData,
          renderSubscriptions: renderSubscriptionDetail,
          renderGroupTabs,
          renderNodesElement,
          syncNodeMutationFeedback,
          showToast,
          successMessage: '订阅已更新'
        });
      } catch (error) {
        showToast(`订阅更新失败: ${error.message}`, 'error');
        await loadNodes();
      } finally {
        button.disabled = false;
        renderGroupTabs();
        renderSubscriptionDetail();
      }
    });

    subscriptionDetailPanel.querySelector('.subscription-refresh-btn')?.addEventListener('click', async (event) => {
      const id = event.currentTarget.dataset.id;
      refreshingSubscriptionIds.add(id);
      renderGroupTabs();
      renderSubscriptionDetail();
      try {
        await refreshSubscriptionNodes({
          subscriptionId: id,
          requestJson,
          setNodesData,
          setGroupsData,
          setSubscriptionsData,
          renderSubscriptions: renderSubscriptionDetail,
          renderGroupTabs,
          renderNodesElement,
          syncNodeMutationFeedback,
          showToast,
          successMessage: '订阅已刷新'
        });
      } catch (error) {
        showToast(`订阅刷新失败: ${error.message}`, 'error');
        await loadNodes();
      } finally {
        refreshingSubscriptionIds.delete(id);
        renderGroupTabs();
        renderSubscriptionDetail();
      }
    });

    subscriptionDetailPanel.querySelector('.subscription-delete-btn')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const id = button.dataset.id;
      const target = subscriptionsData.find((item) => item.id === id);
      if (!target) return;

      const confirmed = await showConfirmModal(
        `删除订阅 “${target.name || target.url}”`,
        '这会删除该订阅导入的节点，并清理对应的专属分组。'
      );
      if (!confirmed) return;

      button.disabled = true;
      const label = button.querySelector('span');
      if (label) {
        label.textContent = '删除中...';
      } else {
        button.textContent = '删除中...';
      }
      try {
        await deleteSubscriptionRecord({
          id,
          requestJson,
          setNodesData,
          setGroupsData,
          setSubscriptionsData,
          renderSubscriptions: renderSubscriptionDetail,
          renderGroupTabs,
          renderNodesElement,
          syncNodeMutationFeedback,
          showToast,
        });
      } catch (error) {
        showToast(`删除订阅失败: ${error.message}`, 'error');
        renderSubscriptionDetail();
      }
    });
  };

  const renderGroupTabs = () => renderGroupTabsView({
    groupTabsEl,
    nodesData,
    groupsData,
    subscriptionsData,
    groupSortOrder: getGroupSortOrder ? getGroupSortOrder() : [],
    setGroupSortOrder,
    activeGroupTab,
    setActiveGroupTab: (value) => { activeGroupTab = value; },
    setCurrentGroup: (value) => { currentGroup = value; },
    renderNodesElement: refreshNodesView,
    showInputModal,
    showConfirmModal,
    requestJson,
    showToast,
    loadNodes,
    getSubscriptionForGroup,
    isSubscriptionRefreshing: (id) => refreshingSubscriptionIds.has(id),
  });

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
      showToast('国家代码格式错误，请输入 2 位字母，例如 JP / US', 'error');
      return;
    }

    try {
      const payload = await requestJson('/api/nodes/country', {
        method: 'PUT',
        body: JSON.stringify({ id, countryCode: normalized || null })
      });
      setNodesData(payload.nodes || nodesData);
      setGroupsData(payload.groups || groupsData);
      refreshNodesView();
      showToast(normalized ? '国家归属已更新' : '手动国家归属已清除', 'success');
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
      nodeCountLabel.textContent = '节点数 0';
      return;
    }

    nodesEmpty.classList.add('hidden');

    const activeNodeId = getCurrentCoreState()?.proxy?.activeNodeId || null;

    let visibleNodes = activeGroupTab === null
      ? nodesData
      : activeGroupTab === '__ungrouped__'
        ? nodesData.filter((node) => !node.group)
        : nodesData.filter((node) => node.group === activeGroupTab);

    const query = nodeSearchQuery.toLowerCase();
    if (query) {
      visibleNodes = visibleNodes.filter((node) =>
        (node.name || '').toLowerCase().includes(query)
        || (node.server || '').toLowerCase().includes(query)
      );
    }

    if (visibleNodes.length === 0) {
      nodesState.classList.remove('hidden');
      nodesList.classList.add('hidden');
      nodeCountLabel.textContent = `节点数 ${nodesData.length}`;
      if (query) {
        nodesSearchEmpty?.classList.remove('hidden');
      } else {
        nodesGroupEmpty?.classList.remove('hidden');
      }
      return;
    }

    nodesState.classList.add('hidden');
    nodesList.classList.remove('hidden');
    nodeCountLabel.textContent = `节点数 ${nodesData.length}（显示 ${visibleNodes.length}）`;

    nodesTbody.innerHTML = visibleNodes.map((node) => renderNodeRow({
      node,
      activeNodeId,
      groupsData,
      nodesData,
      escapeHtml,
    })).join('');
    bindNodesTableEvents();

    const sortTh = document.getElementById('sort-latency-th');
    if (sortTh && !sortTh.dataset.bound) {
      sortTh.dataset.bound = '1';
      sortTh.addEventListener('click', () => {
        const asc = sortTh.dataset.sort !== 'asc';
        sortTh.dataset.sort = asc ? 'asc' : 'desc';
        sortTh.querySelector('.sort-indicator').textContent = asc ? '↑' : '↓';
        const getMs = (id) => {
          const el = document.getElementById(`test-result-${id}`);
          const value = parseInt(el?.textContent, 10);
          return Number.isNaN(value) ? (asc ? Number.POSITIVE_INFINITY : -1) : value;
        };
        setNodesData([...nodesData].sort((a, b) => (asc ? getMs(a.id) - getMs(b.id) : getMs(b.id) - getMs(a.id))));
        renderNodesElement();
      });
    }

    const selectAllCb = document.getElementById('select-all-nodes');
    if (selectAllCb) {
      nodesTbody.querySelectorAll('.node-checkbox').forEach((cb) => {
        cb.checked = selectedNodeIds.has(cb.dataset.id);
      });
      syncSelectAllState();
      if (!selectAllCb.dataset.bound) {
        selectAllCb.dataset.bound = '1';
        selectAllCb.addEventListener('change', () => {
          nodesTbody.querySelectorAll('.node-checkbox').forEach((cb) => {
            cb.checked = selectAllCb.checked;
            if (selectAllCb.checked) selectedNodeIds.add(cb.dataset.id);
            else selectedNodeIds.delete(cb.dataset.id);
          });
          updateBulkBar();
        });
      }
    }
  };

  const loadNodes = () => loadNodesData({
    nodesState,
    nodesLoading,
    nodesEmpty,
    nodesList,
    nodesError,
    requestJson,
    setNodesData,
    setGroupsData,
    setSubscriptionsData,
    setGeoIpStatus: (value) => { setGeoIpStatus(value || null); },
    clearSelectedNodeIds,
    renderSubscriptions: renderSubscriptionDetail,
    renderGroupTabs,
    renderNodesElement,
    renderGeoIpStatus,
    updateCoreStatus,
    renderSystemProxyNodeOptions,
  });

  const importLink = (event) => importNodeLink({
    event,
    importUrlInput,
    importForm,
    currentGroup,
    requestJson,
    setNodesData,
    renderNodesElement,
    syncNodeMutationFeedback,
    showInlineMessage,
    nodesError,
  });

  const syncSub = (event) => syncSubscriptionNodes({
    event,
    syncUrlInput,
    syncNameInput,
    syncForm,
    requestJson,
    setNodesData,
    setGroupsData,
    setSubscriptionsData,
    renderSubscriptions: renderSubscriptionDetail,
    renderGroupTabs,
    renderNodesElement,
    syncNodeMutationFeedback,
    showInlineMessage,
    nodesError,
  });

  const deleteNode = (id) => deleteNodeRecord({
    id,
    nodesData,
    requestJson,
    setNodesData,
    renderNodesElement,
    syncNodeMutationFeedback,
    showInlineMessage,
    nodesError,
    showConfirmModal,
  });

  const testNode = (id) => testSingleNode({
    id,
    requestJson,
    updateCoreStatus,
    showToast,
    applyLatencyResult,
    markLatencyTesting,
    setNodeTestingActionState,
    getLatencyTestingElapsed,
  });

  const updateBulkBar = () => updateBulkBarView({
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
    markLatencyTesting,
    setNodeTestingActionState,
    getLatencyTestingElapsed,
    showToast,
  });

  const copySelectedLinks = () => copySelectedNodeShareLinks({
    selectedNodeIds,
    nodesData,
    showToast,
  });

  const bindEvents = () => {
    addGroupBtn?.addEventListener('click', async () => {
      const name = await showInputModal('新建分组名称');
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      try {
        const payload = await requestJson('/api/groups', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
        setGroupsData(payload.groups || groupsData);
        activeGroupTab = trimmed;
        currentGroup = trimmed;
        renderGroupTabs();
      } catch (error) {
        showToast(`创建分组失败: ${error.message}`, 'error');
      }
    });

    bindNodesPanelEvents({
      showImportBtn,
      importForm,
      syncForm,
      importUrlInput,
      testAllBtn,
      testAllNodes,
      selectedNodeIds,
      copySelectedNodeShareLinks: copySelectedLinks,
      showConfirmModal,
      requestJson,
      loadNodes,
      showToast,
      renderNodesElement,
      updateBulkBar,
      setNodesData,
      syncNodeMutationFeedback,
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
      prepareManualNodeDraft: () => prepareManualNodeDraft(currentGroup),
      closePanelBtn,
      importLink,
      syncSub,
    });
  };

  return {
    bindEvents,
    loadNodes,
    renderNodesElement,
    getNodesData: () => nodesData,
    setNodesData,
  };
};
