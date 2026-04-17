export const loadSystemRuntimeStatus = async ({ requestJson, renderGeoIpStatus, renderRulesetDatabaseStatus, updateCoreStatus, setRoutingNodeOptions, extractRoutingObservability, renderRoutingObservability, loadRoutingHits, showToast, applySettingsSnapshot }) => {
  try {
    const payload = await requestJson('/api/system/status');
    const runtimePaths = payload.core?.paths;
    if (runtimePaths?.settingsPath) {
      console.info('[Leme Hub] runtime paths', runtimePaths);
    }
    renderGeoIpStatus(payload.geoIp || payload.core?.geoIp || null);
    renderRulesetDatabaseStatus(payload.rulesetDatabase || payload.core?.rulesetDatabase || null);
    updateCoreStatus(payload.core);
    if (typeof applySettingsSnapshot === 'function') {
      applySettingsSnapshot(payload.settings || payload.core?.settings || null);
    }
    setRoutingNodeOptions(payload.core?.nodes || null);
    const observabilityEntries = extractRoutingObservability(payload.core);
    renderRoutingObservability(observabilityEntries);
    await loadRoutingHits();
  } catch (error) {
    showToast(`系统状态加载失败: ${error.message}`, 'error');
  }
};

export const applySystemSettingsSnapshot = ({ settings, autoStartToggle, dnsRemoteServerInput, dnsDirectServerInput, dnsBootstrapServerInput, speedtestUrlInput, dnsFinalSelect, dnsStrategySelect }) => {
  if (!settings || typeof settings !== 'object') return;
  if (dnsRemoteServerInput) dnsRemoteServerInput.value = settings.dnsRemoteServer || '';
  if (dnsDirectServerInput) dnsDirectServerInput.value = settings.dnsDirectServer || '';
  if (dnsBootstrapServerInput) dnsBootstrapServerInput.value = settings.dnsBootstrapServer || '';
  if (speedtestUrlInput) speedtestUrlInput.value = settings.speedtestUrl || '';
  if (dnsFinalSelect) dnsFinalSelect.value = settings.dnsFinal || 'dns-remote';
  if (dnsStrategySelect) dnsStrategySelect.value = settings.dnsStrategy || 'prefer_ipv4';
};

export const refreshGeoIpData = async ({ geoIpRefreshBtn, requestJson, renderGeoIpStatus, getGeoIpStatus, loadNodes, showToast }) => {
  if (!geoIpRefreshBtn) return;
  geoIpRefreshBtn.disabled = true;
  geoIpRefreshBtn.textContent = 'GeoIP 下载中...';
  try {
    const payload = await requestJson('/api/system/geoip/refresh', { method: 'POST' });
    renderGeoIpStatus(payload.geoIp || null);
    await loadNodes();
    showToast(payload.geoIp?.ready ? 'GeoIP 数据已刷新' : 'GeoIP 刷新已触发，正在后台准备', 'success');
  } catch (error) {
    renderGeoIpStatus(getGeoIpStatus());
    showToast(`GeoIP 刷新失败: ${error.message}`, 'error');
  } finally {
    renderGeoIpStatus(getGeoIpStatus());
  }
};

export const refreshRulesetDatabaseState = async ({ rulesetDbRefreshBtn, requestJson, renderRulesetDatabaseStatus, getRulesetDatabaseStatus, loadSystemStatus, showToast }) => {
  if (!rulesetDbRefreshBtn) return;
  rulesetDbRefreshBtn.disabled = true;
  rulesetDbRefreshBtn.textContent = '规则库下载中...';
  try {
    const payload = await requestJson('/api/system/rulesets/refresh', { method: 'POST' });
    renderRulesetDatabaseStatus(payload.rulesetDatabase || null);
    await loadSystemStatus();
    showToast(payload.rulesetDatabase?.ready ? '规则库已刷新' : '规则库刷新已触发，正在后台准备', 'success');
  } catch (error) {
    renderRulesetDatabaseStatus(getRulesetDatabaseStatus());
    showToast(`规则库刷新失败: ${error.message}`, 'error');
  } finally {
    renderRulesetDatabaseStatus(getRulesetDatabaseStatus());
  }
};

export const stopRoutingStatusPolling = ({ routingStatusPoller, setRoutingStatusPoller }) => {
  if (routingStatusPoller) {
    clearInterval(routingStatusPoller);
    setRoutingStatusPoller(null);
  }
};

export const startRoutingStatusPolling = ({ stopRoutingStatusPolling, setRoutingStatusPoller, loadSystemStatus }) => {
  stopRoutingStatusPolling();
  setRoutingStatusPoller(setInterval(() => {
    if (!document.getElementById('routing-logs-view')?.classList.contains('active')) {
      stopRoutingStatusPolling();
      return;
    }
    loadSystemStatus();
  }, 8000));
};

export const stopTrafficPolling = ({ trafficPoller, setTrafficPoller }) => {
  if (trafficPoller) {
    clearInterval(trafficPoller);
    setTrafficPoller(null);
  }
};

export const startTrafficPolling = ({ trafficPoller, pollTraffic, setTrafficPoller, TRAFFIC_POLL_INTERVAL_MS }) => {
  if (trafficPoller) return;
  pollTraffic();
  setTrafficPoller(setInterval(pollTraffic, TRAFFIC_POLL_INTERVAL_MS));
};

export const runCoreAction = async ({ action, saveRestartBtn, requestJson, showToast, updateRestartWarning, updateCoreStatus, loadNodes }) => {
  const btn = saveRestartBtn;
  const originalText = btn.textContent;
  btn.textContent = '处理中...';
  try {
    const payload = await requestJson(`/api/core/${action}`, { method: 'POST' });
    showToast('操作成功，代理已重启应用。', 'success');
    updateRestartWarning(false);
    updateCoreStatus(payload.core);
    await loadNodes();
  } catch (error) {
    showToast(`操作失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = originalText;
  }
};
