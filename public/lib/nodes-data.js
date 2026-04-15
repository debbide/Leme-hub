export const loadNodesData = async ({
  nodesState,
  nodesLoading,
  nodesEmpty,
  nodesList,
  nodesError,
  requestJson,
  setNodesData,
  setGroupsData,
  setSubscriptionsData,
  setGeoIpStatus,
  clearSelectedNodeIds,
  renderSubscriptions,
  renderGroupTabs,
  renderNodesElement,
  renderGeoIpStatus,
  updateCoreStatus,
  renderSystemProxyNodeOptions,
}) => {
  nodesState.classList.remove('hidden');
  nodesLoading.classList.remove('hidden');
  nodesEmpty.classList.add('hidden');
  nodesList.classList.add('hidden');
  nodesError.classList.add('hidden');

  try {
    const payload = await requestJson('/api/nodes');
    setNodesData(payload.nodes || []);
    setGroupsData(payload.groups || []);
    setSubscriptionsData(payload.subscriptions || []);
    setGeoIpStatus(payload.geoIp || null);
    clearSelectedNodeIds();
    renderSubscriptions();
    renderGroupTabs();
    renderNodesElement();
    renderGeoIpStatus(payload.geoIp || null);
    updateCoreStatus(payload.core);
    renderSystemProxyNodeOptions(payload.nodes || [], payload.core?.proxy?.activeNodeId);
  } catch (error) {
    nodesState.classList.remove('hidden');
    nodesLoading.classList.add('hidden');
    nodesError.classList.remove('hidden');
    nodesError.textContent = `加载节点失败: ${error.message}`;
  }
};

export const importNodeLink = async ({
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
}) => {
  event.preventDefault();
  const link = importUrlInput.value.trim();
  if (!link) return;

  const btn = importForm.querySelector('button[type="submit"]');
  btn.textContent = '导入中...';
  btn.disabled = true;

  try {
    const payload = await requestJson('/api/nodes/import-link', {
      method: 'POST',
      body: JSON.stringify({ link, group: currentGroup || undefined })
    });
    setNodesData(payload.nodes || []);
    renderNodesElement();
    const duplicateNote = payload.duplicateCount > 0 ? `，其中 ${payload.duplicateCount} 个与现有节点相似` : '';
    syncNodeMutationFeedback(payload, `已导入 ${payload.importedCount || 1} 个节点${duplicateNote}`);
    importUrlInput.value = '';
    importForm.classList.add('hidden');
  } catch (error) {
    showInlineMessage(nodesError, `导入失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = '确认导入';
    btn.disabled = false;
  }
};

export const syncSubscriptionNodes = async ({
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
}) => {
  event.preventDefault();
  const url = syncUrlInput.value.trim();
  const name = syncNameInput?.value.trim() || '';
  if (!url) return;

  const btn = syncForm.querySelector('button[type="submit"]');
  btn.textContent = '同步中...';
  btn.disabled = true;

  try {
    const payload = await requestJson('/api/subscriptions/sync', {
      method: 'POST',
      body: JSON.stringify({ url, name })
    });
    setNodesData(payload.nodes || []);
    setGroupsData(payload.groups || []);
    setSubscriptionsData(payload.subscriptions || []);
    renderSubscriptions();
    renderGroupTabs();
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    syncUrlInput.value = '';
    if (syncNameInput) syncNameInput.value = '';
    syncForm.classList.add('hidden');
    showInlineMessage(nodesError, `订阅同步完成，已导入 ${payload.importedCount} 个节点`, 'success');
  } catch (error) {
    showInlineMessage(nodesError, `订阅同步失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = '开始同步';
    btn.disabled = false;
  }
};

export const refreshSubscriptionNodes = async ({
  subscriptionId,
  requestJson,
  setNodesData,
  setGroupsData,
  setSubscriptionsData,
  renderSubscriptions,
  renderGroupTabs,
  renderNodesElement,
  syncNodeMutationFeedback,
  showToast,
}) => {
  const payload = await requestJson('/api/subscriptions/sync', {
    method: 'POST',
    body: JSON.stringify({ id: subscriptionId })
  });
  setNodesData(payload.nodes || []);
  setGroupsData(payload.groups || []);
  setSubscriptionsData(payload.subscriptions || []);
  renderSubscriptions();
  renderGroupTabs();
  renderNodesElement();
  syncNodeMutationFeedback(payload);
  showToast(`订阅已刷新，导入 ${payload.importedCount} 个节点`, 'success');
};

export const deleteSubscriptionRecord = async ({
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
}) => {
  const payload = await requestJson('/api/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ id })
  });
  setNodesData(payload.nodes || []);
  setGroupsData(payload.groups || []);
  setSubscriptionsData(payload.subscriptions || []);
  renderSubscriptions();
  renderGroupTabs();
  renderNodesElement();
  syncNodeMutationFeedback(payload, '订阅已删除');
  showToast('订阅及对应节点已删除', 'success');
};

export const deleteNodeRecord = async ({
  id,
  requestJson,
  setNodesData,
  renderNodesElement,
  syncNodeMutationFeedback,
  showInlineMessage,
  nodesError,
}) => {
  if (!confirm('确定要删除这个节点吗？')) return;
  try {
    const payload = await requestJson('/api/nodes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    });
    setNodesData(payload.nodes || []);
    renderNodesElement();
    syncNodeMutationFeedback(payload, '节点已删除');
  } catch (error) {
    showInlineMessage(nodesError, `删除失败: ${error.message}`, 'error');
  }
};

export const testSingleNode = async ({
  id,
  requestJson,
  updateCoreStatus,
  showToast,
  applyLatencyResult,
}) => {
  const resultEl = document.querySelector(`#test-result-${id}`);
  if (!resultEl) return;
  resultEl.textContent = '测试中...';
  resultEl.className = 'latency';

  try {
    const payload = await requestJson('/api/nodes/test', {
      method: 'POST',
      body: JSON.stringify({ id })
    });

    if (payload.core) {
      updateCoreStatus(payload.core);
    }
    if (payload.autoStarted) {
      showToast('已自动启动核心并完成延迟测试', 'success');
    }

    applyLatencyResult({ id, ok: true, latencyMs: payload.latencyMs });
  } catch (error) {
    applyLatencyResult({ id, ok: false, error: error.message || '未知错误' });
    showToast(`延迟测试失败: ${error.message || '未知错误'}`, 'error');
  }
};
