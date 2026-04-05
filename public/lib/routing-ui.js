export const updateRoutingLogSearchControls = ({ routingLogSearchClearBtn, routingLogSearchQuery }) => {
  if (routingLogSearchClearBtn) {
    routingLogSearchClearBtn.classList.toggle('hidden', !routingLogSearchQuery.trim());
  }
};

export const updateRoutingLogViewModeButtons = ({ routingLogViewMode, routingLogViewStatsBtn, routingLogViewTimelineBtn }) => {
  const isStats = routingLogViewMode !== 'timeline';
  routingLogViewStatsBtn?.classList.toggle('active', isStats);
  routingLogViewTimelineBtn?.classList.toggle('active', !isStats);
};

export const markRoutingHitsAsSeen = ({ hits, routingLogSeenIds }) => {
  hits.forEach((hit) => {
    if (hit?.id) {
      routingLogSeenIds.add(String(hit.id));
    }
  });
  return 0;
};

export const updateRoutingLogNavBadge = ({ routingLogNavBadge, routingLogUnreadCount, animate = false }) => {
  if (!routingLogNavBadge) {
    return;
  }
  const count = Math.max(0, Number(routingLogUnreadCount) || 0);
  routingLogNavBadge.classList.toggle('hidden', count === 0);
  if (count > 0) {
    routingLogNavBadge.textContent = count > 99 ? '99+' : String(count);
    if (animate) {
      routingLogNavBadge.classList.remove('ping');
      void routingLogNavBadge.offsetWidth;
      routingLogNavBadge.classList.add('ping');
    }
  }
};

export const renderRoutingModeBanner = ({
  routingModeBanner,
  getRoutingMode,
  currentCoreState,
  routingRules,
  routingRulesets,
  escapeHtml,
  escapeRegExp,
  onEnableSystemProxyRule,
  onStartCore,
}) => {
  if (!routingModeBanner) return;
  const mode = getRoutingMode();
  const systemProxyEnabled = Boolean(currentCoreState?.proxy?.systemProxyEnabled);
  const coreStatus = currentCoreState?.status || 'stopped';
  routingModeBanner.className = 'routing-mode-banner';
  let copy = '';
  let keywords = [];
  let modeLabel = '规则状态';
  let modeIcon = 'ph ph-compass-tool';
  const actions = [];

  if (coreStatus !== 'running') {
    actions.push('<button type="button" class="btn-outline" data-routing-action="start-core">启动核心</button>');
  }

  if (!routingRules.length && !routingRulesets.length) {
    modeLabel = '未配置规则';
    modeIcon = 'ph ph-path';
    copy = '当前还没有分流规则。可以先新增规则，或者用右上角预设模板快速生成一组起步规则。';
    keywords = ['分流规则', '预设模板'];
    routingModeBanner.classList.add('is-inactive');
  } else if (!systemProxyEnabled) {
    modeLabel = '系统代理未启用';
    modeIcon = 'ph ph-plugs-connected';
    copy = '系统代理当前未启用：规则已经保存，但统一入口没有开启，所以这些规则不会被命中。';
    keywords = ['系统代理未启用', '不会被命中'];
    routingModeBanner.classList.add('is-direct');
    actions.push('<button type="button" class="btn-primary" data-routing-action="enable-system-proxy-rule">启用系统代理</button>');
  } else if (mode === 'rule') {
    modeLabel = '规则分流模式';
    modeIcon = 'ph ph-radar';
    routingModeBanner.classList.add('is-active');
    copy = '当前处于规则分流模式：规则集和手写规则正在参与系统代理统一入口的流量分发。';
    keywords = ['规则分流模式', '规则集', '手写规则'];
  } else if (mode === 'direct') {
    modeLabel = '直连退出模式';
    modeIcon = 'ph ph-arrow-bend-up-left';
    routingModeBanner.classList.add('is-direct');
    copy = '当前处于直连退出模式：规则仍可编辑，但系统代理流量会全部直连，不使用这些规则。';
    keywords = ['直连退出模式', '全部直连'];
  } else {
    modeLabel = '全局接管模式';
    modeIcon = 'ph ph-globe-hemisphere-west';
    routingModeBanner.classList.add('is-inactive');
    copy = '当前处于全局接管模式：规则仍可编辑，但系统代理流量会统一走当前默认节点，不使用这些规则。';
    keywords = ['全局接管模式', '当前默认节点'];
  }

  let highlightedCopy = escapeHtml(copy);
  keywords.forEach((keyword) => {
    const escapedKeyword = escapeRegExp(keyword);
    highlightedCopy = highlightedCopy.replace(new RegExp(escapedKeyword, 'g'), `<span class="routing-mode-keyword">${escapeHtml(keyword)}</span>`);
  });

  routingModeBanner.innerHTML = `
    <div class="routing-mode-head"><i class="${modeIcon}"></i><span>${escapeHtml(modeLabel)}</span></div>
    <div class="routing-mode-copy">${highlightedCopy}</div>
    ${actions.length ? `<div class="routing-mode-actions">${actions.join('')}</div>` : ''}
  `;

  routingModeBanner.querySelectorAll('[data-routing-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.routingAction;
      if (action === 'enable-system-proxy-rule') {
        await onEnableSystemProxyRule();
      } else if (action === 'start-core') {
        await onStartCore();
      }
    });
  });
};
