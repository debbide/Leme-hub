const formatHostForUrl = (value) => {
  const host = String(value || '').trim();
  if (!host) return '';
  if (host.startsWith('[') && host.endsWith(']')) return host;
  return host.includes(':') ? `[${host}]` : host;
};

export const renderSystemProxyNodeOptions = ({ dashActiveNodeSelect, nodes, activeNodeId }) => {
  if (!dashActiveNodeSelect) return;

  const currentValue = activeNodeId || '';
  dashActiveNodeSelect.innerHTML = [
    '<option value="">默认首个节点</option>',
    ...nodes.map((node) => {
      const label = node.name || node.server || node.id;
      return `<option value="${node.id}">${label}</option>`;
    })
  ].join('');
  dashActiveNodeSelect.value = currentValue;
};

export const renderProxyEndpoints = ({ proxyProfile = {}, sidebarDefaultProxy }) => {
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
  renderProxyEndpoints,
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
