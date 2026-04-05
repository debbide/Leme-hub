export const bindSystemEvents = ({
  masterSwitch,
  masterStatusText,
  requestJson,
  systemProxyModeSelect,
  updateCoreStatus,
  showToast,
  loadNodes,
  loadSystemStatus,
  dashActiveNodeSelect,
  renderSystemProxyNodeOptions,
  nodesData,
  updateRestartWarning,
  getCurrentCoreState,
  autoStartToggle,
  renderRoutingModeBanner,
}) => {
  if (masterSwitch) {
    masterSwitch.addEventListener('click', async () => {
      const isCurrentlyOn = masterSwitch.classList.contains('on');
      masterSwitch.disabled = true;
      try {
        if (isCurrentlyOn) {
          await requestJson('/api/system/proxy/disable', { method: 'POST' });
          await requestJson('/api/system/settings', {
            method: 'PUT',
            body: JSON.stringify({ systemProxyEnabled: false })
          });
          const stopPayload = await requestJson('/api/core/stop', { method: 'POST' });
          updateCoreStatus(stopPayload.core);
          masterSwitch.classList.remove('on');
          masterSwitch.classList.add('off');
          if (masterStatusText) masterStatusText.textContent = '系统代理已关闭';
          showToast('系统代理已关闭', 'info');
        } else {
          const selectedMode = systemProxyModeSelect?.value || 'rule';
          await requestJson('/api/system/settings', {
            method: 'PUT',
            body: JSON.stringify({
              routingMode: selectedMode,
              systemProxyEnabled: true
            })
          });
          const startPayload = await requestJson('/api/core/start', { method: 'POST' });
          updateCoreStatus(startPayload.core);
          masterSwitch.classList.remove('off');
          masterSwitch.classList.add('on');
          if (masterStatusText) masterStatusText.textContent = '系统代理接管中';
          showToast('系统代理已启动', 'success');
        }
        await loadNodes();
        await loadSystemStatus();
      } catch (error) {
        showToast(`操作失败: ${error.message}`, 'error');
      } finally {
        masterSwitch.disabled = false;
      }
    });
  }

  if (systemProxyModeSelect) {
    systemProxyModeSelect.addEventListener('change', async (event) => {
      const nextMode = event.target.value;
      try {
        const payload = await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ routingMode: nextMode })
        });
        updateCoreStatus(payload.core);
        updateRestartWarning(payload.restartRequired);
        renderRoutingModeBanner();
        showToast(payload.autoRestarted ? '代理模式已更新并自动应用' : '代理模式已更新', 'success');
      } catch (error) {
        showToast(`模式更新失败: ${error.message}`, 'error');
        if (getCurrentCoreState()?.proxy?.mode) {
          systemProxyModeSelect.value = getCurrentCoreState().proxy.mode;
        }
      }
    });
  }

  if (dashActiveNodeSelect) {
    dashActiveNodeSelect.addEventListener('change', async (event) => {
      const activeNodeId = event.target.value || null;
      try {
        const payload = await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ activeNodeId })
        });
        const coreData = payload.core || payload;
        updateCoreStatus(coreData);
        renderSystemProxyNodeOptions(nodesData, coreData.proxy?.activeNodeId);
        updateRestartWarning(payload.restartRequired);
        if (payload.autoRestarted) {
          showToast('系统代理节点已切换并自动应用', 'success');
        } else if (payload.restartRequired) {
          showToast('系统代理节点已切换，运行中的核心已进入待应用状态', 'info');
        } else {
          showToast('系统代理节点已切换', 'success');
        }
      } catch (error) {
        showToast(`节点切换失败: ${error.message}`, 'error');
        if (getCurrentCoreState()?.proxy?.activeNodeId !== undefined) {
          dashActiveNodeSelect.value = getCurrentCoreState().proxy.activeNodeId || '';
        }
      }
    });
  }

  if (autoStartToggle) {
    autoStartToggle.addEventListener('change', async (event) => {
      const isEnabled = event.target.checked;
      try {
        await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ autoStart: isEnabled })
        });
        showToast(`开机自启动已${isEnabled ? '开启' : '禁用'}`, 'success');
      } catch (error) {
        showToast(`设置失败: ${error.message}`, 'error');
        event.target.checked = !isEnabled;
      }
    });
  }
};
