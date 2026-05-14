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
        <button type="button" class="btn-outline subscription-refresh-btn" data-id="${escapeHtml(subscription.id)}" ${isRefreshing ? 'disabled' : ''} title="重新拉取该订阅"><i class="ph ph-arrows-clockwise"></i><span>${isRefreshing ? '刷新中...' : '刷新'}</span></button>
        <button type="button" class="btn-outline subscription-delete-btn is-danger" data-id="${escapeHtml(subscription.id)}" ${isRefreshing ? 'disabled' : ''} title="删除订阅和导入节点"><i class="ph ph-trash"></i><span>删除</span></button>
      </div>
    `;

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
      const id = event.currentTarget.dataset.id;
      const target = subscriptionsData.find((item) => item.id === id);
      if (!target) return;

      const confirmed = await showConfirmModal(
        `删除订阅 “${target.name || target.url}”`,
        '这会删除该订阅导入的节点，并清理对应的专属分组。'
      );
      if (!confirmed) return;

      event.currentTarget.disabled = true;
      const label = event.currentTarget.querySelector('span');
      if (label) {
        label.textContent = '删除中...';
      } else {
        event.currentTarget.textContent = '删除中...';
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

    const closeOpenNodeMenus = () => {
      nodesTbody.querySelectorAll('.node-action-menu.open, .group-menu.open').forEach((menu) => {
        menu.classList.remove('open');
      });
    };

    const bindRowAction = (selector, handler) => {
      nodesTbody.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          closeOpenNodeMenus();
          handler(btn);
        });
      });
    };

    nodesTbody.querySelectorAll('.node-action-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const wrap = btn.closest('.node-action-menu-wrap');
        const menu = wrap?.querySelector('.node-action-menu');
        if (!menu) return;
        const isOpen = menu.classList.contains('open');
        closeOpenNodeMenus();
        if (!isOpen) menu.classList.add('open');
      });
    });

    bindRowAction('.test-node-btn', (btn) => {
      testNode(btn.dataset.id);
    });
    bindRowAction('.share-node-btn', (btn) => {
      copyNodeShareLink({ id: btn.dataset.id, nodesData, showToast });
    });
    bindRowAction('.qr-node-btn', (btn) => {
      openNodeShareQrModal({ id: btn.dataset.id, nodesData, showToast });
    });
    bindRowAction('.delete-node-btn', (btn) => {
      deleteNode(btn.dataset.id);
    });
    bindRowAction('.detail-node-btn', (btn) => {
      openEditModal(btn.dataset.id);
    });
    bindRowAction('.country-node-btn', (btn) => {
      setNodeCountryOverride(btn.dataset.id);
    });

    nodesTbody.querySelectorAll('.move-group-wrap').forEach((wrap) => {
      const menuBtn = wrap.querySelector('.move-group-btn');
      const menu = wrap.querySelector('.group-menu');
      menuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = menu.classList.contains('open');
        closeOpenNodeMenus();
        const parentMenu = wrap.closest('.node-action-menu');
        if (parentMenu) parentMenu.classList.add('open');
        if (!isOpen) menu.classList.add('open');
      });
      menu.querySelectorAll('.group-menu-item').forEach((item) => {
        item.addEventListener('click', async (event) => {
          event.stopPropagation();
          closeOpenNodeMenus();
          const nodeId = wrap.dataset.id;
          const group = item.dataset.group || null;
          try {
            const payload = await requestJson('/api/nodes/group', {
              method: 'PUT',
              body: JSON.stringify({ nodeIds: [nodeId], group })
            });
            setNodesData(payload.nodes);
            setGroupsData(payload.groups || groupsData);
            refreshNodesView();
            showToast('节点已移动到分组', 'success');
          } catch (error) {
            showToast(`移动失败: ${error.message}`, 'error');
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
      const all = nodesTbody.querySelectorAll('.node-checkbox');
      const checked = [...all].filter((item) => item.checked).length;
      selectAllCb.checked = all.length > 0 && checked === all.length;
      selectAllCb.indeterminate = checked > 0 && checked < all.length;
      if (!selectAllCb.dataset.bound) {
        selectAllCb.dataset.bound = '1';
        selectAllCb.addEventListener('change', () => {
          document.querySelectorAll('.node-checkbox').forEach((cb) => {
            cb.checked = selectAllCb.checked;
            if (selectAllCb.checked) selectedNodeIds.add(cb.dataset.id);
            else selectedNodeIds.delete(cb.dataset.id);
          });
          updateBulkBar();
        });
      }
    }

    nodesTbody.querySelectorAll('.node-checkbox').forEach((cb) => {
      cb.checked = selectedNodeIds.has(cb.dataset.id);
      cb.addEventListener('change', (event) => {
        event.stopPropagation();
        if (cb.checked) selectedNodeIds.add(cb.dataset.id);
        else selectedNodeIds.delete(cb.dataset.id);
        const all = nodesTbody.querySelectorAll('.node-checkbox');
        const checked = [...all].filter((item) => item.checked).length;
        const selectAll = document.getElementById('select-all-nodes');
        if (selectAll) {
          selectAll.checked = checked === all.length;
          selectAll.indeterminate = checked > 0 && checked < all.length;
        }
        updateBulkBar();
      });
    });

    nodesTbody.querySelectorAll('.node-row').forEach((row) => {
      row.addEventListener('click', async (event) => {
        if (event.target.closest('.node-check-cell') || event.target.closest('.row-actions')) return;
        const nodeId = row.dataset.id;
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
