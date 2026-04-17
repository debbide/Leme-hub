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
  dashSystemAutoSwitchToggle,
  dashSystemAutoSwitchGroupSelect,
  dashSystemAutoSwitchIntervalInput,
  renderSystemProxyNodeOptions,
  renderSystemProxyAutoSwitchControls,
  getNodesData,
  updateRestartWarning,
  getCurrentCoreState,
  autoStartToggle,
  dnsRemoteServerInput,
  dnsDirectServerInput,
  dnsBootstrapServerInput,
  speedtestUrlInput,
  dnsFinalSelect,
  dnsStrategySelect,
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
          if (masterStatusText) masterStatusText.textContent = '统一代理已关闭';
          showToast('统一代理已关闭', 'info');
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
          const captureEnabled = !!startPayload.core?.systemProxy?.enabled;
          if (masterStatusText) masterStatusText.textContent = captureEnabled ? '系统代理接管中' : '统一代理入口已开启';
          showToast(captureEnabled ? '系统代理已启动' : '统一代理已启动', 'success');
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
        renderSystemProxyNodeOptions(getNodesData(), coreData.proxy?.activeNodeId);
        updateRestartWarning(payload.restartRequired);
        if (payload.autoRestarted) {
          showToast('代理节点已切换并自动应用', 'success');
        } else if (payload.restartRequired) {
          showToast('代理节点已切换，运行中的核心已进入待应用状态', 'info');
        } else {
          showToast('代理节点已切换', 'success');
        }
      } catch (error) {
        showToast(`节点切换失败: ${error.message}`, 'error');
        if (getCurrentCoreState()?.proxy?.activeNodeId !== undefined) {
          dashActiveNodeSelect.value = getCurrentCoreState().proxy.activeNodeId || '';
        }
      }
    });
  }

  const restoreAutoSwitchControls = () => {
    const proxy = getCurrentCoreState()?.proxy || {};
    if (typeof renderSystemProxyAutoSwitchControls === 'function') {
      renderSystemProxyAutoSwitchControls(proxy);
    }
  };

  if (dashSystemAutoSwitchToggle) {
    dashSystemAutoSwitchToggle.addEventListener('change', async (event) => {
      const isEnabled = !!event.target.checked;
      const groupId = dashSystemAutoSwitchGroupSelect?.value
        || dashSystemAutoSwitchGroupSelect?.querySelector('option[value]:not([value=""])')?.value
        || null;
      if (isEnabled && !groupId) {
        showToast('请先选择一个可用的节点组', 'error');
        restoreAutoSwitchControls();
        return;
      }
      try {
        const payload = await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({
            systemProxyAutoSwitchEnabled: isEnabled,
            ...(isEnabled ? { systemProxyAutoSwitchGroupId: groupId } : {})
          })
        });
        if (payload.core) updateCoreStatus(payload.core);
        updateRestartWarning(payload.restartRequired);
        showToast(payload.autoRestarted
          ? '系统代理自动切换已更新并自动应用'
          : `系统代理自动切换已${isEnabled ? '开启' : '关闭'}`, 'success');
      } catch (error) {
        showToast(`自动切换设置失败: ${error.message}`, 'error');
        restoreAutoSwitchControls();
      }
    });
  }

  if (dashSystemAutoSwitchGroupSelect) {
    dashSystemAutoSwitchGroupSelect.addEventListener('change', async (event) => {
      const groupId = event.target.value || null;
      const currentAutoSwitch = getCurrentCoreState()?.proxy?.systemProxyAutoSwitch || {};
      if (currentAutoSwitch.enabled && !groupId) {
        showToast('开启自动切换时必须选择节点组', 'error');
        restoreAutoSwitchControls();
        return;
      }
      try {
        const payload = await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({
            systemProxyAutoSwitchGroupId: groupId,
            ...(currentAutoSwitch.enabled ? { systemProxyAutoSwitchEnabled: true } : {})
          })
        });
        if (payload.core) updateCoreStatus(payload.core);
        updateRestartWarning(payload.restartRequired);
        showToast(payload.autoRestarted ? '自动切换节点组已切换并自动应用' : '自动切换节点组已更新', 'success');
      } catch (error) {
        showToast(`节点组更新失败: ${error.message}`, 'error');
        restoreAutoSwitchControls();
      }
    });
  }

  if (dashSystemAutoSwitchIntervalInput) {
    dashSystemAutoSwitchIntervalInput.addEventListener('change', async (event) => {
      const rawMinutes = Number.parseInt(event.target.value, 10);
      if (!Number.isInteger(rawMinutes) || rawMinutes < 1) {
        showToast('切换时间必须是大于 0 的整数分钟', 'error');
        restoreAutoSwitchControls();
        return;
      }

      try {
        const payload = await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({
            systemProxyAutoSwitchIntervalSec: rawMinutes * 60
          })
        });
        if (payload.core) updateCoreStatus(payload.core);
        updateRestartWarning(payload.restartRequired);
        showToast('自动切换时间已更新', 'success');
      } catch (error) {
        showToast(`切换时间更新失败: ${error.message}`, 'error');
        restoreAutoSwitchControls();
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

  const bindSettingsInput = (input, buildPatch, label) => {
    if (!input) return;
    input.addEventListener('change', async () => {
      const value = input.value;
      try {
        const payload = await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify(buildPatch(value))
        });
        if (payload.core) updateCoreStatus(payload.core);
        renderRoutingModeBanner();
        showToast(payload.autoRestarted ? `${label}已更新并自动应用` : `${label}已更新`, 'success');
      } catch (error) {
        showToast(`${label}失败: ${error.message}`, 'error');
      }
    });
  };

  bindSettingsInput(dnsRemoteServerInput, (value) => ({ dnsRemoteServer: String(value || '').trim() }), 'DNS 设置');
  bindSettingsInput(dnsDirectServerInput, (value) => ({ dnsDirectServer: String(value || '').trim() }), 'DNS 设置');
  bindSettingsInput(dnsBootstrapServerInput, (value) => ({ dnsBootstrapServer: String(value || '').trim() }), 'DNS 设置');
  bindSettingsInput(speedtestUrlInput, (value) => ({ speedtestUrl: String(value || '').trim() }), '测速设置');
  bindSettingsInput(dnsFinalSelect, (value) => ({ dnsFinal: value }), 'DNS 设置');
  bindSettingsInput(dnsStrategySelect, (value) => ({ dnsStrategy: value }), 'DNS 设置');
};
