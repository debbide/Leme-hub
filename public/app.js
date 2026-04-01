const nodesList = document.querySelector('#nodes-list');
const nodesTbody = document.querySelector('#nodes-tbody');
const nodesState = document.querySelector('#nodes-state');
const nodesLoading = document.querySelector('#nodes-loading');
const nodesEmpty = document.querySelector('#nodes-empty');
const nodesError = document.querySelector('#nodes-error');

const showImportBtn = document.querySelector('#show-import');
const showSyncBtn = document.querySelector('#show-sync');
const manualAddBtn = document.querySelector('#manual-add');
const testAllBtn = document.querySelector('#test-all');
const closePanelBtn = document.querySelector('#close-panel');
const saveRestartBtn = document.querySelector('#save-restart-core');

const importForm = document.querySelector('#import-form');
const syncForm = document.querySelector('#sync-form');
const importUrlInput = document.querySelector('#import-url');
const syncUrlInput = document.querySelector('#sync-url');
const nodeCountLabel = document.querySelector('#node-count-label');
const toastContainer = document.querySelector('#toast-container');
const coreStatusIndicator = document.querySelector('#core-status-indicator');
const systemProxyModeSelect = document.querySelector('.system-proxy-mode');
const dashActiveNodeSelect = document.querySelector('#dash-active-node-select');
const dashUptime = document.querySelector('#dash-uptime');
const dashDefaultProxy = document.querySelector('#dash-default-proxy');
const dashHttpProxy = document.querySelector('#dash-http-proxy');
const dashHttpNote = document.querySelector('#dash-http-note');
const dashGeoIpStatus = document.querySelector('#dash-geoip-status');
const dashGeoIpNote = document.querySelector('#dash-geoip-note');
const geoIpRefreshBtn = document.querySelector('#geoip-refresh-btn');
const autoStartToggle = document.querySelector('#auto-start-toggle');

let currentCoreState = null;
let uptimeTimer = null;
let geoIpStatus = null;

const flagFromCountryCode = (countryCode) => {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) {
    return null;
  }

  return String.fromCodePoint(...[...normalized].map((char) => 0x1F1E6 + char.charCodeAt(0) - 65));
};

const renderGeoIpStatus = (status = geoIpStatus) => {
  geoIpStatus = status || null;
  if (!dashGeoIpStatus || !dashGeoIpNote) return;

  if (!geoIpStatus) {
    dashGeoIpStatus.textContent = '未初始化';
    dashGeoIpNote.textContent = 'GeoIP 状态尚未返回';
    if (geoIpRefreshBtn) geoIpRefreshBtn.disabled = false;
    return;
  }

  if (geoIpStatus.pending) {
    dashGeoIpStatus.textContent = '下载中';
    dashGeoIpNote.textContent = '正在后台准备国家库，完成后刷新节点列表即可显示国旗';
  } else if (geoIpStatus.ready) {
    dashGeoIpStatus.textContent = '已就绪';
    dashGeoIpNote.textContent = geoIpStatus.downloadedAt
      ? `本地国家库可用，上次更新时间 ${new Date(geoIpStatus.downloadedAt).toLocaleString('zh-CN')}`
      : '本地国家库可用';
  } else if (geoIpStatus.lastError) {
    dashGeoIpStatus.textContent = '下载失败';
    dashGeoIpNote.textContent = `GeoIP 下载失败：${geoIpStatus.lastError}`;
  } else {
    dashGeoIpStatus.textContent = '等待下载';
    dashGeoIpNote.textContent = '首次启动会在后台自动下载国家库';
  }

  if (geoIpRefreshBtn) {
    geoIpRefreshBtn.disabled = Boolean(geoIpStatus.pending);
    geoIpRefreshBtn.textContent = geoIpStatus.pending ? 'GeoIP 下载中...' : '刷新 GeoIP';
  }
};

const renderSystemProxyNodeOptions = (nodes, activeNodeId) => {
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

// Restart warning state
let isRestartRequired = false;
const updateRestartWarning = (required) => {
  if (required === undefined) return;
  isRestartRequired = required;
  if (isRestartRequired) {
    saveRestartBtn.classList.add('pulse-warning');
    saveRestartBtn.textContent = '保存并重启代理器 (需重启)';
  } else {
    saveRestartBtn.classList.remove('pulse-warning');
    saveRestartBtn.textContent = '保存并重启代理器';
  }
};

const syncNodeMutationFeedback = (payload, successMessage) => {
  if (payload.core) {
    updateCoreStatus(payload.core);
  }

  if (payload.autoRestarted) {
    updateRestartWarning(false);
    showToast('节点变更已自动应用到核心', 'success');
    return;
  }

  updateRestartWarning(payload.restartRequired);
  if (successMessage) {
    showToast(successMessage, 'success');
  }
};

const renderProxyEndpoints = (proxyProfile = {}) => {
  const listenHost = proxyProfile.listenHost || '127.0.0.1';
  const defaultEndpoint = proxyProfile.systemDefaultEndpoint || {
    protocol: 'http',
    host: listenHost,
    port: proxyProfile.unifiedHttpPort || 20101,
    url: `http://${listenHost}:${proxyProfile.unifiedHttpPort || 20101}`
  };
  const httpEndpoint = proxyProfile.systemSocksEndpoint || proxyProfile.httpCompatibilityEndpoint || {
    protocol: 'socks5',
    host: listenHost,
    port: proxyProfile.unifiedSocksPort || 20100,
    url: `socks5://${listenHost}:${proxyProfile.unifiedSocksPort || 20100}`
  };

  if (dashDefaultProxy) {
    dashDefaultProxy.textContent = defaultEndpoint.url;
  }

  if (dashHttpProxy) {
    dashHttpProxy.textContent = httpEndpoint.url;
  }

  if (dashHttpNote) {
    dashHttpNote.textContent = '用于手动代理、分流和兼容 SOCKS5 的客户端';
  }
};

const updateCoreStatus = (core) => {
  if (!core) return;
  currentCoreState = core;
  coreStatusIndicator.className = 'status-dot tooltip';
  const dashSwitch = document.getElementById('master-switch');
  const dashText = document.getElementById('master-status-text');
  const systemProxy = core.systemProxy || {};
  const proxyProfile = core.proxy || {};
  const activeNode = proxyProfile.activeNode;

  renderProxyEndpoints(proxyProfile);

  if (systemProxyModeSelect && proxyProfile.mode) {
    systemProxyModeSelect.value = proxyProfile.mode;
  }

  if (dashActiveNodeSelect) {
    dashActiveNodeSelect.value = proxyProfile.activeNodeId || '';
  }

  // Update auto-start toggle if settings are available in the broader scope or passed core
  if (autoStartToggle && core.settings) {
    autoStartToggle.checked = !!core.settings.autoStart;
  } else if (autoStartToggle && currentCoreState?.settings) {
     autoStartToggle.checked = !!currentCoreState.settings.autoStart;
  }

  if (uptimeTimer) {
    clearInterval(uptimeTimer);
    uptimeTimer = null;
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
    uptimeTimer = setInterval(renderUptime, 1000);
  }

  if (core.status === 'running' && systemProxy.enabled) {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if(dashSwitch) {
      dashSwitch.classList.remove('off');
      dashSwitch.classList.add('on');
      dashText.textContent = '系统代理接管中';
    }
  } else if (core.status === 'running') {
    coreStatusIndicator.classList.add('running');
    coreStatusIndicator.title = '运行中';
    if (dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '核心运行中，系统代理未接管';
    }
  } else if (core.status === 'crashed') {
    coreStatusIndicator.classList.add('crashed');
    coreStatusIndicator.title = '多次崩溃，需手动重启';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎已崩溃，请手动重启';
    }
  } else if (core.status === 'error') {
    coreStatusIndicator.classList.add('error');
    coreStatusIndicator.title = '异常终止';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = '引擎运行异常';
    }
  } else {
    coreStatusIndicator.classList.add('stopped');
    coreStatusIndicator.title = systemProxy.enabled ? '核心已停止，检测到外部系统代理' : '已停止';
    if(dashSwitch) {
      dashSwitch.classList.remove('on');
      dashSwitch.classList.add('off');
      dashText.textContent = systemProxy.enabled ? '核心已停止，系统代理仍被外部占用' : '系统代理已关闭';
    }
  }
};

// Modal Elements
const editModal = document.querySelector('#edit-modal');
const editJsonInput = document.querySelector('#edit-json-input');
const saveNodeBtn = document.querySelector('#save-node-btn');
const closeModalBtns = document.querySelectorAll('#close-modal-top, .cancel-modal-btn');
let currentEditNodeId = null;

window.showToast = (message, type = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => {
      if (toast.parentNode) toast.remove();
    });
  }, 3000);
};

let nodesData = [];
let groupsData = [];
let nodeSearchQuery = '';
let selectedNodeIds = new Set();
let currentGroup = null;

const groupTabsEl = document.querySelector('#group-tabs');
const addGroupBtn = document.querySelector('#add-group-btn');

const renderGroupTabs = () => {
  if (!groupTabsEl) return;
  // Merge stored groups with groups derived from nodes (preserve order, no duplicates)
  const nodeGroups = nodesData.map(n => n.group).filter(Boolean);
  const allGroups = [...new Set([...groupsData, ...nodeGroups])];
  const hasUngrouped = nodesData.some(n => !n.group);

  const tabs = [
    { key: null, label: '全部', count: nodesData.length }
  ];
  for (const g of allGroups) {
    tabs.push({ key: g, label: g, count: nodesData.filter(n => n.group === g).length, renameable: true });
  }
  if (hasUngrouped) {
    tabs.push({ key: '__ungrouped__', label: '未分组', count: nodesData.filter(n => !n.group).length });
  }

  groupTabsEl.innerHTML = tabs.map(t => {
    const isActive = activeGroupTab === t.key;
    const actions = t.renameable ? `<span class="group-tab-actions">
      <button class="group-tab-action-btn group-rename-btn" data-group="${t.key}" title="重命名">✎</button>
      <button class="group-tab-action-btn group-delete-btn" data-group="${t.key}" title="删除">✕</button>
    </span>` : '';
    return `<button type="button" class="group-tab${isActive ? ' active' : ''}" data-key="${t.key ?? ''}">${t.label}<span class="group-tab-count">${t.count}</span>${actions}</button>`;
  }).join('');

  // Tab 切换
  groupTabsEl.querySelectorAll('.group-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.group-tab-actions')) return;
      const key = btn.dataset.key === '' ? null : btn.dataset.key;
      activeGroupTab = key;
      currentGroup = key === null || key === '__ungrouped__' ? null : key;
      renderGroupTabs();
      renderNodesElement();
    });
  });

  // 重命名
  groupTabsEl.querySelectorAll('.group-rename-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const oldName = btn.dataset.group;
      const newName = await showInputModal(`重命名分组 "${oldName}"`, oldName);
      if (!newName || newName.trim() === oldName) return;
      try {
        await requestJson('/api/groups/rename', { method: 'PUT', body: JSON.stringify({ from: oldName, to: newName.trim() }) });
        if (activeGroupTab === oldName) { activeGroupTab = newName.trim(); currentGroup = newName.trim(); }
        showToast('分组已重命名', 'success');
        loadNodes();
      } catch (err) { showToast(`重命名失败: ${err.message}`, 'error'); }
    });
  });

  // 删除
  groupTabsEl.querySelectorAll('.group-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.group;
      if (!await showConfirmModal(`删除分组 "${name}"`, '该分组下的所有节点将移入未分组。')) return;
      try {
        await requestJson('/api/groups', { method: 'DELETE', body: JSON.stringify({ name }) });
        if (activeGroupTab === name) { activeGroupTab = null; currentGroup = null; }
        showToast('分组已删除', 'success');
        loadNodes();
      } catch (err) { showToast(`删除失败: ${err.message}`, 'error'); }
    });
  });
};

addGroupBtn?.addEventListener('click', async () => {
  const name = await showInputModal('新建分组名称');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  try {
    const payload = await requestJson('/api/groups', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
    groupsData = payload.groups || groupsData;
    activeGroupTab = trimmed;
    currentGroup = trimmed;
    renderGroupTabs();
  } catch (error) {
    showToast(`创建分组失败: ${error.message}`, 'error');
  }
});

const showInlineMessage = (target, message, tone = '') => {
  target.textContent = message;
  target.className = tone ? `state-msg ${tone}` : 'state-msg';
  target.classList.remove('hidden');
};

const showConfirmModal = (title, body) => new Promise((resolve) => {
  const overlay = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-body').textContent = body;
  overlay.classList.add('active');
  const finish = (val) => {
    overlay.classList.remove('active');
    document.getElementById('confirm-modal-ok').replaceWith(document.getElementById('confirm-modal-ok').cloneNode(true));
    document.getElementById('confirm-modal-cancel').replaceWith(document.getElementById('confirm-modal-cancel').cloneNode(true));
    resolve(val);
  };
  document.getElementById('confirm-modal-ok').addEventListener('click', () => finish(true));
  document.getElementById('confirm-modal-cancel').addEventListener('click', () => finish(false));
});

const showInputModal = (title, defaultValue = '') => new Promise((resolve) => {
  const overlay = document.getElementById('input-modal');
  const titleEl = document.getElementById('input-modal-title');
  const field = document.getElementById('input-modal-field');
  const confirmBtn = document.getElementById('input-modal-confirm');
  const cancelBtn = document.getElementById('input-modal-cancel');
  const closeBtn = document.getElementById('input-modal-close');

  titleEl.textContent = title;
  field.value = defaultValue;
  overlay.classList.add('active');
  setTimeout(() => { field.focus(); field.select(); }, 50);

  const finish = (value) => {
    overlay.classList.remove('active');
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    closeBtn.replaceWith(closeBtn.cloneNode(true));
    resolve(value);
  };

  document.getElementById('input-modal-confirm').addEventListener('click', () => finish(field.value));
  document.getElementById('input-modal-cancel').addEventListener('click', () => finish(null));
  document.getElementById('input-modal-close').addEventListener('click', () => finish(null));
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(field.value); if (e.key === 'Escape') finish(null); }, { once: true });
});

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body;
};

// Obscure IP to match the screenshot design pattern
const maskAddress = (address) => {
  if (!address) return '未知地址';
  const parts = address.split('.');
  if (parts.length === 4 && !parts.some(isNaN)) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (address.length > 8) {
    return address.substring(0, 4) + '***' + address.substring(address.length - 4);
  }
  return address;
};

// 当前激活的分组 Tab，null = 全部
let activeGroupTab = null;

const renderNodeRow = (node, activeNodeId) => {
  const protText = (node.type || 'SOCKS').toUpperCase();
  const transText = (node.transport || 'tcp').toLowerCase();
  let secText = '-';
  if (node.security && node.security !== 'none') secText = node.security.toLowerCase();
  else if (node.tls) secText = 'tls';
  const maskedIp = maskAddress(node.server);
  const localPortStr = node.localPort ? node.localPort : (node.port || '未知');
  const isActive = node.id === activeNodeId;
  const activeClass = isActive ? 'active-row' : '';
  const activeBadge = isActive ? `<span class="pill pill-active"><i class="ph ph-lightning"></i> 此刻生效</span>` : '';
  const allGroups = [...new Set([...groupsData, ...nodesData.map(n => n.group).filter(Boolean)])];
  const flagEmoji = node.flagEmoji || flagFromCountryCode(node.countryCode);
  const flagTitle = node.countryName || node.countryCode || 'GeoIP 数据准备中';
  const groupMenuItems = [
    `<div class="group-menu-item${!node.group ? ' active' : ''}" data-group="">未分组</div>`,
    ...allGroups.map(g => `<div class="group-menu-item${node.group === g ? ' active' : ''}" data-group="${g}">${g}</div>`)
  ].join('');
  return `
    <tr data-id="${node.id}" class="node-row ${activeClass}">
      <td class="node-check-cell"><input type="checkbox" class="node-checkbox" data-id="${node.id}"></td>
      <td><span class="pill pill-protocol">${protText}</span>${activeBadge}</td>
      <td>
        <div class="node-info">
          <div class="node-primary-line">
            <span class="node-flag${flagEmoji ? '' : ' is-placeholder'}" title="${flagTitle}">${flagEmoji || '---'}</span>
            <span class="node-name">${node.name || '未命名节点'}</span>
          </div>
          <span class="node-ip">${maskedIp}</span>
          <span class="node-port">本地出口: ${localPortStr}</span>
        </div>
      </td>
      <td>
        <span class="pill pill-dark">${transText}</span>
        <span class="pill pill-dark">${secText}</span>
      </td>
      <td><span class="latency" id="test-result-${node.id}">-</span></td>
      <td class="row-actions-cell">
        <div class="row-actions">
          <button type="button" class="row-action-btn share-node-btn" data-id="${node.id}" title="复制代理链接"><i class="ph ph-share-network"></i></button>
          <button type="button" class="row-action-btn test-node-btn" data-id="${node.id}" title="测试延迟"><i class="ph ph-activity"></i></button>
          <button type="button" class="row-action-btn detail-node-btn" data-id="${node.id}" title="编辑详情"><i class="ph ph-pencil-simple"></i></button>
          <div class="move-group-wrap" data-id="${node.id}">
            <button type="button" class="row-action-btn move-group-btn" data-id="${node.id}" title="移至分组"><i class="ph ph-folder-simple-arrow"></i></button>
            <div class="group-menu">${groupMenuItems}</div>
          </div>
          <button type="button" class="row-action-btn btn-danger-icon delete-node-btn" data-id="${node.id}" title="删除"><i class="ph ph-trash"></i></button>
        </div>
      </td>
    </tr>`;
};

const copyNodeShareLink = async (id) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node?.shareLink) {
    showToast('该节点暂不支持分享链接', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(node.shareLink);
    showToast('代理链接已复制', 'success');
  } catch (error) {
    showToast(`复制失败: ${error.message || '请检查剪贴板权限'}`, 'error');
  }
};

const renderNodesElement = () => {
  const nodesGroupEmpty = document.querySelector('#nodes-group-empty');
  const nodesSearchEmpty = document.querySelector('#nodes-search-empty');

  nodesLoading.classList.add('hidden');
  nodesError.classList.add('hidden');
  nodesError.textContent = '';
  nodesGroupEmpty?.classList.add('hidden');
  nodesSearchEmpty?.classList.add('hidden');

  if (nodesData.length === 0) {
    nodesState.classList.remove('hidden');
    nodesEmpty.classList.remove('hidden');
    nodesList.classList.add('hidden');
    nodeCountLabel.textContent = `节点数: 0`;
    return;
  }

  nodesEmpty.classList.add('hidden');

  const activeNodeId = currentCoreState?.proxy?.activeNodeId || null;

  // 按当前 Tab 过滤
  let visibleNodes = activeGroupTab === null
    ? nodesData
    : activeGroupTab === '__ungrouped__'
      ? nodesData.filter(n => !n.group)
      : nodesData.filter(n => n.group === activeGroupTab);

  // 搜索过滤
  const q = nodeSearchQuery.toLowerCase();
  if (q) {
    visibleNodes = visibleNodes.filter(n =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.server || '').toLowerCase().includes(q)
    );
  }

  // 空状态
  if (visibleNodes.length === 0) {
    nodesState.classList.remove('hidden');
    nodesList.classList.add('hidden');
    nodeCountLabel.textContent = `节点数: ${nodesData.length}`;
    if (q) {
      nodesSearchEmpty?.classList.remove('hidden');
    } else {
      nodesGroupEmpty?.classList.remove('hidden');
    }
    return;
  }

  nodesState.classList.add('hidden');
  nodesList.classList.remove('hidden');
  nodeCountLabel.textContent = `节点数: ${nodesData.length}（显示 ${visibleNodes.length}）`;

  nodesTbody.innerHTML = visibleNodes.map(n => renderNodeRow(n, activeNodeId)).join('');

  nodesTbody.querySelectorAll('.test-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); testNode(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.share-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); copyNodeShareLink(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.delete-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(btn.dataset.id); });
  });
  nodesTbody.querySelectorAll('.detail-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); });
  });

  nodesTbody.querySelectorAll('.move-group-wrap').forEach(wrap => {
    const menuBtn = wrap.querySelector('.move-group-btn');
    const menu = wrap.querySelector('.group-menu');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.group-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
    menu.querySelectorAll('.group-menu-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        const nodeId = wrap.dataset.id;
        const group = item.dataset.group || null;
        try {
          const payload = await requestJson('/api/nodes/group', {
            method: 'PUT',
            body: JSON.stringify({ nodeIds: [nodeId], group })
          });
          nodesData = payload.nodes;
          groupsData = payload.groups || groupsData;
          renderGroupTabs();
          renderNodesElement();
          showToast('节点已移至分组', 'success');
        } catch (err) {
          showToast(`移动失败: ${err.message}`, 'error');
        }
      });
    });
  });

  const sortTh = document.getElementById('sort-latency-th');
  if (sortTh && !sortTh.dataset.bound) {
    sortTh.dataset.bound = '1';
    sortTh.addEventListener('click', () => {
      const asc = sortTh.dataset.sort !== 'asc';
      sortTh.dataset.sort = asc ? 'asc' : 'desc';
      sortTh.querySelector('.sort-indicator').textContent = asc ? '↑' : '↓';
      const getMs = id => {
        const el = document.getElementById(`test-result-${id}`);
        const v = parseInt(el?.textContent);
        return isNaN(v) ? (asc ? Infinity : -1) : v;
      };
      nodesData = [...nodesData].sort((a, b) => asc ? getMs(a.id) - getMs(b.id) : getMs(b.id) - getMs(a.id));
      renderNodesElement();
    });
  }

  // Checkboxes
  const selectAllCb = document.getElementById('select-all-nodes');
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
    selectAllCb.addEventListener('change', () => {
      document.querySelectorAll('.node-checkbox').forEach(cb => {
        cb.checked = selectAllCb.checked;
        if (selectAllCb.checked) selectedNodeIds.add(cb.dataset.id);
        else selectedNodeIds.delete(cb.dataset.id);
      });
      updateBulkBar();
    });
  }
  nodesTbody.querySelectorAll('.node-checkbox').forEach(cb => {
    cb.checked = selectedNodeIds.has(cb.dataset.id);
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) selectedNodeIds.add(cb.dataset.id);
      else selectedNodeIds.delete(cb.dataset.id);
      const all = nodesTbody.querySelectorAll('.node-checkbox');
      const checked = [...all].filter(c => c.checked).length;
      if (selectAllCb) {
        selectAllCb.checked = checked === all.length;
        selectAllCb.indeterminate = checked > 0 && checked < all.length;
      }
      updateBulkBar();
    });
  });

  nodesTbody.querySelectorAll('.node-row').forEach(row => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.node-check-cell') || e.target.closest('.row-actions')) return;
      const nodeId = row.dataset.id;
      if (currentCoreState?.proxy?.activeNodeId === nodeId) return;
      try {
        await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ activeNodeId: nodeId })
        });
        showToast('节点切换触发，引擎重载中...', 'info');
        loadNodes();
      } catch (err) {
        showToast(`节点切换失败: ${err.message}`, 'error');
      }
    });
  });
};

const loadNodes = async () => {
  nodesState.classList.remove('hidden');
  nodesLoading.classList.remove('hidden');
  nodesEmpty.classList.add('hidden');
  nodesList.classList.add('hidden');
  nodesError.classList.add('hidden');

  try {
    const payload = await requestJson('/api/nodes');
    nodesData = payload.nodes || [];
    groupsData = payload.groups || [];
    geoIpStatus = payload.geoIp || null;
    selectedNodeIds.clear();
    renderGroupTabs();
    renderNodesElement();
    renderGeoIpStatus(payload.geoIp || null);
    updateCoreStatus(payload.core);
    renderSystemProxyNodeOptions(nodesData, payload.core?.proxy?.activeNodeId);
  } catch (error) {
    nodesState.classList.remove('hidden');
    nodesLoading.classList.add('hidden');
    nodesError.classList.remove('hidden');
    nodesError.textContent = `加载节点失败: ${error.message}`;
  }
};

const loadSystemStatus = async () => {
  try {
    const payload = await requestJson('/api/system/status');
    renderGeoIpStatus(payload.geoIp || payload.core?.geoIp || null);
    updateCoreStatus(payload.core);
  } catch (error) {
    showToast(`系统状态加载失败: ${error.message}`, 'error');
  }
};

const refreshGeoIp = async () => {
  if (!geoIpRefreshBtn) return;
  geoIpRefreshBtn.disabled = true;
  geoIpRefreshBtn.textContent = 'GeoIP 下载中...';
  try {
    const payload = await requestJson('/api/system/geoip/refresh', { method: 'POST' });
    renderGeoIpStatus(payload.geoIp || null);
    await loadNodes();
    showToast(payload.geoIp?.ready ? 'GeoIP 数据已刷新' : 'GeoIP 刷新已触发，正在后台准备', 'success');
  } catch (error) {
    renderGeoIpStatus(geoIpStatus);
    showToast(`GeoIP 刷新失败: ${error.message}`, 'error');
  } finally {
    renderGeoIpStatus(geoIpStatus);
  }
};

const importLink = async (e) => {
  e.preventDefault();
  const link = importUrlInput.value.trim();
  if (!link) return;

  const btn = importForm.querySelector('button[type="submit"]');
  btn.textContent = '导入中...';
  btn.disabled = true;

  try {
    const payload = await requestJson('/api/nodes/import-link', {
      method: 'POST',
      body: JSON.stringify({ link, group: currentGroup || undefined })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload, `已导入 ${payload.importedCount || 1} 个节点`);
    importUrlInput.value = '';
    importForm.classList.add('hidden');
  } catch (error) {
    showInlineMessage(nodesError, `导入失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = '确定导入';
    btn.disabled = false;
  }
};

const syncSub = async (e) => {
  e.preventDefault();
  const url = syncUrlInput.value.trim();
  if (!url) return;

  const btn = syncForm.querySelector('button[type="submit"]');
  btn.textContent = '同步中...';
  btn.disabled = true;

  try {
    const payload = await requestJson('/api/subscriptions/sync', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    syncUrlInput.value = '';
    syncForm.classList.add('hidden');
    showInlineMessage(nodesError, `已从订阅导入 ${payload.importedCount} 个节点。${payload.autoRestarted ? ' 已自动应用。' : ''}`, 'success');
  } catch (error) {
    showInlineMessage(nodesError, `同步失败: ${error.message}`, 'error');
  } finally {
    btn.textContent = '开始同步';
    btn.disabled = false;
  }
};

const deleteNode = async (id) => {
  if (!confirm('确定要删除此节点吗？')) return;
  try {
    const payload = await requestJson('/api/nodes', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload, '节点已删除');
  } catch (error) {
    showInlineMessage(nodesError, `删除失败: ${error.message}`, 'error');
  }
};

const applyLatencyResult = (result) => {
  const resultEl = document.querySelector(`#test-result-${result.id}`);
  if (!resultEl) return;

  resultEl.className = 'latency';
  if (result.ok) {
    resultEl.textContent = `${result.latencyMs}ms`;
    resultEl.classList.add(result.latencyMs < 150 ? 'good' : (result.latencyMs < 400 ? 'warn' : 'bad'));
    return;
  }

  resultEl.textContent = '失败';
  resultEl.classList.add('error');
  resultEl.title = result.error || '测试失败';
};

const resetLatencyPlaceholders = (ids) => {
  ids.forEach((id) => {
    const resultEl = document.querySelector(`#test-result-${id}`);
    if (!resultEl) return;
    resultEl.textContent = '-';
    resultEl.className = 'latency';
    resultEl.title = '';
  });
};

const testNode = async (id) => {
  const resultEl = document.querySelector(`#test-result-${id}`);
  if (!resultEl) return;
  resultEl.textContent = '测试中...';
  resultEl.className = 'latency';

  try {
    const payload = await requestJson('/api/nodes/test', {
      method: 'POST',
      body: JSON.stringify({ id })
    });

    if (payload.core) {
      updateCoreStatus(payload.core);
    }
    if (payload.autoStarted) {
      showToast('已自动启动核心并完成延迟测试', 'success');
    }

    applyLatencyResult({ id, ok: true, latencyMs: payload.latencyMs });
  } catch (error) {
    applyLatencyResult({ id, ok: false, error: error.message || '未知错误' });
    showToast(`延迟测试失败: ${error.message || '未知错误'}`, 'error');
  }
};

const updateBulkBar = () => {
  const bar = document.getElementById('bulk-action-bar');
  const label = document.getElementById('bulk-count-label');
  if (!bar) return;
  if (selectedNodeIds.size === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  label.textContent = `已选 ${selectedNodeIds.size} 个节点`;
  const menu = document.getElementById('bulk-group-menu');
  if (menu) {
    const allGroups = [...new Set([...groupsData, ...nodesData.map(n => n.group).filter(Boolean)])];
    menu.innerHTML = [
      `<div class="group-menu-item" data-group="">未分组</div>`,
      ...allGroups.map(g => `<div class="group-menu-item" data-group="${g}">${g}</div>`)
    ].join('');
    menu.querySelectorAll('.group-menu-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        const group = item.dataset.group || null;
        try {
          const payload = await requestJson('/api/nodes/group', {
            method: 'PUT',
            body: JSON.stringify({ nodeIds: [...selectedNodeIds], group })
          });
          nodesData = payload.nodes;
          groupsData = payload.groups || groupsData;
          selectedNodeIds.clear();
          renderGroupTabs();
          renderNodesElement();
          showToast('批量移至分组完成', 'success');
        } catch (err) { showToast(`移动失败: ${err.message}`, 'error'); }
      });
    });
  }
};

const testAllNodes = async () => {
  let targetNodes = activeGroupTab === null
    ? nodesData
    : activeGroupTab === '__ungrouped__'
      ? nodesData.filter(n => !n.group)
      : nodesData.filter(n => n.group === activeGroupTab);
  if (nodeSearchQuery) {
    const q = nodeSearchQuery.toLowerCase();
    targetNodes = targetNodes.filter(n =>
      (n.name || '').toLowerCase().includes(q) || (n.server || '').toLowerCase().includes(q)
    );
  }
  if (!targetNodes.length) {
    showToast('暂无可测试节点', 'info');
    return;
  }

  if (testAllBtn) {
    testAllBtn.disabled = true;
    testAllBtn.textContent = `测试 0/${targetNodes.length}...`;
  }

  targetNodes.forEach((node) => {
    const resultEl = document.querySelector(`#test-result-${node.id}`);
    if (resultEl) { resultEl.textContent = '测试中...'; resultEl.className = 'latency'; resultEl.title = ''; }
  });

  try {
    const payload = await requestJson('/api/nodes/test-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: targetNodes.map((node) => node.id) })
    });

    if (payload.core) updateCoreStatus(payload.core);

    let done = 0;
    payload.results.forEach(r => {
      applyLatencyResult(r);
      done++;
      if (testAllBtn) testAllBtn.textContent = `测试 ${done}/${targetNodes.length}...`;
    });

    const successCount = payload.results.filter((r) => r.ok).length;
    const failedCount = payload.results.length - successCount;
    const autoStartText = payload.autoStarted ? '，并已自动启动核心' : '';
    showToast(`批量测试完成：成功 ${successCount}，失败 ${failedCount}${autoStartText}`, failedCount ? 'info' : 'success');
  } catch (error) {
    resetLatencyPlaceholders(targetNodes.map((node) => node.id));
    showToast(`批量测试失败: ${error.message}`, 'error');
  } finally {
    if (testAllBtn) {
      testAllBtn.disabled = false;
      testAllBtn.textContent = '批量测试';
    }
  }
};

const runCoreAction = async (action) => {
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

showImportBtn?.addEventListener('click', () => {
  importForm.classList.toggle('hidden');
  syncForm.classList.add('hidden');
  if (!importForm.classList.contains('hidden')) importUrlInput.focus();
});

testAllBtn?.addEventListener('click', testAllNodes);

// Bulk action bar
document.getElementById('bulk-move-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('bulk-group-menu');
  if (menu) menu.classList.toggle('open');
});

document.getElementById('bulk-delete-btn')?.addEventListener('click', async () => {
  if (!selectedNodeIds.size) return;
  if (!await showConfirmModal(`删除 ${selectedNodeIds.size} 个节点`, '此操作不可撤销，确认删除所选节点？')) return;
  try {
    await Promise.all([...selectedNodeIds].map(id =>
      requestJson('/api/nodes', { method: 'DELETE', body: JSON.stringify({ id }) })
    ));
    selectedNodeIds.clear();
    await loadNodes();
    showToast('批量删除完成', 'success');
  } catch (err) { showToast(`删除失败: ${err.message}`, 'error'); }
});

document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => {
  selectedNodeIds.clear();
  renderNodesElement();
  updateBulkBar();
});

const nodeSearchInput = document.querySelector('#node-search');
nodeSearchInput?.addEventListener('input', (e) => {
  nodeSearchQuery = e.target.value.trim();
  if (nodeSearchQuery && activeGroupTab !== null) {
    activeGroupTab = null;
    currentGroup = null;
    renderGroupTabs();
  }
  renderNodesElement();
});

showSyncBtn?.addEventListener('click', () => {
  syncForm.classList.toggle('hidden');
  importForm.classList.add('hidden');
  if (!syncForm.classList.contains('hidden')) syncUrlInput.focus();
});

manualAddBtn?.addEventListener('click', () => {
  currentEditNodeId = null;
  const skeleton = {
    type: "vless",
    server: "",
    port: 443,
    uuid: "",
    transport: "tcp",
    security: "none"
  };
  editJsonInput.value = JSON.stringify(skeleton, null, 2);
  const groupInput = document.querySelector('#edit-node-group');
  if (groupInput) groupInput.value = currentGroup || '';
  editModal.classList.add('active');
});

closePanelBtn?.addEventListener('click', () => {
  window.close();
  showToast('即将关闭面板...', 'info');
});

document.querySelectorAll('.cancel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    importForm.classList.add('hidden');
    syncForm.classList.add('hidden');
  });
});

importForm?.addEventListener('submit', importLink);
syncForm?.addEventListener('submit', syncSub);

// Modal logic
const closeModal = () => {
  editModal.classList.remove('active');
  currentEditNodeId = null;
  editJsonInput.value = '';
  const groupInput = document.querySelector('#edit-node-group');
  if (groupInput) groupInput.value = '';
};

closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

const editNodeGroupInput = document.querySelector('#edit-node-group');

const openEditModal = (id) => {
  const node = nodesData.find(n => n.id === id);
  if (!node) return;
  currentEditNodeId = id;
  const editData = { ...node };
  if (editNodeGroupInput) editNodeGroupInput.value = node.group || '';
  editJsonInput.value = JSON.stringify(editData, null, 2);
  editModal.classList.add('active');
};

saveNodeBtn?.addEventListener('click', async () => {
  saveNodeBtn.textContent = '保存中...';
  saveNodeBtn.disabled = true;
  
  try {
    const updatedData = JSON.parse(editJsonInput.value);
    const groupValue = editNodeGroupInput ? editNodeGroupInput.value.trim() || null : undefined;
    if (groupValue !== undefined) updatedData.group = groupValue;

    let path = '/api/nodes';
    let method = 'PUT';

    // Create Mode
    if (!currentEditNodeId) {
      path = '/api/nodes/raw';
      method = 'POST';
    } else {
      updatedData.id = currentEditNodeId;
    }
    
    const payload = await requestJson(path, {
      method,
      body: JSON.stringify(updatedData)
    });
    
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    closeModal();
    if (!payload.autoRestarted) {
      showToast(currentEditNodeId ? '节点配置已更新。' : '节点已手动添加。', 'success');
    }
  } catch (err) {
    showToast(`保存失败: ${err.message}`, 'error');
  } finally {
    saveNodeBtn.textContent = '保存设置';
    saveNodeBtn.disabled = false;
  }
});

saveRestartBtn?.addEventListener('click', () => {
  runCoreAction('restart');
});

// --- TAURI SHELL ROUTER LOGIC ---
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    btn.classList.add('active');
    
    views.forEach(v => v.classList.remove('active'));
    const targetId = btn.getAttribute('data-target');
    const targetView = document.getElementById(targetId);
    if (targetView) targetView.classList.add('active');
  });
});

// --- DASHBOARD MASTER SWITCH LOGIC ---
const masterSwitch = document.getElementById('master-switch');
const masterStatusText = document.getElementById('master-status-text');

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
        masterStatusText.textContent = '系统代理已关闭';
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
        masterStatusText.textContent = '系统代理接管中';
        showToast('系统代理已启动', 'success');
      }
      await loadNodes();
      await loadSystemStatus();
    } catch (err) {
      showToast(`操作失败: ${err.message}`, 'error');
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
      showToast(payload.autoRestarted ? '代理模式已更新并自动应用' : '代理模式已更新', 'success');
    } catch (error) {
      showToast(`模式更新失败: ${error.message}`, 'error');
      if (currentCoreState?.proxy?.mode) {
        systemProxyModeSelect.value = currentCoreState.proxy.mode;
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
      // In some responses, core is top-level, in others it's nested
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
      if (currentCoreState?.proxy?.activeNodeId !== undefined) {
        dashActiveNodeSelect.value = currentCoreState.proxy.activeNodeId || '';
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
      // Revert UI state on failure
      event.target.checked = !isEnabled;
    }
  });
}

geoIpRefreshBtn?.addEventListener('click', refreshGeoIp);

// Window Titlebar Mocks
document.getElementById('titlebar-close')?.addEventListener('click', () => {
  showToast('Tauri 退出指令正在开发中...', 'info');
});

// Close group menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.group-menu.open').forEach(m => m.classList.remove('open'));
});

// Init
loadNodes();
loadSystemStatus();
