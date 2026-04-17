export const formatClockTime = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '--';
  return value.toLocaleTimeString('zh-CN', { hour12: false });
};

export const formatDistance = (targetDate) => {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return '--';
  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) return '即将';
  const totalSec = Math.ceil(diffMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) return `${sec} 秒`;
  return `${min} 分 ${sec} 秒`;
};

export const renderNodeGroupTestMeta = ({ nodeGroupsLastTestEl, nodeGroupsNextTestEl, nodeGroupLastTestAt, nodeGroupAutoTestIntervalMs }) => {
  if (nodeGroupsLastTestEl) {
    nodeGroupsLastTestEl.textContent = `上次测速: ${formatClockTime(nodeGroupLastTestAt)}`;
  }
  if (nodeGroupsNextTestEl) {
    if (!nodeGroupLastTestAt) {
      nodeGroupsNextTestEl.textContent = '下次测速: 待触发';
      return;
    }
    const nextAt = new Date(nodeGroupLastTestAt.getTime() + nodeGroupAutoTestIntervalMs);
    nodeGroupsNextTestEl.textContent = `下次测速: ${formatClockTime(nextAt)}（${formatDistance(nextAt)}）`;
  }
};

export const serializeNodeGroupLatencyCache = ({ nodeGroupLatencyMap, nodeGroupLastTestAt }) => {
  const results = {};
  nodeGroupLatencyMap.forEach((value, key) => {
    if (!key || !value || typeof value !== 'object') return;
    results[key] = {
      ok: Boolean(value.ok),
      latencyMs: value.latencyMs == null ? null : Number.parseInt(value.latencyMs, 10),
      error: value.error || null,
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  });
  return {
    updatedAt: nodeGroupLastTestAt ? nodeGroupLastTestAt.toISOString() : null,
    results
  };
};

export const persistNodeGroupTestingState = async ({ nodeGroupSavingTestingState, setNodeGroupSavingTestingState, requestJson, nodeGroupAutoTestIntervalMs, nodeGroupLatencyMap, nodeGroupLastTestAt }) => {
  if (nodeGroupSavingTestingState) return;
  setNodeGroupSavingTestingState(true);
  try {
    await requestJson('/api/system/settings', {
      method: 'PUT',
      body: JSON.stringify({
        nodeGroupAutoTestIntervalSec: Math.max(60, Math.round(nodeGroupAutoTestIntervalMs / 1000)),
        nodeGroupLatencyCache: serializeNodeGroupLatencyCache({ nodeGroupLatencyMap, nodeGroupLastTestAt })
      })
    });
  } catch {
    // keep UI responsive even when persistence is unavailable
  } finally {
    setNodeGroupSavingTestingState(false);
  }
};

export const getEffectiveGroupNodeIds = ({ group, routingNodeOptions }) => {
  const existing = new Set((routingNodeOptions || []).map((node) => node.id));
  return (group?.nodeIds || []).filter((id) => id && existing.has(id));
};

export const formatNodeGroupLatencyBadge = ({ nodeId, nodeGroupTestingNodeIds, nodeGroupLatencyMap }) => {
  if (nodeGroupTestingNodeIds.has(nodeId)) {
    return { text: '测试中...', cls: 'is-testing', title: '' };
  }
  const result = nodeGroupLatencyMap.get(nodeId);
  if (!result) {
    return { text: '-- ms', cls: '', title: '' };
  }
  if (!result.ok) {
    return { text: '失败', cls: 'is-error', title: result.error || '测速失败' };
  }
  const latency = Number(result.latencyMs);
  const cls = latency > 0 && latency <= 500 ? 'is-good' : 'is-bad';
  return { text: `${latency} ms`, cls, title: '' };
};

export const loadNodeGroupsData = async ({ nodeGroupsList, requestJson, nodeGroupExpandedIds, setNodeGroups, setNodeGroupExpandedIds, nodeGroupAutoSwitchState, setNodeGroupAutoSwitchState, routingNodeOptions, setRoutingNodeOptions, nodeGroupAutoIntervalSelect, setNodeGroupAutoTestIntervalMs, setNodeGroupLatencyMap, setNodeGroupLastTestAt, renderNodeGroupTestMeta, renderNodeGroups }) => {
  if (!nodeGroupsList) return;
  const payload = await requestJson('/api/node-groups');
  const nextNodeGroups = payload.nodeGroups || [];
  setNodeGroups(nextNodeGroups);
  setNodeGroupExpandedIds(new Set(Array.from(nodeGroupExpandedIds).filter((id) => nextNodeGroups.some((group) => group.id === id))));
  setNodeGroupAutoSwitchState(new Map(Array.from(nodeGroupAutoSwitchState.entries()).filter(([id]) => nextNodeGroups.some((group) => group.id === id))));
  setRoutingNodeOptions(payload.nodes || routingNodeOptions);
  const testing = payload.nodeGroupTesting || {};
  const intervalSec = Number.parseInt(testing.intervalSec, 10);
  if (Number.isInteger(intervalSec) && intervalSec > 0) {
    setNodeGroupAutoTestIntervalMs(intervalSec * 1000);
    if (nodeGroupAutoIntervalSelect) nodeGroupAutoIntervalSelect.value = String(intervalSec);
  }
  const latencyCache = testing.latencyCache || {};
  const cacheResults = latencyCache.results && typeof latencyCache.results === 'object' ? latencyCache.results : {};
  setNodeGroupLatencyMap(new Map(Object.entries(cacheResults)));
  setNodeGroupLastTestAt(latencyCache.updatedAt ? new Date(latencyCache.updatedAt) : null);
  renderNodeGroupTestMeta();
  renderNodeGroups();
};

export const showNodeGroupConfigModal = ({ mode = 'create', group = null, nodeGroupModal, nodeGroupModalTitle, nodeGroupModalConfirm, nodeGroupModalName, nodeGroupModalType, nodeGroupModalCountry, nodeGroupModalIconMode, nodeGroupModalIconEmoji, nodeGroupModalNote, nodeGroupModalDefaultNode, nodeGroupModalEmojiWrap, nodeGroupModalError, nodeGroupModalCancel, nodeGroupModalClose, routingNodeOptions, escapeHtml, showInlineMessage, setEditingNodeGroupId }) => new Promise((resolve) => {
  if (!nodeGroupModal) {
    resolve(null);
    return;
  }
  setEditingNodeGroupId(group?.id || null);
  nodeGroupModalTitle.textContent = mode === 'edit' ? '编辑节点组' : '新增节点组';
  nodeGroupModalConfirm.textContent = mode === 'edit' ? '保存配置' : '创建节点组';

  const currentType = String(group?.type || 'custom');
  nodeGroupModalName.value = String(group?.name || '');
  nodeGroupModalType.value = currentType === 'country' ? 'country' : 'custom';
  nodeGroupModalCountry.value = String(group?.countryCode || '').toUpperCase();
  nodeGroupModalIconMode.value = String(group?.iconMode || 'auto');
  nodeGroupModalIconEmoji.value = String(group?.iconEmoji || '');
  nodeGroupModalNote.value = String(group?.note || '');

  const selectedNodeId = String(group?.selectedNodeId || '');
  nodeGroupModalDefaultNode.innerHTML = [
    '<option value="">创建后再选择</option>',
    ...routingNodeOptions.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === selectedNodeId ? 'selected' : ''}>${escapeHtml(node.name || node.server || node.id)}</option>`)
  ].join('');

  const updateNodeGroupModalFields = () => {
    const isCountry = nodeGroupModalType.value === 'country';
    nodeGroupModalCountry.disabled = !isCountry;
    if (!isCountry) nodeGroupModalCountry.value = '';
    nodeGroupModalEmojiWrap.classList.toggle('hidden', nodeGroupModalIconMode.value !== 'emoji');
  };

  updateNodeGroupModalFields();
  nodeGroupModalError.classList.add('hidden');
  nodeGroupModal.classList.add('active');
  setTimeout(() => nodeGroupModalName.focus(), 50);

  const finish = (value) => {
    nodeGroupModal.classList.remove('active');
    nodeGroupModalConfirm.onclick = null;
    nodeGroupModalCancel.onclick = null;
    nodeGroupModalClose.onclick = null;
    nodeGroupModalType.onchange = null;
    nodeGroupModalIconMode.onchange = null;
    setEditingNodeGroupId(null);
    resolve(value);
  };

  const submit = () => {
    const name = String(nodeGroupModalName.value || '').trim();
    const type = nodeGroupModalType.value === 'country' ? 'country' : 'custom';
    const countryCode = String(nodeGroupModalCountry.value || '').trim().toUpperCase();
    const iconMode = ['auto', 'emoji', 'none'].includes(nodeGroupModalIconMode.value) ? nodeGroupModalIconMode.value : 'auto';
    const iconEmoji = String(nodeGroupModalIconEmoji.value || '').trim();
    const note = String(nodeGroupModalNote.value || '').trim();
    const selectedNodeId = String(nodeGroupModalDefaultNode.value || '').trim();

    if (!name && !(type === 'country' && countryCode)) {
      showInlineMessage(nodeGroupModalError, '请填写节点组名称', 'error');
      return;
    }
    if (type === 'country' && countryCode && !/^[A-Z]{2}$/u.test(countryCode)) {
      showInlineMessage(nodeGroupModalError, '国家代码必须是 2 位字母（如 JP / US）', 'error');
      return;
    }
    if (iconMode === 'emoji' && !iconEmoji) {
      showInlineMessage(nodeGroupModalError, '图标样式为 Emoji 时请填写图标', 'error');
      return;
    }

    finish({
      name,
      type,
      countryCode: type === 'country' ? (countryCode || null) : null,
      iconMode,
      iconEmoji: iconMode === 'emoji' ? iconEmoji : '',
      note,
      selectedNodeId: selectedNodeId || null
    });
  };

  nodeGroupModalConfirm.onclick = submit;
  nodeGroupModalCancel.onclick = () => finish(null);
  nodeGroupModalClose.onclick = () => finish(null);
  nodeGroupModalType.onchange = updateNodeGroupModalFields;
  nodeGroupModalIconMode.onchange = updateNodeGroupModalFields;
});
