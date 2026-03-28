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
const autoStartToggle = document.querySelector('#auto-start-toggle');

let currentCoreState = null;
let uptimeTimer = null;

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

const updateCoreStatus = (core) => {
  if (!core) return;
  currentCoreState = core;
  coreStatusIndicator.className = 'status-dot tooltip';
  const dashSwitch = document.getElementById('master-switch');
  const dashText = document.getElementById('master-status-text');
  const systemProxy = core.systemProxy || {};
  const proxyProfile = core.proxy || {};
  const activeNode = proxyProfile.activeNode;

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

const showInlineMessage = (target, message, tone = '') => {
  target.textContent = message;
  target.className = tone ? `state-msg ${tone}` : 'state-msg';
  target.classList.remove('hidden');
};

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

const renderNodesElement = () => {
  nodesLoading.classList.add('hidden');
  nodesError.classList.add('hidden');
  nodesError.textContent = '';
  
  if (nodesData.length === 0) {
    nodesState.classList.remove('hidden');
    nodesEmpty.classList.remove('hidden');
    nodesList.classList.add('hidden');
    nodeCountLabel.textContent = `节点数: 0`;
    return;
  }

  nodesState.classList.add('hidden');
  nodesEmpty.classList.add('hidden');
  nodesList.classList.remove('hidden');
  nodeCountLabel.textContent = `节点数: ${nodesData.length}`;

  const activeNodeId = currentCoreState?.proxy?.activeNodeId || null;

  nodesTbody.innerHTML = nodesData.map(node => {
    // Determine security and transport pills
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

    return `
      <tr data-id="${node.id}" class="node-row ${activeClass}">
        <td>
          <span class="pill pill-protocol">${protText}</span>${activeBadge}
        </td>
        <td>
          <div class="node-info">
            <span class="node-name">${node.name || '未命名节点'}</span>
            <span class="node-ip">${maskedIp}</span>
            <span class="node-port">本地出口: ${localPortStr}</span>
          </div>
        </td>
        <td>
          <span class="pill pill-dark">${transText}</span>
          <span class="pill pill-dark">${secText}</span>
        </td>
        <td>
          <span class="latency" id="test-result-${node.id}">-</span>
        </td>
        <td style="text-align: right;">
          <div class="btn-group" style="justify-content: flex-end;">
            <button type="button" class="test-node-btn" data-id="${node.id}">测试</button>
            <button type="button" class="detail-node-btn" data-id="${node.id}">详情</button>
            <button type="button" class="btn-danger delete-node-btn" data-id="${node.id}">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.test-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); testNode(e.target.dataset.id); });
  });
  document.querySelectorAll('.delete-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(e.target.dataset.id); });
  });
  document.querySelectorAll('.detail-node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(e.target.dataset.id); });
  });

  // Seamless Row Click
  document.querySelectorAll('.node-row').forEach(row => {
    row.addEventListener('click', async () => {
      const nodeId = row.dataset.id;
      if (currentCoreState?.proxy?.activeNodeId === nodeId) return; // Already active
      
      try {
        await requestJson('/api/system/settings', {
          method: 'PUT',
          body: JSON.stringify({ activeNodeId: nodeId })
        });
        showToast('节点切换触发，引擎重载中...', 'info');
        loadNodes(); // refresh state globally
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
    renderNodesElement();
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
    updateCoreStatus(payload.core);
  } catch (error) {
    showToast(`系统状态加载失败: ${error.message}`, 'error');
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
      body: JSON.stringify({ link })
    });
    nodesData = payload.nodes;
    renderNodesElement();
    syncNodeMutationFeedback(payload, '节点已导入');
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

const testAllNodes = async () => {
  if (!nodesData.length) {
    showToast('暂无可测试节点', 'info');
    return;
  }

  if (testAllBtn) {
    testAllBtn.disabled = true;
    testAllBtn.textContent = '批量测试中...';
  }

  nodesData.forEach((node) => {
    const resultEl = document.querySelector(`#test-result-${node.id}`);
    if (resultEl) {
      resultEl.textContent = '测试中...';
      resultEl.className = 'latency';
      resultEl.title = '';
    }
  });

  try {
    const payload = await requestJson('/api/nodes/test-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: nodesData.map((node) => node.id) })
    });

    if (payload.core) {
      updateCoreStatus(payload.core);
    }

    payload.results.forEach(applyLatencyResult);
    const successCount = payload.results.filter((result) => result.ok).length;
    const failedCount = payload.results.length - successCount;
    const autoStartText = payload.autoStarted ? '，并已自动启动核心' : '';
    showToast(`批量测试完成：成功 ${successCount}，失败 ${failedCount}${autoStartText}`, failedCount ? 'info' : 'success');
  } catch (error) {
    resetLatencyPlaceholders(nodesData.map((node) => node.id));
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
};

closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

const openEditModal = (id) => {
  const node = nodesData.find(n => n.id === id);
  if (!node) return;
  currentEditNodeId = id;
  const editData = { ...node };
  editJsonInput.value = JSON.stringify(editData, null, 2);
  editModal.classList.add('active');
};

saveNodeBtn?.addEventListener('click', async () => {
  saveNodeBtn.textContent = '保存中...';
  saveNodeBtn.disabled = true;
  
  try {
    const updatedData = JSON.parse(editJsonInput.value);
    
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

// Window Titlebar Mocks
document.getElementById('titlebar-close')?.addEventListener('click', () => {
  showToast('Tauri 退出指令正在开发中...', 'info');
});

// Init
loadNodes();
loadSystemStatus();
