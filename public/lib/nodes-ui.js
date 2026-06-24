import { renderQrCodeToCanvas } from './qr-code.js';
import { copyTextToClipboard, flagFromCountryCode } from './utils.js';

export const showInlineMessage = (target, message, tone = '') => {
  target.textContent = message;
  target.className = tone ? `state-msg ${tone}` : 'state-msg';
  target.classList.remove('hidden');
};

export const maskAddress = (address) => {
  if (!address) return '未知地址';
  const parts = address.split('.');
  if (parts.length === 4 && !parts.some((part) => Number.isNaN(Number(part)))) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (address.length > 8) {
    return address.substring(0, 4) + '***' + address.substring(address.length - 4);
  }
  return address;
};

export const renderNodeRow = ({
  node,
  activeNodeId,
  groupsData,
  nodesData,
  escapeHtml,
}) => {
  const protText = (node.type || 'SOCKS').toUpperCase();
  const transText = (node.transport || 'tcp').toLowerCase();
  const isSubscriptionNode = node.source === 'subscription' && node.subscriptionUrl;
  let secText = '-';
  if (node.security && node.security !== 'none') secText = node.security.toLowerCase();
  else if (node.tls) secText = 'tls';
  const maskedIp = maskAddress(node.server);
  const localPortStr = node.localPort ? node.localPort : (node.port || '未知');

export const showInlineMessage = (target, message, tone = '') => {
  target.textContent = message;
  target.className = tone ? `state-msg ${tone}` : 'state-msg';
  target.classList.remove('hidden');
};

export const maskAddress = (address) => {
  if (!address) return '未知地址';
  const parts = address.split('.');
  if (parts.length === 4 && !parts.some((part) => Number.isNaN(Number(part)))) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (address.length > 8) {
    return address.substring(0, 4) + '***' + address.substring(address.length - 4);
  }
  return address;
};

export const renderNodeRow = ({
  node,
  activeNodeId,
  groupsData,
  nodesData,
  escapeHtml,
}) => {
  const protText = (node.type || 'SOCKS').toUpperCase();
  const transText = (node.transport || 'tcp').toLowerCase();
  const isSubscriptionNode = node.source === 'subscription' && node.subscriptionUrl;
  let secText = '-';
  if (node.security && node.security !== 'none') secText = node.security.toLowerCase();
  else if (node.tls) secText = 'tls';
  const maskedIp = maskAddress(node.server);
  const localPortStr = node.localPort ? node.localPort : (node.port || '未知');
  const isActive = node.id === activeNodeId;
  const activeClass = isActive ? 'active-row' : '';
  const activeBadge = isActive ? '<span class="pill pill-active"><i class="ph ph-lightning"></i> 当前生效</span>' : '';
  const subscriptionBadge = isSubscriptionNode ? '<span class="pill pill-dark">订阅</span>' : '';
  const allGroups = [...new Set([...groupsData, ...nodesData.map((item) => item.group).filter(Boolean)])];
  const flagEmoji = node.flagEmoji || flagFromCountryCode(node.countryCode);
  const flagTitle = escapeHtml(node.countryName || node.countryCode || 'GeoIP 数据准备中');
  const countryOverrideBadge = node.countryOverridden ? '<span class="pill pill-dark">手动国家</span>' : '';
  const echBadge = node.ech ? '<span class="pill pill-ech" title="Encrypted Client Hello 已开启">ECH</span>' : '';
  const groupMenuItems = [
    `<button type="button" class="group-menu-item${!node.group ? ' active' : ''}" data-group="">未分组</button>`,
    ...allGroups.map((group) => {
      const safeGroup = escapeHtml(group);
      return `<button type="button" class="group-menu-item${node.group === group ? ' active' : ''}" data-group="${safeGroup}">${safeGroup}</button>`;
    })
  ].join('');
  const moveGroupAction = isSubscriptionNode
    ? '<button type="button" class="node-menu-item is-disabled" disabled title="订阅节点固定在专属分组"><i class="ph ph-lock"></i><span>移动分组</span></button>'
    : `
        <div class="move-group-wrap" data-id="${escapeHtml(node.id)}">
          <button type="button" class="node-menu-item move-group-btn" data-id="${escapeHtml(node.id)}" title="移动到分组"><i class="ph ph-folder-simple-arrow"></i><span>移动分组</span></button>
          <div class="group-menu">${groupMenuItems}</div>
        </div>
      `;

  return `
    <tr data-id="${escapeHtml(node.id)}" class="node-row ${activeClass}" title="双击切换为主节点">
      <td class="node-check-cell"><input type="checkbox" class="node-checkbox" data-id="${escapeHtml(node.id)}"></td>
      <td><span class="pill pill-protocol">${escapeHtml(protText)}</span>${activeBadge}</td>
      <td>
        <div class="node-info">
          <div class="node-primary-line">
            <span class="node-flag${flagEmoji ? '' : ' is-placeholder'}" title="${flagTitle}">${escapeHtml(flagEmoji || '---')}</span>
            <span class="node-name">${escapeHtml(node.name || '未命名节点')}</span>
            ${subscriptionBadge}
          </div>
          <span class="node-ip">${escapeHtml(maskedIp)}</span>
          <span class="node-port">本地出口: ${escapeHtml(String(localPortStr))}</span>${countryOverrideBadge}
        </div>
      </td>
      <td>
        <span class="pill pill-dark">${escapeHtml(transText)}</span>
        <span class="pill pill-dark">${escapeHtml(secText)}</span>
        ${echBadge}
      </td>
      <td class="node-latency-cell">
        <span class="latency" id="test-result-${escapeHtml(node.id)}">-</span>
      </td>
      <td class="node-table-spacer-cell">
        <button type="button" class="node-row-float-btn node-row-test-btn test-node-btn" data-id="${escapeHtml(node.id)}" title="测试延迟" aria-label="测试延迟">
          <i class="ph ph-activity"></i>
        </button>
        <button type="button" class="node-row-float-btn node-action-menu-btn" data-id="${escapeHtml(node.id)}" title="节点操作" aria-label="节点操作">
          <i class="ph ph-dots-three-vertical"></i>
        </button>
        <div class="node-action-menu" data-menu-panel="row">
          <div class="node-action-menu-title">
            <span class="node-action-menu-kicker">节点操作</span>
            <strong>${escapeHtml(node.name || '未命名节点')}</strong>
          </div>
          <button type="button" class="node-menu-item detail-node-btn" data-id="${escapeHtml(node.id)}"><i class="ph ph-pencil-simple"></i><span>编辑详情</span></button>
          <hr class="group-menu-separator">
          <button type="button" class="node-menu-item share-node-btn" data-id="${escapeHtml(node.id)}"><i class="ph ph-copy"></i><span>复制链接</span></button>
          <button type="button" class="node-menu-item qr-node-btn" data-id="${escapeHtml(node.id)}"><i class="ph ph-qr-code"></i><span>二维码分享</span></button>
          <hr class="group-menu-separator">
          <button type="button" class="node-menu-item country-node-btn" data-id="${escapeHtml(node.id)}"><i class="ph ph-flag-banner"></i><span>修正国家</span></button>
          ${moveGroupAction}
          <hr class="group-menu-separator">
          <button type="button" class="node-menu-item is-danger delete-node-btn" data-id="${escapeHtml(node.id)}"><i class="ph ph-trash"></i><span>删除节点</span></button>
        </div>
      </td>
    </tr>`;
};

export const copyNodeShareLink = async ({ id, nodesData, showToast }) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node?.shareLink) {
    showToast('该节点暂不支持分享链接', 'error');
    return;
  }

  try {
    await copyTextToClipboard(node.shareLink);
    showToast('代理链接已复制', 'success');
  } catch (error) {
    showToast(`复制失败: ${error.message || '请检查剪贴板权限'}`, 'error');
  }
};

const downloadCanvasPng = (canvas, filename) => {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const sanitizeFilePart = (value) => String(value || 'node')
  .trim()
  .replace(/[\\/:*?"<>|]+/gu, '-')
  .replace(/\s+/gu, '-')
  .slice(0, 80) || 'node';

export const closeNodeShareQrModal = () => {
  const overlay = document.getElementById('node-share-qr-modal');
  overlay?.classList.remove('active');
};

export const openNodeShareQrModal = ({ id, nodesData, showToast }) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node?.shareLink) {
    showToast('该节点暂不支持二维码分享', 'error');
    return false;
  }

  const overlay = document.getElementById('node-share-qr-modal');
  const title = document.getElementById('node-share-qr-title');
  const name = document.getElementById('node-share-qr-name');
  const canvas = document.getElementById('node-share-qr-canvas');
  const linkField = document.getElementById('node-share-qr-link');
  const copyBtn = document.getElementById('node-share-qr-copy');
  const downloadBtn = document.getElementById('node-share-qr-download');
  const closeBtns = overlay?.querySelectorAll('[data-node-share-qr-close]') || [];

  if (!overlay || !title || !name || !canvas || !linkField || !copyBtn || !downloadBtn) {
    showToast('二维码弹窗初始化失败', 'error');
    return false;
  }

  title.textContent = '二维码分享';
  name.textContent = node.name || node.server || '未命名节点';
  linkField.value = node.shareLink;

  try {
    renderQrCodeToCanvas(canvas, node.shareLink, { maxSize: 320 });
  } catch (error) {
    showToast(`二维码生成失败: ${error.message}`, 'error');
    return false;
  }

  copyBtn.onclick = async () => {
    try {
      await copyTextToClipboard(node.shareLink);
      showToast('代理链接已复制', 'success');
    } catch (error) {
      showToast(`复制失败: ${error.message || '请检查剪贴板权限'}`, 'error');
    }
  };

  downloadBtn.onclick = () => {
    try {
      downloadCanvasPng(canvas, `${sanitizeFilePart(node.name || node.server || node.id)}.png`);
      showToast('二维码已保存', 'success');
    } catch (error) {
      showToast(`保存失败: ${error.message || '请检查浏览器权限'}`, 'error');
    }
  };

  closeBtns.forEach((button) => {
    button.onclick = closeNodeShareQrModal;
  });
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      closeNodeShareQrModal();
    }
  };
  overlay.classList.add('active');
  return true;
};

export const copySelectedNodeShareLinks = async ({ selectedNodeIds, nodesData, showToast }) => {
  const selectedNodes = nodesData.filter((item) => selectedNodeIds.has(item.id));
  const shareLinks = selectedNodes.map((item) => item.shareLink).filter(Boolean);
  if (!shareLinks.length) {
    showToast('所选节点暂无可复制的代理链接', 'error');
    return;
  }

  const skippedCount = selectedNodes.length - shareLinks.length;

  try {
    await copyTextToClipboard(shareLinks.join('\n'));
    showToast(
      skippedCount
        ? `已复制 ${shareLinks.length} 条代理链接，跳过 ${skippedCount} 条无分享链接节点`
        : `已复制 ${shareLinks.length} 条代理链接`,
      'success'
    );
  } catch (error) {
    showToast(`复制失败: ${error.message || '请检查剪贴板权限'}`, 'error');
  }
};

export const applyLatencyResult = (result) => {
  const resultEl = document.querySelector(`#test-result-${result.id}`);
  if (!resultEl) return;

  resultEl.className = 'latency';
  resultEl.title = '';
  delete resultEl.dataset.startedAt;
  if (result.ok) {
    resultEl.textContent = `${result.latencyMs}ms`;
    const latencyMs = Number(result.latencyMs);
    resultEl.classList.add(Number.isFinite(latencyMs) && latencyMs > 0 && latencyMs <= 500 ? 'good' : 'bad');
    if (result.elapsedMs != null) {
      resultEl.title = `测试耗时 ${Math.max(0, Math.round(Number(result.elapsedMs)))} ms`;
    }
    return;
  }

  resultEl.textContent = '失败';
  resultEl.classList.add('error');
  resultEl.title = result.error || '测试失败';
};

export const markLatencyTesting = (id, label = '测试中...') => {
  const resultEl = document.querySelector(`#test-result-${id}`);
  if (!resultEl) return null;

  resultEl.textContent = label;
  resultEl.className = 'latency testing';
  resultEl.title = '正在通过该节点访问测速地址';
  resultEl.dataset.startedAt = String(Date.now());
  return resultEl;
};

export const setNodeTestingActionState = (id, isTesting) => {
  const safeId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(String(id))
    : String(id).replace(/"/g, '\\"');
  const button = document.querySelector(`.test-node-btn[data-id="${safeId}"]`);
  if (!button) return;

  button.disabled = Boolean(isTesting);
  button.classList.toggle('is-testing', Boolean(isTesting));
  const label = button.querySelector('span');
  if (label) {
    label.textContent = isTesting ? '测速中' : '测速';
  }
  button.title = isTesting ? '该节点正在测速' : '测试延迟';
};

export const getLatencyTestingElapsed = (id) => {
  const resultEl = document.querySelector(`#test-result-${id}`);
  const startedAt = Number(resultEl?.dataset?.startedAt || 0);
  return startedAt > 0 ? Date.now() - startedAt : null;
};

export const resetLatencyPlaceholders = (ids) => {
  ids.forEach((id) => {
    const resultEl = document.querySelector(`#test-result-${id}`);
    if (!resultEl) return;
    resultEl.textContent = '-';
    resultEl.className = 'latency';
    resultEl.title = '';
    delete resultEl.dataset.startedAt;
    setNodeTestingActionState(id, false);
  });
};
