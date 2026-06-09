const formatHostForUrl = (value) => {
  const host = String(value || '').trim();
  if (!host) return '';
  if (host.startsWith('[') && host.endsWith(']')) return host;
  return host.includes(':') ? `[${host}]` : host;
};

const formatDateTime = (value) => {
  if (!value) return '--';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '--';
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
};

const getNodeLabel = (node) => node?.name || node?.server || node?.id || '--';

const ROUTING_MODE_LABELS = {
  rule: '规则分流',
  global: '全局接管',
  direct: '直连退出'
};

const setText = (element, value) => {
  if (element) element.textContent = value;
};

const summarizeAutoSwitch = (autoSwitch = {}, nodeGroups = []) => {
  if (!autoSwitch.enabled) {
    return {
      summary: '未启用',
      detail: nodeGroups.length ? '选择节点组后可按时间自动切换出口。' : '暂无可用节点组。'
    };
  }

  const group = nodeGroups.find((item) => item.id === autoSwitch.groupId);
  const groupName = group?.name || autoSwitch.groupId || '未选择节点组';
  const intervalMinutes = Math.max(1, Math.round((Number(autoSwitch.intervalSec) || 600) / 60));
  return {
    summary: `${groupName} · ${intervalMinutes} 分钟`,
    detail: `下次切换：${formatDateTime(autoSwitch.nextAt)}`
  };
};

export const renderSystemProxyNodeOptions = ({ dashActiveNodeSelect, nodes, activeNodeId }) => {
  if (!dashActiveNodeSelect) return;

  const currentValue = activeNodeId || '';
  const fallbackNode = nodes[0] || null;
  const fallbackLabel = fallbackNode ? `默认：${getNodeLabel(fallbackNode)}` : '暂无可用节点';
  dashActiveNodeSelect.innerHTML = [
    `<option value="">${fallbackLabel}</option>`,
    ...nodes.map((node) => {
      const label = getNodeLabel(node);
      return `<option value="${node.id}">${label}</option>`;
    })
  ].join('');
  dashActiveNodeSelect.value = currentValue;
};

export const renderProxyEndpoints = ({ proxyProfile = {}, sidebarDefaultProxy, dashProxyEndpoint }) => {
  const listenHost = proxyProfile.listenHost || '127.0.0.1';
  const defaultEndpoint = proxyProfile.systemDefaultEndpoint || {
    protocol: 'http',
    host: listenHost,
    port: proxyProfile.unifiedHttpPort || 18999,
    url: `http://${formatHostForUrl(listenHost)}:${proxyProfile.unifiedHttpPort || 18999}`
  };
  if (sidebarDefaultProxy) {
    sidebarDefaultProxy.textContent = defaultEndpoint.url;
  }
  setText(dashProxyEndpoint, defaultEndpoint.url);
};

export const renderSystemProxyAutoSwitchControls = ({
  proxyProfile = {},
  dashSystemAutoSwitchToggle,
  dashSystemAutoSwitchGroupSelect,
  dashSystemAutoSwitchIntervalInput,
  dashSystemAutoSwitchCurrent,
  dashSystemAutoSwitchNext,
  dashAutoSwitchSummary,
  dashAutoSwitchDetail,
  dashNodeGroupCount
}) => {
  const autoSwitch = proxyProfile.systemProxyAutoSwitch || {};
  const nodeGroups = Array.isArray(proxyProfile.nodeGroups)
    ? proxyProfile.nodeGroups.filter((group) => group && group.selectedNodeId)
    : [];

  if (dashSystemAutoSwitchGroupSelect) {
    const currentValue = autoSwitch.groupId || '';
    dashSystemAutoSwitchGroupSelect.innerHTML = [
      `<option value="">${nodeGroups.length ? '请选择节点组' : '暂无可用节点组'}</option>`,
      ...nodeGroups.map((group) => `<option value="${group.id}">${group.name || group.id}</option>`)
    ].join('');
    dashSystemAutoSwitchGroupSelect.value = nodeGroups.some((group) => group.id === currentValue) ? currentValue : '';
    dashSystemAutoSwitchGroupSelect.disabled = nodeGroups.length === 0;
  }

  if (dashSystemAutoSwitchToggle) {
    dashSystemAutoSwitchToggle.checked = !!autoSwitch.enabled;
    dashSystemAutoSwitchToggle.disabled = nodeGroups.length === 0;
  }

  if (dashSystemAutoSwitchIntervalInput) {
    const intervalMinutes = Math.max(1, Math.round((Number(autoSwitch.intervalSec) || 600) / 60));
    dashSystemAutoSwitchIntervalInput.value = String(intervalMinutes);
  }

  if (dashSystemAutoSwitchCurrent) {
    const currentNode = getNodeLabel(autoSwitch.effectiveNode || proxyProfile.systemDefaultNode);
    const activeNode = getNodeLabel(proxyProfile.activeNode);
    dashSystemAutoSwitchCurrent.textContent = autoSwitch.enabled
      ? `系统代理出口：${currentNode}`
      : `系统代理出口：${currentNode} · 主节点：${activeNode}`;
  }

  if (dashSystemAutoSwitchNext) {
    dashSystemAutoSwitchNext.textContent = autoSwitch.enabled
      ? `下次切换：${formatDateTime(autoSwitch.nextAt)}`
      : '下次切换：未启用';
  }

  const autoSummary = summarizeAutoSwitch(autoSwitch, nodeGroups);
  setText(dashAutoSwitchSummary, autoSummary.summary);
  setText(dashAutoSwitchDetail, autoSummary.detail);
  setText(dashNodeGroupCount, `${nodeGroups.length} 组`);
};

export const formatRate = (bytesPerSec) => {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) {
    return '0 B/s';
  }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSec;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[unit]}`;
};

export const renderSpeedSparkline = ({ speedHistory }) => {
  const bars = document.querySelectorAll('.speed-sparkline span');
  if (!bars.length) return;
  const max = Math.max(1, ...speedHistory);
  bars.forEach((bar, index) => {
    const value = speedHistory[index] || 0;
    const pct = Math.max(14, Math.min(100, Math.round((value / max) * 100)));
    bar.style.height = `${pct}%`;
  });
};

export const updateSpeedCard = ({ dashSpeedValue, downloadRate = 0, uploadRate = 0, speedHistory, setSpeedHistory }) => {
  if (dashSpeedValue) {
    dashSpeedValue.textContent = `↓ ${formatRate(downloadRate)} · ↑ ${formatRate(uploadRate)}`;
  }
  const nextHistory = [...speedHistory.slice(1), downloadRate];
  setSpeedHistory(nextHistory);
  renderSpeedSparkline({ speedHistory: nextHistory });
};

export const pollTraffic = async ({
  requestJson,
  currentCoreState,
  getLastTrafficSample,
  setLastTrafficSample,
  updateSpeedCard,
}) => {
  if (!document.getElementById('dashboard-view')?.classList.contains('active')) {
    return;
  }
  if (currentCoreState?.status !== 'running') {
    setLastTrafficSample(null);
    updateSpeedCard(0, 0);
    return;
  }

  try {
    const payload = await requestJson('/api/core/traffic');
    const sample = payload.traffic || null;
    const nowMs = Date.now();
    if (!sample || !Number.isFinite(Number(sample.uploadBytes)) || !Number.isFinite(Number(sample.downloadBytes))) {
      return;
    }

    const lastTrafficSample = getLastTrafficSample();
    if (lastTrafficSample) {
      const elapsedSec = Math.max(0.001, (nowMs - lastTrafficSample.tsMs) / 1000);
      const downRate = Math.max(0, (Number(sample.downloadBytes) - lastTrafficSample.downloadBytes) / elapsedSec);
      const upRate = Math.max(0, (Number(sample.uploadBytes) - lastTrafficSample.uploadBytes) / elapsedSec);
      updateSpeedCard(downRate, upRate);
    }

    setLastTrafficSample({
      tsMs: nowMs,
      uploadBytes: Number(sample.uploadBytes),
      downloadBytes: Number(sample.downloadBytes)
    });
  } catch {
    // keep previous visual state if polling fails temporarily
  }
};

const formatApplyTime = (value) => {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const renderNodeApplyStatus = ({ nodeApply, dashNodeApplyStatus }) => {
  if (!dashNodeApplyStatus) return;
  const state = nodeApply?.state || 'idle';
  const hasNodePageClass = typeof dashNodeApplyStatus.classList?.contains === 'function'
    && dashNodeApplyStatus.classList.contains('nodes-apply-status');
  const baseClass = hasNodePageClass
    ? 'nodes-apply-status dashboard-apply-status'
    : 'dashboard-apply-status';
  dashNodeApplyStatus.className = baseClass;

  if (state === 'applying') {
    dashNodeApplyStatus.classList.remove?.('hidden');
    dashNodeApplyStatus.classList.add('is-applying');
    dashNodeApplyStatus.textContent = '节点配置：正在应用到核心';
    dashNodeApplyStatus.title = '节点已保存，正在后台校验并重启核心';
    return;
  }

  if (state === 'failed') {
    const detail = nodeApply?.lastError ? `：${nodeApply.lastError}` : '';
    dashNodeApplyStatus.classList.remove?.('hidden');
    dashNodeApplyStatus.classList.add('is-failed');
    dashNodeApplyStatus.textContent = '节点配置：应用失败';
    dashNodeApplyStatus.title = `节点保存成功，但应用到核心失败${detail}`;
    return;
  }

  if (state === 'applied') {
    const time = formatApplyTime(nodeApply?.lastAppliedAt);
    dashNodeApplyStatus.classList.remove?.('hidden');
    dashNodeApplyStatus.classList.add('is-applied');
    dashNodeApplyStatus.textContent = `节点配置：已应用${time ? ` ${time}` : ''}`;
    dashNodeApplyStatus.title = '最新节点配置已应用到核心';
    return;
  }

  if (baseClass.includes('nodes-apply-status')) {
    dashNodeApplyStatus.classList.add('hidden');
  }
  dashNodeApplyStatus.classList.add('is-idle');
  dashNodeApplyStatus.textContent = '节点配置：已同步';
  dashNodeApplyStatus.title = '当前没有待应用的节点变更';
};

const renderDashboardSummaries = ({
  core,
  systemProxy,
  proxyProfile,
  dashCurrentOutlet,
  dashProxyMode,
  dashLinkSummary,
  dashLinkDetail,
  dashConfigSummary,
  dashConfigDetail
}) => {
  const autoSwitch = proxyProfile.systemProxyAutoSwitch || {};
  const outletNode = autoSwitch.enabled
    ? autoSwitch.effectiveNode || proxyProfile.systemDefaultNode || proxyProfile.activeNode
    : proxyProfile.systemDefaultNode || proxyProfile.activeNode;
  const activeNode = proxyProfile.activeNode;
  const outletName = getNodeLabel(outletNode);
  const activeName = getNodeLabel(activeNode);
  const mode = proxyProfile.mode || 'rule';
  const modeLabel = ROUTING_MODE_LABELS[mode] || mode;
  const nodeApply = core.nodeApply || {};

  setText(dashCurrentOutlet, outletName);
  setText(dashProxyMode, modeLabel);

  if (core.status !== 'running') {
    setText(dashLinkSummary, '核心未运行');
    setText(dashLinkDetail, systemProxy.enabled ? '检测到系统代理被外部占用。' : '开启后会显示当前系统代理出口。');
  } else if (systemProxy.enabled) {
    setText(dashLinkSummary, `系统代理 → ${outletName}`);
    setText(dashLinkDetail, autoSwitch.enabled
      ? `自动切换已接管出口，主节点为 ${activeName}。`
      : `当前跟随主节点 ${activeName}。`);
  } else if (proxyProfile.systemProxyEnabled) {
    setText(dashLinkSummary, `统一入口 → ${outletName}`);
    setText(dashLinkDetail, '核心已运行，可通过本地入口手动使用代理。');
  } else {
    setText(dashLinkSummary, '核心运行中');
    setText(dashLinkDetail, '系统代理未接管，统一入口未开启。');
  }

  if (nodeApply.state === 'applying') {
    setText(dashConfigSummary, '正在应用');
    setText(dashConfigDetail, '节点已保存，正在后台校验并重启核心。');
  } else if (nodeApply.state === 'failed') {
    setText(dashConfigSummary, '应用失败');
    setText(dashConfigDetail, nodeApply.lastError || '节点保存成功，但应用到核心失败。');
  } else if (nodeApply.state === 'applied') {
    const time = formatApplyTime(nodeApply.lastAppliedAt);
    setText(dashConfigSummary, time ? `已应用 ${time}` : '已应用');
    setText(dashConfigDetail, '最新节点配置已应用到核心。');
  } else {
    setText(dashConfigSummary, '已同步');
    setText(dashConfigDetail, '当前没有待应用的节点变更。');
  }
};

export const updateCoreStatus = ({
  core,
  setCurrentCoreState,
  coreStatusIndicator,
  systemProxyModeSelect,
  renderRoutingModeBanner,
  dashActiveNodeSelect,
  autoStartToggle,
  getCurrentCoreState,
  getUptimeTimer,
  setUptimeTimer,
  dashUptime,
  dashCurrentOutlet,
  dashProxyMode,
  dashLinkSummary,
  dashLinkDetail,
  dashConfigSummary,
  dashConfigDetail,
  renderProxyEndpoints,
  renderSystemProxyAutoSwitchControls,
  renderNodeApplyStatus,
}) => {
  if (!core) return;
  setCurrentCoreState(core);
  coreStatusIndicator.className = 'status-dot tooltip';
  const dashSwitch = document.getElementById('master-switch');
  const dashText = document.getElementById('master-status-text');
  const systemProxy = core.systemProxy || {};
  const proxyProfile = core.proxy || {};
  const unifiedProxyEnabled = !!proxyProfile.systemProxyEnabled;

  renderProxyEndpoints(proxyProfile);
  if (typeof renderSystemProxyAutoSwitchControls === 'function') {
    renderSystemProxyAutoSwitchControls(proxyProfile);
  }
  if (typeof renderNodeApplyStatus === 'function') {
    renderNodeApplyStatus(core.nodeApply || null);
  }
  renderDashboardSummaries({
    core,
    systemProxy,
    proxyProfile,
    dashCurrentOutlet,
    dashProxyMode,
    dashLinkSummary,
    dashLinkDetail,
    dashConfigSummary,
    dashConfigDetail
  });

  if (systemProxyModeSelect && proxyProfile.mode) {
    systemProxyModeSelect.value = proxyProfile.mode;
  }

  renderRoutingModeBanner();

  if (dashActiveNodeSelect) {
    dashActiveNodeSelect.value = proxyProfile.activeNodeId || '';
  }

  if (autoStartToggle && typeof core.autoStart?.enabled === 'boolean') {
    autoStartToggle.checked = !!core.autoStart.enabled;
  } else if (autoStartToggle && core.settings) {
    autoStartToggle.checked = !!core.settings.autoStart;
  } else if (autoStartToggle && getCurrentCoreState()?.settings) {
    autoStartToggle.checked = !!getCurrentCoreState().settings.autoStart;
  }

  const existingTimer = getUptimeTimer();
  if (existingTimer) {
    clearInterval(existingTimer);
    setUptimeTimer(null);
  }

  const renderUptime = () => {
    if (!dashUptime) return;
    if (!core.startedAt) {
      dashUptime.textContent = '00:00:00';
      return;
    }
    const diff = Math.max(0, Date.now() - new Date(core.startedAt).getTime());
    const totalSeconds = Math.floor(diff / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    dashUptime.textContent = `${hours}:${minutes}:${seconds}`;
  };

  renderUptime();
  if (core.status === 'running' && core.startedAt) {
    setUptimeTimer(setInterval(renderUptime, 1000));
  }

  if (core.status === 'running' && systemProxy.enabled) {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if (dashSwitch) {
      dashSwitch.classList.remove('off');
      dashSwitch.classList.add('on');
      dashText.textContent = '系统代理接管中';
      dashText.className = 'status-pill is-running';
    }
  } else if (core.status === 'running' && unifiedProxyEnabled) {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if (dashSwitch) {
      dashSwitch.classList.remove('off');
      dashSwitch.classList.add('on');
      dashText.textContent = '核心运行中，统一代理入口已开启';
      dashText.className = 'status-pill is-running';
    }
  } else if (core.status === 'running') {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '核心运行中，统一代理入口未开启';
      dashText.className = 'status-pill is-idle';
    }
  } else if (core.status === 'crashed') {
    coreStatusIndicator.classList.add('crashed');
    coreStatusIndicator.title = '多次崩溃，需手动重启';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎已崩溃，请手动重启';
      dashText.className = 'status-pill is-error';
    }
  } else if (core.status === 'error') {
    coreStatusIndicator.classList.add('error');
    coreStatusIndicator.title = '异常终止';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎运行异常';
      dashText.className = 'status-pill is-error';
    }
  } else {
    coreStatusIndicator.classList.add('stopped');
    coreStatusIndicator.title = systemProxy.enabled ? '核心已停止，检测到外部系统代理' : '已停止';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = systemProxy.enabled ? '核心已停止，系统代理仍被外部占用' : '统一代理已关闭';
      dashText.className = 'status-pill is-off';
    }
  }
};
