import { flagFromCountryCode } from './utils.js';

export const showInlineMessage = (target, message, tone = '') => {
  target.textContent = message;
  target.className = tone ? `state-msg ${tone}` : 'state-msg';
  target.classList.remove('hidden');
};

export const maskAddress = (address) => {
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

export const renderNodeRow = ({
  node,
  activeNodeId,
  groupsData,
  nodesData,
  escapeHtml,
}) => {
  const protText = (node.type || 'SOCKS').toUpperCase();
  const transText = (node.transport || 'tcp').toLowerCase();
  let secText = '-';
  if (node.security && node.security !== 'none') secText = node.security.toLowerCase();
  else if (node.tls) secText = 'tls';
  const maskedIp = maskAddress(node.server);
  const localPortStr = node.localPort ? node.localPort : (node.port || '未知');
  const isActive = node.id === activeNodeId;
  const activeClass = isActive ? 'active-row' : '';
  const activeBadge = isActive ? '<span class="pill pill-active"><i class="ph ph-lightning"></i> 此刻生效</span>' : '';
  const allGroups = [...new Set([...groupsData, ...nodesData.map((item) => item.group).filter(Boolean)])];
  const flagEmoji = node.flagEmoji || flagFromCountryCode(node.countryCode);
  const flagTitle = node.countryName || node.countryCode || 'GeoIP 数据准备中';
  const countryOverrideBadge = node.countryOverridden ? '<span class="pill pill-dark">手动国家</span>' : '';
  const groupMenuItems = [
    `<div class="group-menu-item${!node.group ? ' active' : ''}" data-group="">未分组</div>`,
    ...allGroups.map((group) => `<div class="group-menu-item${node.group === group ? ' active' : ''}" data-group="${group}">${group}</div>`)
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
          <span class="node-port">本地出口: ${localPortStr}</span>${countryOverrideBadge}
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
          <button type="button" class="row-action-btn country-node-btn" data-id="${node.id}" title="修正国家归属"><i class="ph ph-flag-banner"></i></button>
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

export const copyNodeShareLink = async ({ id, nodesData, showToast }) => {
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

export const applyLatencyResult = (result) => {
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

export const resetLatencyPlaceholders = (ids) => {
  ids.forEach((id) => {
    const resultEl = document.querySelector(`#test-result-${id}`);
    if (!resultEl) return;
    resultEl.textContent = '-';
    resultEl.className = 'latency';
    resultEl.title = '';
  });
};
