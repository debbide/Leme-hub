export const bindAppMiscEvents = ({
  geoIpRefreshBtn,
  refreshGeoIp,
  rulesetDbRefreshBtn,
  refreshRulesetDatabase,
  nodeGroupAutoIntervalSelect,
  setNodeGroupAutoTestIntervalMs,
  renderNodeGroupTestMeta,
  persistNodeGroupTestingState,
  showToast,
  stopNodeGroupAutoTest,
  startNodeGroupAutoTest,
  nodeGroupSearchInput,
  setNodeGroupSearchQuery,
  renderNodeGroups,
  nodeGroupAddBtn,
  showNodeGroupConfigModal,
  requestJson,
  loadNodeGroups,
}) => {
  geoIpRefreshBtn?.addEventListener('click', refreshGeoIp);
  rulesetDbRefreshBtn?.addEventListener('click', refreshRulesetDatabase);

  nodeGroupAutoIntervalSelect?.addEventListener('change', async () => {
    const nextIntervalSec = Number.parseInt(nodeGroupAutoIntervalSelect.value, 10);
    if (!Number.isInteger(nextIntervalSec) || nextIntervalSec < 60) {
      showToast('自动测速周期无效', 'error');
      return;
    }

    setNodeGroupAutoTestIntervalMs(nextIntervalSec * 1000);
    renderNodeGroupTestMeta();
    await persistNodeGroupTestingState();

    if (document.getElementById('node-groups-view')?.classList.contains('active')) {
      stopNodeGroupAutoTest();
      startNodeGroupAutoTest();
    }

    showToast(`自动测速周期已更新为 ${Math.round(nextIntervalSec / 60)} 分钟`, 'success');
  });

  nodeGroupSearchInput?.addEventListener('input', (event) => {
    setNodeGroupSearchQuery(String(event.target?.value || '').trim());
    renderNodeGroups();
  });

  nodeGroupAddBtn?.addEventListener('click', async () => {
    const payload = await showNodeGroupConfigModal('create');
    if (!payload) return;
    await requestJson('/api/node-groups', { method: 'POST', body: JSON.stringify(payload) });
    await loadNodeGroups();
  });
};

export const bindWindowChromeFallbacks = ({ showToast }) => {
  document.getElementById('titlebar-close')?.addEventListener('click', () => {
    showToast('Tauri 退出指令正在开发中...', 'info');
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.group-menu.open').forEach((menu) => menu.classList.remove('open'));
  });
};

export const runInitialAppBootstrap = ({
  updateRoutingLogViewModeButtons,
  loadNodes,
  loadSystemStatus,
  startTrafficPolling,
}) => {
  updateRoutingLogViewModeButtons();
  loadNodes();
  loadSystemStatus();
  startTrafficPolling();
};
