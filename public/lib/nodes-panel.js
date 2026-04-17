import { bindNodesPanelEvents } from './nodes-bindings.js';
import { renderGroupTabs as renderGroupTabsView, testAllNodes as testAllNodesView, updateBulkBar as updateBulkBarView } from './nodes-controller.js';
import { deleteNodeRecord, deleteSubscriptionRecord, importNodeLink, loadNodesData, refreshSubscriptionNodes, syncSubscriptionNodes, testSingleNode } from './nodes-data.js';
import { applyLatencyResult, copyNodeShareLink, copySelectedNodeShareLinks, renderNodeRow, resetLatencyPlaceholders, showInlineMessage } from './nodes-ui.js';

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
    renderNodesElement();
  };

  const renderSubscriptions = () => {
    if (!subscriptionsPanel || !subscriptionsList || !subscriptionsEmpty) {
      return;
    }

    const items = [...subscriptionsData];
    if (subscriptionsSummary) {
      subscriptionsSummary.textContent = items.length
        ? `共 ${items.length} 个订阅，后续刷新会继续写入各自的专属分组`
        : '还没有添加订阅，首次同步后会自动创建专属分组';
    }

    if (!items.length) {
      subscriptionsPanel.classList.remove('hidden');
      subscriptionsEmpty.classList.remove('hidden');
      subscriptionsList.innerHTML = '';
      return;
    }

    subscriptionsPanel.classList.remove('hidden');
    subscriptionsEmpty.classList.add('hidden');
    subscriptionsList.innerHTML = items.map((subscription) => {
      const statusClass = subscription.lastStatus === 'success'
        ? 'is-success'
        : subscription.lastStatus === 'error'
          ? 'is-error'
          : 'is-idle';
      const statusLabel = subscription.lastStatus === 'success'
        ? '正常'
        : subscription.lastStatus === 'error'
          ? '失败'
          : '未同步';
      const lastDetail = subscription.lastError
        ? `最近错误：${escapeHtml(subscription.lastError)}`
        : `上次同步：${escapeHtml(formatDateTime(subscription.lastSyncedAt))}`;

      return `
        <article class="subscription-item" data-id="${escapeHtml(subscription.id)}">
          <div class="subscription-item-main">
            <div class="subscription-item-title-row">
              <strong class="subscription-item-title">${escapeHtml(subscription.name || subscription.url)}</strong>
              <span class="subscription-status ${statusClass}">${statusLabel}</span>
            </div>
            <div class="subscription-item-meta">
              <span>分组：${escapeHtml(subscription.groupName || '未分配')}</span>
              <span>节点：${escapeHtml(String(subscription.lastNodeCount || 0))}</span>
              <span>导入：${escapeHtml(String(subscription.importedCount || 0))}</span>
            </div>
            <div class="subscription-item-url">${escapeHtml(subscription.url)}</div>
            <div class="subscription-item-note">${lastDetail}</div>
          </div>
          <div class="subscription-item-actions">
            <button type="button" class="btn-outline subscription-refresh-btn" data-id="${escapeHtml(subscription.id)}">刷新</button>
            <button type="button" class="btn-outline subscription-delete-btn" data-id="${escapeHtml(subscription.id)}">删除</button>
          </div>
        </article>
      `;
    }).join('');

    subscriptionsList.querySelectorAll('.subscription-refresh-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        button.disabled = true;
        button.textContent = '刷新中...';
        try {
          await refreshSubscriptionNodes({
            subscriptionId: id,
            requestJson,
            setNodesData,
            setGroupsData,
            setSubscriptionsData,
            renderSubscriptions,
            renderGroupTabs,
            renderNodesElement,
            syncNodeMutationFeedback,
            showToast,
          });
        } catch (error) {
          showToast(`订阅刷新失败: ${error.message}`, 'error');
          await loadNodes();
        } finally {
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = '刷新';
          }
        }
      });
    });

    subscriptionsList.querySelectorAll('.subscription-delete-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        const subscription = subscriptionsData.find((item) => item.id === id);
        if (!subscription) {
          return;
        }

        const confirmed = await showConfirmModal(
          `删除订阅 “${subscription.name || subscription.url}”`,
          '这会删除该订阅导入的节点，并清理对应的专属分组。'
        );
        if (!confirmed) {
          return;
        }

        button.disabled = true;
        button.textContent = '删除中...';
        try {
          await deleteSubscriptionRecord({
            id,
            requestJson,
            setNodesData,
            setGroupsData,
            setSubscriptionsData,
            renderSubscriptions,
            renderGroupTabs,
            renderNodesElement,
            syncNodeMutationFeedback,
            showToast,
          });
        } catch (error) {
          showToast(`删除订阅失败: ${error.message}`, 'error');
          button.disabled = false;
          button.textContent = '删除';
        }
      });
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

    nodesTbody.querySelectorAll('.test-node-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        testNode(btn.dataset.id);
      });
    });
    nodesTbody.querySelectorAll('.share-node-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        copyNodeShareLink({ id: btn.dataset.id, nodesData, showToast });
      });
    });
    nodesTbody.querySelectorAll('.delete-node-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteNode(btn.dataset.id);
      });
    });
    nodesTbody.querySelectorAll('.detail-node-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });
    nodesTbody.querySelectorAll('.country-node-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        setNodeCountryOverride(btn.dataset.id);
      });
    });

    nodesTbody.querySelectorAll('.move-group-wrap').forEach((wrap) => {
      const menuBtn = wrap.querySelector('.move-group-btn');
      const menu = wrap.querySelector('.group-menu');
      menuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = menu.classList.contains('open');
        document.querySelectorAll('.group-menu.open').forEach((item) => item.classList.remove('open'));
        if (!isOpen) menu.classList.add('open');
      });
      menu.querySelectorAll('.group-menu-item').forEach((item) => {
        item.addEventListener('click', async (event) => {
          event.stopPropagation();
          menu.classList.remove('open');
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
          showToast('节点切换已触发，核心正在重载...', 'info');
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
    renderSubscriptions,
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
    renderSubscriptions,
    renderGroupTabs,
    renderNodesElement,
    syncNodeMutationFeedback,
    showInlineMessage,
    nodesError,
  });

  const deleteNode = (id) => deleteNodeRecord({
    id,
    requestJson,
    setNodesData,
    renderNodesElement,
    syncNodeMutationFeedback,
    showInlineMessage,
    nodesError,
  });

  const testNode = (id) => testSingleNode({
    id,
    requestJson,
    updateCoreStatus,
    showToast,
    applyLatencyResult,
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
