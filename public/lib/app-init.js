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

const getDesktopWindowBridge = () => {
  const bridge = globalThis.window?.lemeDesktopWindow;
  return bridge?.isAvailable ? bridge : null;
};

const setWindowButtonState = (button, isMaximized) => {
  if (!button) {
    return;
  }

  button.classList.toggle('is-maximized', Boolean(isMaximized));
  button.innerHTML = isMaximized ? '&#10064;' : '&#9744;';
  button.setAttribute('aria-label', isMaximized ? 'Restore window' : 'Maximize window');
  button.setAttribute('title', isMaximized ? 'Restore' : 'Maximize');
};

const bindDesktopWindowButton = ({ button, action, showToast }) => {
  button?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await action();
    } catch {
      showToast?.('Window control is temporarily unavailable.', 'error');
    }
  });
};

export const bindWindowChromeFallbacks = ({ showToast }) => {
  const desktopWindow = getDesktopWindowBridge();
  const minimizeButton = document.getElementById('titlebar-minimize');
  const maximizeButton = document.getElementById('titlebar-maximize');
  const closeButton = document.getElementById('titlebar-close');

  document.body?.classList.toggle('desktop-shell', Boolean(desktopWindow));

  if (desktopWindow) {
    bindDesktopWindowButton({
      button: minimizeButton,
      action: () => desktopWindow.minimize(),
      showToast
    });
    bindDesktopWindowButton({
      button: maximizeButton,
      action: async () => {
        const state = await desktopWindow.toggleMaximize();
        if (state && Object.prototype.hasOwnProperty.call(state, 'isMaximized')) {
          setWindowButtonState(maximizeButton, state.isMaximized);
        }
      },
      showToast
    });
    bindDesktopWindowButton({
      button: closeButton,
      action: () => desktopWindow.close(),
      showToast
    });

    setWindowButtonState(maximizeButton, false);
    desktopWindow.isMaximized?.()
      .then((isMaximized) => setWindowButtonState(maximizeButton, isMaximized))
      .catch(() => {});
    desktopWindow.onMaximizedChange?.((isMaximized) => {
      setWindowButtonState(maximizeButton, isMaximized);
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.group-menu.open').forEach((menu) => menu.classList.remove('open'));
      document.querySelectorAll('.node-action-menu.open').forEach((menu) => {
        menu.classList.remove('open');
        menu.removeAttribute('style');
      });
      document.querySelectorAll('.node-row.has-open-menu').forEach((row) => row.classList.remove('has-open-menu'));
    });
    return;
  }
  document.getElementById('titlebar-close')?.addEventListener('click', () => {
    showToast('Tauri 退出指令正在开发中...', 'info');
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.group-menu.open').forEach((menu) => menu.classList.remove('open'));
    document.querySelectorAll('.node-action-menu.open').forEach((menu) => {
      menu.classList.remove('open');
      menu.removeAttribute('style');
    });
    document.querySelectorAll('.node-row.has-open-menu').forEach((row) => row.classList.remove('has-open-menu'));
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
