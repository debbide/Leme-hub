import { loadNodeGroupsData, renderNodeGroupTestMeta as renderNodeGroupTestMetaView, persistNodeGroupTestingState as persistNodeGroupTestingStateView, getEffectiveGroupNodeIds as getEffectiveGroupNodeIdsView, formatNodeGroupLatencyBadge as formatNodeGroupLatencyBadgeView, showNodeGroupConfigModal as showNodeGroupConfigModalView } from './node-groups.js';
import { applyLatencyPrioritySwitch as applyLatencyPrioritySwitchView, testNodeGroupNodes as testNodeGroupNodesView, testSingleNodeInGroup as testSingleNodeInGroupView, startNodeGroupAutoTest as startNodeGroupAutoTestView, stopNodeGroupAutoTest as stopNodeGroupAutoTestView, runNodeGroupAutoBackfillIfNeeded as runNodeGroupAutoBackfillIfNeededView } from './node-groups-auto.js';
import { renderNodeGroups as renderNodeGroupsView } from './node-groups-render.js';
import { flagFromCountryCode } from './utils.js';

const NODE_GROUP_SWITCH_DELTA_MS = 120;
const NODE_GROUP_SWITCH_COOLDOWN_MS = 15 * 60 * 1000;
const NODE_GROUP_SWITCH_FAIL_THRESHOLD = 3;

const nodeGroupDisplayNames = (() => {
  try {
    return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'region' });
  } catch {
    return null;
  }
})();

export const createNodeGroupsController = ({
  nodeGroupsList,
  nodeGroupAddBtn,
  nodeGroupModal,
  nodeGroupModalTitle,
  nodeGroupModalName,
  nodeGroupModalType,
  nodeGroupModalCountry,
  nodeGroupModalIconMode,
  nodeGroupModalEmojiWrap,
  nodeGroupModalIconEmoji,
  nodeGroupModalDefaultNode,
  nodeGroupModalNote,
  nodeGroupModalError,
  nodeGroupModalConfirm,
  nodeGroupModalCancel,
  nodeGroupModalClose,
  nodeGroupsLastTestEl,
  nodeGroupsNextTestEl,
  nodeGroupAutoIntervalSelect,
  nodeGroupSearchInput,
  nodeGroupSearchCount,
  requestJson,
  showToast,
  showInputModal,
  updateCoreStatus,
  loadNodes,
  showInlineMessage,
  escapeHtml,
  getRoutingNodeOptions,
  setRoutingNodeOptions,
}) => {
  let nodeGroups = [];
  let nodeGroupExpandedIds = new Set();
  let editingNodeGroupId = null;
  let nodeGroupLatencyMap = new Map();
  let nodeGroupTestingNodeIds = new Set();
  let nodeGroupTestingGroupIds = new Set();
  let nodeGroupAutoTestTimer = null;
  let nodeGroupAutoTestStatusTimer = null;
  let nodeGroupLastTestAt = null;
  let nodeGroupAutoTestIntervalMs = 5 * 60 * 1000;
  let nodeGroupSavingTestingState = false;
  let nodeGroupAutoSwitchState = new Map();
  let nodeGroupSearchQuery = '';
  let nodeGroupSortByLatency = true;

  const getNodeGroupDisplayName = (group) => {
    if (!group || typeof group !== 'object') {
      return '';
    }

    const code = String(group.countryCode || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/u.test(code) && nodeGroupDisplayNames) {
      return nodeGroupDisplayNames.of(code) || code;
    }

    const fromName = String(group.name || '').match(/^国家\/([A-Za-z]{2})$/u)?.[1];
    if (fromName && nodeGroupDisplayNames) {
      const normalized = fromName.toUpperCase();
      return nodeGroupDisplayNames.of(normalized) || normalized;
    }

    return String(group.name || '').trim();
  };

  const renderNodeGroupTestMeta = () => renderNodeGroupTestMetaView({
    nodeGroupsLastTestEl,
    nodeGroupsNextTestEl,
    nodeGroupLastTestAt,
    nodeGroupAutoTestIntervalMs,
  });

  const persistNodeGroupTestingState = () => persistNodeGroupTestingStateView({
    nodeGroupSavingTestingState,
    setNodeGroupSavingTestingState: (value) => { nodeGroupSavingTestingState = value; },
    requestJson,
    nodeGroupAutoTestIntervalMs,
    nodeGroupLatencyMap,
    nodeGroupLastTestAt,
  });

  const getEffectiveGroupNodeIds = (group) => getEffectiveGroupNodeIdsView({
    group,
    routingNodeOptions: getRoutingNodeOptions(),
  });

  const applyLatencyPrioritySwitch = (group, testResults = [], options = {}) => applyLatencyPrioritySwitchView({
    group,
    testResults,
    options,
    requestJson,
    nodeGroups,
    setNodeGroups: (value) => { nodeGroups = value || []; },
    nodeGroupAutoSwitchState,
    routingNodeOptions: getRoutingNodeOptions(),
    NODE_GROUP_SWITCH_FAIL_THRESHOLD,
    NODE_GROUP_SWITCH_COOLDOWN_MS,
    NODE_GROUP_SWITCH_DELTA_MS,
    showToast,
  });

  const formatNodeGroupLatencyBadge = (nodeId) => formatNodeGroupLatencyBadgeView({
    nodeId,
    nodeGroupTestingNodeIds,
    nodeGroupLatencyMap,
  });

  const renderNodeGroups = () => renderNodeGroupsView({
    nodeGroupsList,
    nodeGroups,
    routingNodeOptions: getRoutingNodeOptions(),
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
    onToggleExpanded: (groupId, isOpen) => {
      if (isOpen) {
        nodeGroupExpandedIds.add(groupId);
      } else {
        nodeGroupExpandedIds.delete(groupId);
      }
    },
    onSelectNode: async (groupId, selectedNodeId) => {
      await requestJson('/api/node-groups/selection', { method: 'PUT', body: JSON.stringify({ id: groupId, selectedNodeId }) });
      await loadNodeGroups();
    },
    onCountryOverride: async (nodeId) => {
      const node = getRoutingNodeOptions().find((item) => item.id === nodeId);
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
          body: JSON.stringify({ id: nodeId, countryCode: normalized || null })
        });
        if (payload.core) {
          updateCoreStatus(payload.core);
        }
        await Promise.all([loadNodes(), loadNodeGroups()]);
        showToast(normalized ? '国家归属已更新' : '手动国家归属已清除', 'success');
      } catch (error) {
        showToast(`国家归属更新失败: ${error.message}`, 'error');
      }
    },
    onTestGroup: async (groupId) => {
      await testNodeGroupNodes(groupId);
    },
    onToggleSort: () => {
      nodeGroupSortByLatency = !nodeGroupSortByLatency;
      renderNodeGroups();
      showToast(nodeGroupSortByLatency ? '已启用按延迟排序' : '已关闭按延迟排序', 'info');
    },
    onTestSingleNode: async (nodeId) => {
      await testSingleNodeInGroup(nodeId);
    },
    onDeleteGroup: async (groupId) => {
      await requestJson('/api/node-groups', { method: 'DELETE', body: JSON.stringify({ id: groupId }) });
      await loadNodeGroups();
    },
    onEditGroup: async (groupId) => {
      const group = nodeGroups.find((item) => item.id === groupId);
      if (!group) return;
      const payload = await showNodeGroupConfigModal('edit', group);
      if (!payload) return;
      await requestJson('/api/node-groups', { method: 'PUT', body: JSON.stringify({ id: group.id, ...payload }) });
      await loadNodeGroups();
    },
  });

  const loadNodeGroups = () => loadNodeGroupsData({
    nodeGroupsList,
    requestJson,
    nodeGroupExpandedIds,
    setNodeGroups: (value) => { nodeGroups = value || []; },
    setNodeGroupExpandedIds: (value) => { nodeGroupExpandedIds = value; },
    nodeGroupAutoSwitchState,
    setNodeGroupAutoSwitchState: (value) => { nodeGroupAutoSwitchState = value; },
    routingNodeOptions: getRoutingNodeOptions(),
    setRoutingNodeOptions,
    nodeGroupAutoIntervalSelect,
    setNodeGroupAutoTestIntervalMs: (value) => { nodeGroupAutoTestIntervalMs = value; },
    setNodeGroupLatencyMap: (value) => { nodeGroupLatencyMap = value; },
    setNodeGroupLastTestAt: (value) => { nodeGroupLastTestAt = value; },
    renderNodeGroupTestMeta,
    renderNodeGroups,
  });

  const testNodeGroupNodes = (groupId, options = {}) => testNodeGroupNodesView({
    groupId,
    options,
    nodeGroups,
    getEffectiveGroupNodeIds,
    nodeGroupTestingGroupIds,
    nodeGroupTestingNodeIds,
    renderNodeGroups,
    requestJson,
    nodeGroupLatencyMap,
    nodeGroupLastTestAt,
    setNodeGroupLastTestAt: (value) => { nodeGroupLastTestAt = value; },
    renderNodeGroupTestMeta,
    persistNodeGroupTestingState,
    applyLatencyPrioritySwitch,
    updateCoreStatus,
    showToast,
  });

  const testSingleNodeInGroup = (nodeId, options = {}) => testSingleNodeInGroupView({
    nodeId,
    options,
    nodeGroupTestingNodeIds,
    renderNodeGroups,
    requestJson,
    nodeGroupLatencyMap,
    setNodeGroupLastTestAt: (value) => { nodeGroupLastTestAt = value; },
    renderNodeGroupTestMeta,
    persistNodeGroupTestingState,
    updateCoreStatus,
    showToast,
  });

  const stopNodeGroupAutoTest = () => stopNodeGroupAutoTestView({
    nodeGroupAutoTestTimer,
    setNodeGroupAutoTestTimer: (value) => { nodeGroupAutoTestTimer = value; },
    nodeGroupAutoTestStatusTimer,
    setNodeGroupAutoTestStatusTimer: (value) => { nodeGroupAutoTestStatusTimer = value; },
  });

  const startNodeGroupAutoTest = () => startNodeGroupAutoTestView({
    nodeGroupAutoTestTimer,
    setNodeGroupAutoTestTimer: (value) => { nodeGroupAutoTestTimer = value; },
    setNodeGroupAutoTestStatusTimer: (value) => { nodeGroupAutoTestStatusTimer = value; },
    nodeGroups,
    getEffectiveGroupNodeIds,
    testNodeGroupNodes,
    nodeGroupAutoTestIntervalMs,
    renderNodeGroupTestMeta,
  });

  const runNodeGroupAutoBackfillIfNeeded = () => runNodeGroupAutoBackfillIfNeededView({
    nodeGroups,
    getEffectiveGroupNodeIds,
    nodeGroupLatencyMap,
    testNodeGroupNodes,
  });

  const showNodeGroupConfigModal = (mode = 'create', group = null) => showNodeGroupConfigModalView({
    mode,
    group,
    nodeGroupModal,
    nodeGroupModalTitle,
    nodeGroupModalConfirm,
    nodeGroupModalName,
    nodeGroupModalType,
    nodeGroupModalCountry,
    nodeGroupModalIconMode,
    nodeGroupModalIconEmoji,
    nodeGroupModalNote,
    nodeGroupModalDefaultNode,
    nodeGroupModalEmojiWrap,
    nodeGroupModalError,
    nodeGroupModalCancel,
    nodeGroupModalClose,
    routingNodeOptions: getRoutingNodeOptions(),
    escapeHtml,
    showInlineMessage,
    setEditingNodeGroupId: (value) => { editingNodeGroupId = value; },
  });

  const bindEvents = () => {
    nodeGroupAddBtn?.addEventListener('click', async () => {
      const payload = await showNodeGroupConfigModal('create');
      if (!payload) return;
      await requestJson('/api/node-groups', { method: 'POST', body: JSON.stringify(payload) });
      await loadNodeGroups();
    });
  };

  return {
    bindEvents,
    loadNodeGroups,
    renderNodeGroups,
    renderNodeGroupTestMeta,
    persistNodeGroupTestingState,
    startNodeGroupAutoTest,
    stopNodeGroupAutoTest,
    runNodeGroupAutoBackfillIfNeeded,
    setNodeGroupSearchQuery: (value) => { nodeGroupSearchQuery = value; },
    setNodeGroupAutoTestIntervalMs: (value) => { nodeGroupAutoTestIntervalMs = value; },
    showNodeGroupConfigModal,
    getNodeGroups: () => nodeGroups,
    setNodeGroups: (value) => { nodeGroups = value || []; },
    getNodeGroupDisplayName,
  };
};
