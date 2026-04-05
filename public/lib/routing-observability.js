export const extractRoutingObservability = (core) => {
  const recentLogs = Array.isArray(core?.recentLogs) ? core.recentLogs : [];
  return recentLogs.filter((line) => String(line || '').includes('[Routing Hit]')).slice(-30);
};

export const renderRoutingObservability = ({
  routingObservability,
  routingObservabilityLines,
  routingObservabilityStatus,
  routingLogMode,
  routingLogSystemProxy,
  routingLogCoreStatus,
  routingLogResultCount,
  currentCoreState,
  getRoutingMode,
  routingHits,
  routingObservabilityEntries,
  routingLogSearchQuery,
  routingLogKindQuery,
  routingLogViewMode,
  routingHitCountSnapshot,
  setRoutingHitCountSnapshot,
  escapeHtml,
  escapeRegExp,
}) => {
  if (!routingObservability || !routingObservabilityLines) return;
  routingObservability.classList.remove('hidden');

  if (routingObservabilityStatus) {
    const isRunning = currentCoreState?.status === 'running';
    routingObservabilityStatus.innerHTML = `<span class="status-indicator ${isRunning ? 'active' : ''}"></span> ${isRunning ? '实时监控中' : '核心未运行'}`;
  }

  if (routingLogMode) {
    const mode = getRoutingMode();
    routingLogMode.textContent = mode === 'rule' ? '规则分流' : mode === 'global' ? '全局接管' : mode === 'direct' ? '直连退出' : mode;
    routingLogMode.className = `routing-log-summary-value ${mode === 'rule' ? 'is-good' : mode === 'direct' ? 'is-warn' : 'is-muted'}`;
  }

  if (routingLogSystemProxy) {
    const enabled = Boolean(currentCoreState?.proxy?.systemProxyEnabled);
    routingLogSystemProxy.textContent = enabled ? '已启用' : '未启用';
    routingLogSystemProxy.className = `routing-log-summary-value ${enabled ? 'is-good' : 'is-warn'}`;
  }

  if (routingLogCoreStatus) {
    const running = currentCoreState?.status === 'running';
    routingLogCoreStatus.textContent = running ? '运行中' : '未运行';
    routingLogCoreStatus.className = `routing-log-summary-value ${running ? 'is-good' : 'is-bad'}`;
  }

  const query = routingLogSearchQuery.trim().toLowerCase();

  if (routingHits.length) {
    const groupedHits = new Map();
    routingHits.forEach((hit) => {
      const key = `${hit.kind}:${hit.name}->${hit.outboundName || hit.outbound || hit.target}`;
      if (!groupedHits.has(key)) {
        groupedHits.set(key, {
          ...hit,
          groupKey: key,
          count: 0,
          hosts: new Set(),
          items: []
        });
      }
      const group = groupedHits.get(key);
      group.count += 1;
      group.hosts.add(hit.host);
      group.items.push(hit);
    });

    const filteredGroups = Array.from(groupedHits.values()).filter((group) => {
      const kindMatch = routingLogKindQuery === 'all' || String(group.kind || '') === routingLogKindQuery;
      if (!kindMatch) return false;
      const haystacks = [group.name, group.outboundName || group.outbound || group.target, ...Array.from(group.hosts), group.rule || '', group.rulePayload || '', group.matchedTag || '', group.matchType || '', group.matchValue || '']
        .map((value) => String(value || '').toLowerCase());
      return !query || haystacks.some((value) => value.includes(query));
    });

    if (routingLogResultCount) {
      const filteredHitCount = filteredGroups.reduce((sum, item) => sum + item.count, 0);
      routingLogResultCount.textContent = query || routingLogKindQuery !== 'all'
        ? `显示 ${filteredHitCount} / ${routingHits.length} 条命中`
        : `共 ${routingHits.length} 条命中`;
    }

    if (!filteredGroups.length) {
      routingObservabilityLines.innerHTML = query
        ? `<div class="routing-log-empty">没有找到匹配 <strong>${escapeHtml(routingLogSearchQuery)}</strong> 的命中</div>`
        : '<div class="routing-log-empty">暂无自定义规则命中日志。请确认系统代理正在走规则分流，并实际访问能命中你自定义规则的域名或 IP。</div>';
      return;
    }

    const queryPattern = query ? new RegExp(escapeRegExp(routingLogSearchQuery.trim()), 'gi') : null;
    const highlight = (text) => {
      const escaped = escapeHtml(text);
      return queryPattern ? escaped.replace(queryPattern, (match) => `<span class="routing-log-highlight">${match}</span>`) : escaped;
    };

    if (routingLogViewMode === 'timeline') {
      setRoutingHitCountSnapshot(new Map(Array.from(groupedHits.entries()).map(([key, group]) => [key, group.count])));
      const timelineItems = filteredGroups
        .flatMap((group) => group.items)
        .sort((a, b) => (b.timestamp ? Date.parse(b.timestamp) : 0) - (a.timestamp ? Date.parse(a.timestamp) : 0))
        .slice(0, 80);

      routingObservabilityLines.innerHTML = timelineItems.map((item) => {
        const timeText = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--';
        return `
          <div class="routing-timeline-row">
            <span class="routing-timeline-time">时间 ${highlight(timeText)}</span>
            <span class="routing-chip is-accent">${highlight(item.kind || '')}</span>
            <span class="routing-hit-name">${highlight(item.name || '')}</span>
            <span class="routing-hit-arrow">→</span>
            <span class="routing-hit-target">${highlight(item.outboundName || item.outbound || item.target || '')}</span>
            <span class="routing-hit-detail-host">${highlight(item.host || '')}${item.port ? `:${highlight(String(item.port))}` : ''}</span>
            ${item.matchedTag ? `<span class="routing-hit-detail-meta">tag=${highlight(String(item.matchedTag))}</span>` : ''}
            ${item.persisted ? '<span class="routing-chip">历史</span>' : ''}
          </div>`;
      }).join('');
      return;
    }

    const nextCountSnapshot = new Map(Array.from(groupedHits.entries()).map(([key, group]) => [key, group.count]));
    routingObservabilityLines.innerHTML = filteredGroups.map((group, index) => {
      const hosts = Array.from(group.hosts);
      const sampleHosts = hosts.slice(0, 3);
      const moreCount = hosts.length - sampleHosts.length;
      const detailId = `routing-hit-detail-${index}`;
      const previousCount = routingHitCountSnapshot.get(group.groupKey) || 0;
      const bumped = group.count > previousCount;
      return `
        <details class="routing-hit-card">
          <summary class="routing-hit-header">
            <div class="routing-hit-title">
              <span class="routing-chip is-accent">${highlight(group.kind)}</span>
              <span class="routing-hit-name">${highlight(group.name)}</span>
              <span class="routing-hit-arrow">→</span>
              <span class="routing-hit-target">${highlight(group.outboundName || group.outbound || group.target)}</span>
            </div>
            <div class="routing-hit-count${bumped ? ' is-bump' : ''}">${group.count} 次命中</div>
          </summary>
          <div class="routing-hit-hosts">
            ${sampleHosts.map((host) => `<span class="routing-hit-host">${highlight(host)}</span>`).join('')}
            ${moreCount > 0 ? `<span class="routing-hit-host-more">+${moreCount}</span>` : ''}
          </div>
          <div class="routing-hit-details" id="${detailId}">
            <div class="routing-hit-details-title">最近命中</div>
            ${group.items.slice().sort((a, b) => (b.timestamp ? Date.parse(b.timestamp) : 0) - (a.timestamp ? Date.parse(a.timestamp) : 0)).slice(0, 10).map((item) => `
              <div class="routing-hit-detail-row">
                <span class="routing-hit-detail-host">${highlight(item.host)}${item.port ? `:${highlight(String(item.port))}` : ''}</span>
                <span class="routing-hit-detail-meta">${item.timestamp ? highlight(new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })) : '--:--:--'}</span>
                <span class="routing-hit-detail-meta">${highlight(item.outboundName || item.outbound || item.target)}</span>
                ${item.matchedTag ? `<span class="routing-hit-detail-meta">tag=${highlight(String(item.matchedTag))}</span>` : ''}
                ${item.matchType && item.matchValue ? `<span class="routing-hit-detail-meta">match=${highlight(`${item.matchType}:${item.matchValue}`)}</span>` : ''}
                ${item.persisted ? '<span class="routing-chip">历史</span>' : ''}
              </div>`).join('')}
          </div>
        </details>`;
    }).join('');
    setRoutingHitCountSnapshot(nextCountSnapshot);
    return;
  }

  const groups = new Map();
  const unparsedLines = [];
  routingObservabilityEntries.forEach((line) => {
    const match = line.match(/\[Routing Hit\]\s+(.*?):(.*?) -> (.*?)\s+\|\s+(.*)/);
    if (match) {
      const kind = match[1].trim();
      const name = match[2].trim();
      const target = match[3].trim();
      const host = match[4].trim();
      const key = `${kind}:${name}->${target}`;
      if (!groups.has(key)) {
        groups.set(key, { groupKey: key, kind, name, target, count: 0, hosts: new Set(), rawLines: [] });
      }
      const group = groups.get(key);
      group.count += 1;
      group.hosts.add(host);
      group.rawLines.push(line);
    } else {
      unparsedLines.push(line);
    }
  });

  const filteredGroups = [];
  groups.forEach((group) => {
    if (routingLogKindQuery !== 'all' && String(group.kind || '') !== routingLogKindQuery) return;
    const hostsArray = Array.from(group.hosts);
    const matchesQuery = !query || group.name.toLowerCase().includes(query) || group.target.toLowerCase().includes(query) || hostsArray.some((host) => host.toLowerCase().includes(query));
    if (matchesQuery) {
      filteredGroups.push({ ...group, hostsArray });
    }
  });

  const filteredUnparsed = unparsedLines.filter((line) => !query || line.toLowerCase().includes(query));
  const totalFiltered = filteredGroups.reduce((sum, group) => sum + group.count, 0) + filteredUnparsed.length;
  const totalEntries = routingObservabilityEntries.length;

  if (routingLogResultCount) {
    routingLogResultCount.textContent = query
      ? `显示 ${totalFiltered} / ${totalEntries} 条命中`
      : (totalEntries ? `共 ${totalEntries} 条命中` : '暂无日志');
  }

  if (totalFiltered === 0) {
    if (query) {
      routingObservabilityLines.innerHTML = `<div class="routing-log-empty">没有找到匹配 <strong>${escapeHtml(routingLogSearchQuery)}</strong> 的日志</div>`;
      return;
    }
    routingObservabilityLines.innerHTML = '<div class="routing-log-empty">暂无自定义规则命中日志。请确认系统代理正在走规则分流，并实际访问能命中你自定义规则的域名或 IP。</div>';
    return;
  }

  const queryPattern = query ? new RegExp(escapeRegExp(routingLogSearchQuery.trim()), 'gi') : null;
  const highlight = (text) => queryPattern ? escapeHtml(text).replace(queryPattern, (match) => `<span class="routing-log-highlight">${match}</span>`) : escapeHtml(text);

  let html = '';
  if (routingLogViewMode === 'timeline') {
    const timelineFallbackItems = [];
    filteredGroups.forEach((group) => {
      (group.rawLines || []).forEach((line) => {
        const timeMatch = String(line).match(/(\d{2}:\d{2}:\d{2})/);
        timelineFallbackItems.push({ time: timeMatch ? timeMatch[1] : '--:--:--', kind: group.kind, name: group.name, target: group.target, line });
      });
    });

    if (timelineFallbackItems.length) {
      html += timelineFallbackItems.slice(0, 80).map((item) => `
        <div class="routing-timeline-row">
          <span class="routing-timeline-time">时间 ${highlight(item.time)}</span>
          <span class="routing-chip is-accent">${highlight(item.kind)}</span>
          <span class="routing-hit-name">${highlight(item.name)}</span>
          <span class="routing-hit-arrow">→</span>
          <span class="routing-hit-target">${highlight(item.target)}</span>
        </div>
      `).join('');
    }

    filteredUnparsed.forEach((line) => {
      const timeMatch = String(line).match(/(\d{2}:\d{2}:\d{2})/);
      const timeText = timeMatch ? timeMatch[1] : '--:--:--';
      html += `<div class="routing-timeline-row"><span class="routing-timeline-time">时间 ${highlight(timeText)}</span><span class="routing-log-line">${highlight(line)}</span></div>`;
    });

    routingObservabilityLines.innerHTML = html;
    return;
  }

  filteredGroups.forEach((group) => {
    const displayHosts = group.hostsArray.slice(0, 3);
    const moreCount = group.hostsArray.length - 3;
    const previousCount = routingHitCountSnapshot.get(group.groupKey) || 0;
    const bumped = group.count > previousCount;
    html += `
      <div class="routing-hit-card">
        <div class="routing-hit-header">
          <div class="routing-hit-title">
            <span class="routing-chip is-accent">${highlight(group.kind)}</span>
            <span class="routing-hit-name">${highlight(group.name)}</span>
            <span class="routing-hit-arrow">→</span>
            <span class="routing-hit-target">${highlight(group.target)}</span>
          </div>
          <div class="routing-hit-count${bumped ? ' is-bump' : ''}">${group.count} 次命中</div>
        </div>
        <div class="routing-hit-hosts">
          ${displayHosts.map((host) => `<span class="routing-hit-host">${highlight(host)}</span>`).join('')}
          ${moreCount > 0 ? `<span class="routing-hit-host-more">+${moreCount}</span>` : ''}
        </div>
      </div>
    `;
  });

  filteredUnparsed.forEach((line) => {
    let formattedLine = escapeHtml(line);
    if (queryPattern) {
      formattedLine = formattedLine.replace(queryPattern, (match) => `<span class="routing-log-highlight">${match}</span>`);
    } else {
      formattedLine = formattedLine.replace(/\[Routing\]/g, '<span class="log-tag">[Routing]</span>');
      formattedLine = formattedLine.replace(/proxy/gi, '<span class="log-action-proxy">proxy</span>');
      formattedLine = formattedLine.replace(/direct/gi, '<span class="log-action-direct">direct</span>');
    }
    html += `<div class="routing-log-line">${formattedLine}</div>`;
  });

  routingObservabilityLines.innerHTML = html;
  setRoutingHitCountSnapshot(new Map(Array.from(groups.entries()).map(([key, group]) => [key, group.count])));
};
