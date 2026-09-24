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

  let poller = null;
  let connections = [];
  let searchKeyword = '';

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

    if (countEl) {
      countEl.textContent = connections.length
        ? `共 ${connections.length} 个连接${filtered.length !== connections.length ? `（筛选出 ${filtered.length} 个）` : ''}`
        : '';
    }

    if (!filtered.length) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    tbody.innerHTML = filtered.map((connection) => {
      const target = connection.destinationPort
        ? `${connection.host || connection.sourceIP || '--'}:${connection.destinationPort}`
        : (connection.host || '--');
      const chains = (connection.resolvedChains || connection.chains || []).filter(Boolean);
      const outbound = connection.exitNode || chains[chains.length - 1] || '--';
      const rule = [connection.rule, connection.rulePayload].filter(Boolean).join(' ') || '--';
      return `<tr>
        <td title="${escapeHtml(connection.host || '')}">${escapeHtml(target)}</td>
        <td>${escapeHtml(connection.process || '--')}</td>
        <td>${escapeHtml([connection.network, connection.type].filter(Boolean).join(' / ') || '--')}</td>
        <td title="${escapeHtml(chains.join(' → '))}">${escapeHtml(outbound)}</td>
        <td>${escapeHtml(rule)}</td>
        <td>${escapeHtml(formatBytes(connection.uploadBytes))}</td>
        <td>${escapeHtml(formatBytes(connection.downloadBytes))}</td>
        <td>${escapeHtml(formatTime(connection.startedAt))}</td>
      </tr>`;
    }).join('');
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

  return {
    loadConnections,
    startConnectionsPolling,
    stopConnectionsPolling
  };
};
