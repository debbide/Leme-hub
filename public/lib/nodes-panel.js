import { bindNodesPanelEvents } from './nodes-bindings.js';
import { renderGroupTabs as renderGroupTabsView, testAllNodes as testAllNodesView, updateBulkBar as updateBulkBarView } from './nodes-controller.js';
import { deleteNodeRecord, importNodeLink, loadNodesData, syncSubscriptionNodes, testSingleNode } from './nodes-data.js';
import { applyLatencyResult, copyNodeShareLink, renderNodeRow, resetLatencyPlaceholders, showInlineMessage } from './nodes-ui.js';

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
  nodeCountLabel,
  groupTabsEl,
  addGroupBtn,
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

  const clearSelectedNodeIds = () => {
    selectedNodeIds.clear();
  };

  const refreshNodesView = () => {
    renderGroupTabs();
    renderNodesElement();
  };

  const renderGroupTabs = () => renderGroupTabsView({
    groupTabsEl,
    nodesData,
    groupsData,
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
      showToast('国家代码格式错误，请输入 2 位字母（如 JP / US）', 'error');
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
      showToast(normalized ? '国家归属已修正' : '已清除手动国家覆盖', 'success');
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
      nodeCountLabel.textContent = '节点数: 0';
      return;
    }

    nodesEmpty.classList.add('hidden');

    const activeNodeId = getCurrentCoreState()?.proxy?.activeNodeId || null;

    let visibleNodes = activeGroupTab === null
      ? nodesData
      : activeGroupTab === '__ungrouped__'
        ? nodesData.filter((node) => !node.group)
        : nodesData.filter((node) => node.group === activeGroupTab);

    const q = nodeSearchQuery.toLowerCase();
    if (q) {
      visibleNodes = visibleNodes.filter((node) =>
        (node.name || '').toLowerCase().includes(q)
        || (node.server || '').toLowerCase().includes(q)
      );
    }

    if (visibleNodes.length === 0) {
      nodesState.classList.remove('hidden');
      nodesList.classList.add('hidden');
      nodeCountLabel.textContent = `节点数: ${nodesData.length}`;
      if (q) {
        nodesSearchEmpty?.classList.remove('hidden');
      } else {
        nodesGroupEmpty?.classList.remove('hidden');
      }
      return;
    }

    nodesState.classList.add('hidden');
    nodesList.classList.remove('hidden');
    nodeCountLabel.textContent = `节点数: ${nodesData.length}（显示 ${visibleNodes.length}）`;

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
            showToast('节点已移至分组', 'success');
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
          const value = parseInt(el?.textContent);
          return Number.isNaN(value) ? (asc ? Infinity : -1) : value;
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
        if (selectAllCb) {
          selectAllCb.checked = checked === all.length;
          selectAllCb.indeterminate = checked > 0 && checked < all.length;
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
          showToast('节点切换触发，引擎重载中...', 'info');
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
    setGeoIpStatus: (value) => { setGeoIpStatus(value || null); },
    clearSelectedNodeIds,
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
    syncForm,
    requestJson,
    setNodesData,
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

