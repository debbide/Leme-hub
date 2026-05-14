export const renderUwpLoopbackStatus = ({
  status,
  systemProxyDiagnosis = null,
  uwpLoopbackStatusEl,
  uwpLoopbackDesc,
  uwpLoopbackRefreshBtn,
  uwpLoopbackEnableBtn,
  uwpLoopbackDisableBtn
}) => {
  const supported = status?.supported !== false;
  const exempted = !!status?.exempted;
  const pending = !status;
  const lastError = status?.lastError || '';
  const totalCount = Number(status?.totalCount) || 0;
  const exemptedCount = Number(status?.exemptedCount) || 0;
  const progressText = totalCount > 1 ? ` ${exemptedCount}/${totalCount}` : '';
  const diagnosis = systemProxyDiagnosis || status?.systemProxyDiagnosis || null;
  const diagnosisFailedChecks = diagnosis?.checks
    ? Object.entries(diagnosis.checks)
      .filter(([, check]) => check && check.ok === false)
      .map(([name]) => name)
    : [];
  const diagnosisOk = !diagnosis || diagnosis.ok !== false;
  const allOk = exempted && diagnosisOk;

  if (uwpLoopbackStatusEl) {
    uwpLoopbackStatusEl.className = 'uwp-loopback-status';
    if (pending) {
      uwpLoopbackStatusEl.classList.add('is-muted');
      uwpLoopbackStatusEl.textContent = '检测中';
    } else if (!supported) {
      uwpLoopbackStatusEl.classList.add('is-muted');
      uwpLoopbackStatusEl.textContent = '不可用';
    } else if (lastError) {
      uwpLoopbackStatusEl.classList.add('is-warn');
      uwpLoopbackStatusEl.textContent = '检测失败';
    } else if (allOk) {
      uwpLoopbackStatusEl.classList.add('is-ok');
      uwpLoopbackStatusEl.textContent = `已修复${progressText}`;
    } else if (exempted) {
      uwpLoopbackStatusEl.classList.add('is-warn');
      uwpLoopbackStatusEl.textContent = `待验证${progressText}`;
    } else {
      uwpLoopbackStatusEl.classList.add('is-warn');
      uwpLoopbackStatusEl.textContent = `未修复${progressText}`;
    }
  }

  if (uwpLoopbackDesc) {
    if (pending) {
      uwpLoopbackDesc.textContent = '检测微软商店是否允许访问本地代理';
    } else if (!supported) {
      uwpLoopbackDesc.textContent = '仅 Windows 的微软商店需要处理 UWP 回环限制';
    } else if (lastError) {
      uwpLoopbackDesc.textContent = lastError;
    } else if (exempted && !diagnosisOk) {
      const labels = {
        wininet: '系统代理',
        winhttp: 'WinHTTP',
        localProxy: '本地代理入口'
      };
      const failedText = diagnosisFailedChecks.map((name) => labels[name] || name).join('、') || diagnosis?.lastError || '代理链路';
      uwpLoopbackDesc.textContent = `UWP 已放行，但 ${failedText} 未通过；请确认代理已启动并以管理员身份修复`;
    } else if (exempted) {
      uwpLoopbackDesc.textContent = '微软商店、Store Experience Host 和账号登录组件已允许访问本地代理';
    } else {
      uwpLoopbackDesc.textContent = totalCount > 1
        ? '微软商店登录链路仍有组件不能访问本地代理'
        : '微软商店默认不能访问 127.0.0.1，本地代理可能无效';
    }
  }

  if (uwpLoopbackRefreshBtn) {
    uwpLoopbackRefreshBtn.disabled = pending || !supported;
  }
  if (uwpLoopbackEnableBtn) {
    uwpLoopbackEnableBtn.hidden = !supported || exempted;
    uwpLoopbackEnableBtn.disabled = pending || !supported || exempted || !!lastError;
  }
  if (uwpLoopbackDisableBtn) {
    uwpLoopbackDisableBtn.hidden = !supported || !exempted;
    uwpLoopbackDisableBtn.disabled = pending || !supported || !exempted;
  }
};

export const loadUwpLoopbackStatus = async ({
  requestJson,
  renderUwpLoopbackStatus,
  updateCoreStatus,
  showToast
}) => {
  try {
    const payload = await requestJson('/api/system/uwp-loopback');
    renderUwpLoopbackStatus(payload.uwpLoopback || null, payload.systemProxyDiagnosis || null);
    if (payload.core) updateCoreStatus(payload.core);
    return payload.uwpLoopback || null;
  } catch (error) {
    renderUwpLoopbackStatus(null);
    showToast(`UWP 回环状态检测失败: ${error.message}`, 'error');
    return null;
  }
};

export const loadSystemRuntimeStatus = async ({ requestJson, renderGeoIpStatus, renderRulesetDatabaseStatus, renderUwpLoopbackStatus, updateCoreStatus, setRoutingNodeOptions, extractRoutingObservability, renderRoutingObservability, loadRoutingHits, showToast, applySettingsSnapshot }) => {
  try {
    const payload = await requestJson('/api/system/status');
    const runtimePaths = payload.core?.paths;
    if (runtimePaths?.settingsPath) {
      console.info('[Leme Hub] runtime paths', runtimePaths);
    }
    renderGeoIpStatus(payload.geoIp || payload.core?.geoIp || null);
    renderRulesetDatabaseStatus(payload.rulesetDatabase || payload.core?.rulesetDatabase || null);
    if (typeof renderUwpLoopbackStatus === 'function') {
      renderUwpLoopbackStatus(payload.uwpLoopback || null, payload.systemProxyDiagnosis || null);
    }
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
