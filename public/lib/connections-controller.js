import { debounce, escapeHtml, requestJson } from './utils.js';

const POLL_INTERVAL_MS = 3000;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[unit]}`;
};

const formatTime = (iso) => {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('zh-CN', { hour12: false });
};

const formatDuration = (iso) => {
  if (!iso) return '--';
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return '--';
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}小时 ${m}分`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
};

const detailRow = (label, value, cls = '') => `
  <div class="connection-detail-row${cls ? ` ${cls}` : ''}">
    <span class="connection-detail-label">${escapeHtml(label)}</span>
    <span class="connection-detail-value">${escapeHtml(value)}</span>
  </div>`;

// Semantic color class for the exit-node cell: blue for proxied nodes,
// gray for direct, red for blocked. Exported for tests.
export const getExitNodeClass = (exitNode) => {
  const tag = String(exitNode || '').toLowerCase();
  if (!tag) return '';
  if (tag === 'direct') return 'cell-exit-direct';
  if (/block|reject/.test(tag)) return 'cell-exit-block';
  return 'cell-exit-proxy';
};

// Pure: builds the connection detail panel HTML. Exported for tests.
export const buildConnectionDetailHtml = (connection) => {
  if (!connection) {
    return '<div class="connection-detail-empty">该连接已结束</div>';
  }
  const target = connection.destinationPort
    ? `${connection.host || connection.sourceIP || '--'}:${connection.destinationPort}`
    : (connection.host || '--');
  const chains = (connection.resolvedChains || connection.chains || []).filter(Boolean);
  const exitNodeLabel = connection.exitNode
    ? (connection.exitNodeTag ? `${connection.exitNode} (${connection.exitNodeTag})` : connection.exitNode)
    : (chains[chains.length - 1] || '--');
  const source = [connection.sourceIP, connection.sourcePort].filter((v) => v !== null && v !== undefined && v !== '').join(':');
  const network = [connection.network, connection.type].filter(Boolean).join(' / ');
  const rule = [connection.rule, connection.rulePayload].filter(Boolean).join(' ');
  return `<div class="connection-detail-rows">
    ${detailRow('完整链路', chains.length ? chains.join(' → ') : '--', 'is-headline')}
    ${detailRow('出口节点', exitNodeLabel)}
    ${detailRow('目标', target)}
    ${detailRow('进程', connection.process || '--')}
    ${detailRow('匹配规则', rule || '--')}
    ${detailRow('来源', source || '--')}
    ${detailRow('网络', network || '--')}
    ${detailRow('上传', formatBytes(connection.uploadBytes))}
    ${detailRow('下载', formatBytes(connection.downloadBytes))}
    ${detailRow('开始时间', formatTime(connection.startedAt))}
    ${detailRow('已持续', formatDuration(connection.startedAt))}
    ${detailRow('连接 ID', connection.id || '--')}
  </div>`;
};

export const createConnectionsController = () => {
  const tbody = document.querySelector('#connections-tbody');
  const emptyEl = document.querySelector('#connections-empty');
  const errorEl = document.querySelector('#connections-error');
  const countEl = document.querySelector('#connections-count');
  const statusText = document.querySelector('#connections-status-text');
  const statusDot = document.querySelector('#connections-status .status-indicator');
  const searchInput = document.querySelector('#connections-search');
  const searchClear = document.querySelector('#connections-search-clear');
  const refreshBtn = document.querySelector('#connections-refresh');
  const detailOverlay = document.querySelector('#connection-detail-overlay');
  const detailBody = document.querySelector('#connection-detail-body');
  const detailCloseBtn = document.querySelector('#connection-detail-close');
  const detailOkBtn = document.querySelector('#connection-detail-ok');

  let poller = null;
  let connections = [];
  let searchKeyword = '';
  let detailConnectionKey = null;
  const connectionByKey = new Map();

  const connectionKey = (connection, index) => connection?.id || `row-${index}`;

  const isDetailOpen = () => detailConnectionKey !== null;

  const syncSelectedRow = () => {
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-connection-key]').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.connectionKey === detailConnectionKey);
    });
  };

  const openConnectionDetail = (key) => {
    detailConnectionKey = key;
    refreshConnectionDetail();
    syncSelectedRow();
    if (detailOverlay) detailOverlay.classList.add('active');
  };

  const closeConnectionDetail = () => {
    detailConnectionKey = null;
    if (detailOverlay) detailOverlay.classList.remove('active');
    syncSelectedRow();
  };

  const refreshConnectionDetail = () => {
    if (!isDetailOpen() || !detailBody) return;
    detailBody.innerHTML = buildConnectionDetailHtml(connectionByKey.get(detailConnectionKey));
  };

  const isViewActive = () => document.getElementById('connections-view')?.classList.contains('active');

  const setStatus = (running) => {
    if (statusText) statusText.textContent = running ? '核心运行中 · 实时刷新' : '等待核心运行';
    if (statusDot) statusDot.classList.toggle('active', !!running);
  };

  const matchesSearch = (connection) => {
    if (!searchKeyword) return true;
    const haystack = [
      connection.host,
      connection.process,
      connection.sourceIP,
      connection.rule,
      connection.rulePayload,
      connection.exitNode,
      ...((connection.resolvedChains || connection.chains) || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(searchKeyword);
  };

  const renderConnections = () => {
    if (!tbody) return;
    const filtered = connections.filter(matchesSearch);
    connectionByKey.clear();

    if (countEl) {
      countEl.textContent = connections.length
        ? `共 ${connections.length} 个连接${filtered.length !== connections.length ? `（筛选出 ${filtered.length} 个）` : ''}`
        : '';
    }

    if (!filtered.length) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      refreshConnectionDetail();
      syncSelectedRow();
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    tbody.innerHTML = filtered.map((connection) => {      const target = connection.destinationPort
        ? `${connection.host || connection.sourceIP || '--'}:${connection.destinationPort}`
        : (connection.host || '--');
      const chains = (connection.resolvedChains || connection.chains || []).filter(Boolean);
      const outbound = connection.exitNode || chains[chains.length - 1] || '--';
      const rule = [connection.rule, connection.rulePayload].filter(Boolean).join(' ') || '--';
      const key = connectionKey(connection, connections.indexOf(connection));
      connectionByKey.set(key, connection);
      const exitClass = getExitNodeClass(connection.exitNode);
      return `<tr data-connection-key="${escapeHtml(key)}" tabindex="0" title="点击查看连接详情">
        <td title="${escapeHtml(connection.host || '')}">${escapeHtml(target)}</td>
        <td class="cell-muted">${escapeHtml(connection.process || '--')}</td>
        <td class="cell-muted">${escapeHtml([connection.network, connection.type].filter(Boolean).join(' / ') || '--')}</td>
        <td${exitClass ? ` class="${exitClass}"` : ''} title="${escapeHtml(chains.join(' → '))}">${escapeHtml(outbound)}</td>
        <td class="cell-muted">${escapeHtml(rule)}</td>
        <td>${escapeHtml(formatBytes(connection.uploadBytes))}</td>
        <td>${escapeHtml(formatBytes(connection.downloadBytes))}</td>
        <td class="cell-muted">${escapeHtml(formatTime(connection.startedAt))}</td>
      </tr>`;
    }).join('');
    refreshConnectionDetail();
    syncSelectedRow();
  };

  const loadConnections = async () => {
    try {
      const payload = await requestJson('/api/core/connections');
      connections = Array.isArray(payload.connections) ? payload.connections : [];
      setStatus(payload.core?.status === 'running');
      if (errorEl) errorEl.classList.add('hidden');
      renderConnections();
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = `加载失败: ${error.message}`;
        errorEl.classList.remove('hidden');
      }
      setStatus(false);
    }
  };

  const startConnectionsPolling = () => {
    if (poller) return;
    loadConnections();
    poller = setInterval(() => {
      if (!isViewActive()) {
        stopConnectionsPolling();
        return;
      }
      loadConnections();
    }, POLL_INTERVAL_MS);
  };

  const stopConnectionsPolling = () => {
    if (poller) {
      clearInterval(poller);
      poller = null;
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      searchKeyword = searchInput.value.trim().toLowerCase();
      if (searchClear) searchClear.classList.toggle('hidden', !searchKeyword);
      renderConnections();
    }, 200));
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchKeyword = '';
      searchClear.classList.add('hidden');
      renderConnections();
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadConnections());
  }
  if (tbody) {
    tbody.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-connection-key]');
      if (row) openConnectionDetail(row.dataset.connectionKey);
    });
    tbody.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('tr[data-connection-key]');
      if (row) {
        event.preventDefault();
        openConnectionDetail(row.dataset.connectionKey);
      }
    });
  }
  if (detailOverlay) {
    detailOverlay.addEventListener('click', (event) => {
      if (event.target === detailOverlay) closeConnectionDetail();
    });
  }
  if (detailCloseBtn) detailCloseBtn.addEventListener('click', closeConnectionDetail);
  if (detailOkBtn) detailOkBtn.addEventListener('click', closeConnectionDetail);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isDetailOpen()) closeConnectionDetail();
  });

  return {
    loadConnections,
    startConnectionsPolling,
    stopConnectionsPolling
  };
};
