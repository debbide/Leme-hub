export const ACTIVE_NODE_SELECTOR_TAG = 'selector-active';

export const createNodeGroupOutboundTag = (groupId) => `grp-${String(groupId || '').trim()}`;

export const buildRoutingObservabilityLines = (runtime = {}, config = {}) => {
  const {
    activeNodeId = null,
    systemDefaultNodeId = null,
    systemProxyAutoSwitchEnabled = false,
    systemProxyAutoSwitchGroupId = null,
    nodeGroups = [],
    proxyMode = 'rule',
    customRules = [],
    rulesets = [],
    routingItems = [],
    systemProxyEnabled = false,
    tunEnabled = false
  } = runtime;

  const route = config.route || {};
  const rules = Array.isArray(route.rules) ? route.rules : [];
  // Capture path is system-proxy inbounds and/or TUN; either enables rule routing.
  const captureEnabled = Boolean(systemProxyEnabled || tunEnabled);
  const captureModeLabel = tunEnabled
    ? (systemProxyEnabled ? 'system proxy + TUN' : 'TUN')
    : (systemProxyEnabled ? 'system proxy' : 'none');
  const systemRule = rules.find((rule) => Array.isArray(rule.inbound)
    && (rule.inbound.includes('system-socks')
      || rule.inbound.includes('system-http')
      || rule.inbound.includes('tun-in')));
  const systemFallback = rules[rules.length - 1];
  const activeOutbound = activeNodeId ? `out-${activeNodeId}` : 'direct';
  const normalizeDisplayOutbound = (outbound) => outbound === ACTIVE_NODE_SELECTOR_TAG ? activeOutbound : outbound;
  const autoSwitchGroup = systemProxyAutoSwitchEnabled
    ? (Array.isArray(nodeGroups) ? nodeGroups.find((group) => group?.id === systemProxyAutoSwitchGroupId && Array.isArray(group?.nodeIds) && group.nodeIds.length) : null)
    : null;
  const systemDefaultOutbound = autoSwitchGroup
    ? createNodeGroupOutboundTag(autoSwitchGroup.id)
    : systemDefaultNodeId
      ? `out-${systemDefaultNodeId}`
      : activeOutbound;
  const displaySystemDefaultOutbound = normalizeDisplayOutbound(systemDefaultOutbound);
  const lines = [];

  if (!captureEnabled) {
    lines.push('[Routing] rule routing inactive: capture disabled (system proxy/TUN off)');
  } else if (proxyMode !== 'rule') {
    lines.push(`[Routing] rule routing inactive: mode=${proxyMode} via ${captureModeLabel}`);
  } else {
    const hasRoutingItems = Array.isArray(routingItems) && routingItems.length > 0;
    const routingItemCount = hasRoutingItems
      ? routingItems.length
      : customRules.length + rulesets.length;
    const label = hasRoutingItems ? 'routing item(s)' : 'manual rule(s)';
    const outboundLabel = displaySystemDefaultOutbound === activeOutbound
      ? `active outbound ${activeOutbound}`
      : `system outbound ${displaySystemDefaultOutbound} (active ${activeOutbound})`;
    lines.push(`[Routing] rule routing active via ${captureModeLabel}: ${routingItemCount} ${label}, ${outboundLabel}`);
  }

  if (captureEnabled) {
    const defaultOutbound = proxyMode === 'direct' ? 'direct' : displaySystemDefaultOutbound;
    const fallbackOutbound = normalizeDisplayOutbound(systemFallback?.outbound || systemRule?.outbound || route.final || defaultOutbound);
    lines.push(`[Routing] unmatched capture traffic (${captureModeLabel}) -> ${fallbackOutbound}`);
  }

  if (Array.isArray(routingItems) && routingItems.length) {
    routingItems.forEach((item, index) => {
      if (item.kind === 'rule') {
        lines.push(`[Routing] item ${index + 1}: rule ${item.type}=${item.value} -> ${item.action}${item.note ? ` (${item.note})` : ''}`);
      } else if (item.kind === 'builtin_ruleset') {
        const targetLabel = item.target === 'node' ? `node:${item.nodeId}` : item.target === 'node_group' ? `node_group:${item.groupId}` : item.target;
        lines.push(`[Routing] item ${index + 1}: builtin ${item.presetId} -> ${targetLabel}`);
      } else if (item.kind === 'custom_entry') {
        const targetLabel = item.target === 'node' ? `node:${item.nodeId}` : item.target === 'node_group' ? `node_group:${item.groupId}` : item.target;
        lines.push(`[Routing] item ${index + 1}: custom ${item.type}=${item.value} -> ${targetLabel}`);
      }
    });
  } else {
    if (Array.isArray(customRules) && customRules.length) {
      customRules.forEach((rule, index) => {
        lines.push(`[Routing] rule ${index + 1}: ${rule.type}=${rule.value} -> ${rule.action}${rule.note ? ` (${rule.note})` : ''}`);
      });
    } else {
      lines.push('[Routing] no manual rules configured');
    }

    if (Array.isArray(rulesets) && rulesets.length) {
      rulesets.filter((ruleset) => ruleset.enabled !== false).forEach((ruleset) => {
        const targetLabel = ruleset.target === 'node' ? `node:${ruleset.nodeId}` : ruleset.target;
        lines.push(`[Routing] ruleset ${ruleset.name || ruleset.id} -> ${targetLabel}`);
      });
    } else {
      lines.push('[Routing] no rulesets configured');
    }
  }

  return lines;
};

export const resolveRoutingHit = (routingHitMap, ruleTag, host, outboundTag, options = {}) => {
  const allowHeuristic = Boolean(options.allowHeuristic);
  const rawTag = String(ruleTag || '').trim();
  if (rawTag) {
    const tokens = rawTag.split(/[\s,|;]+/u).filter(Boolean);
    for (const token of tokens) {
      const direct = routingHitMap.get(token);
      if (direct) {
        return {
          ...direct,
          matchedTag: token,
          matchedBy: 'tag'
        };
      }

      for (const [registeredTag, meta] of routingHitMap.entries()) {
        if (token.includes(registeredTag) || registeredTag.includes(token)) {
          return {
            ...meta,
            matchedTag: registeredTag,
            matchedBy: 'tag-fuzzy'
          };
        }
      }
    }
  }

  if (!allowHeuristic) {
    return null;
  }

  const value = String(host || '').toLowerCase();
  if (!value) return null;

  for (const [, meta] of routingHitMap.entries()) {
    if (meta.kind === 'rule') {
      const descriptor = meta.descriptor || '';
      const [type, expectedRaw] = descriptor.split('=');
      const expected = String(expectedRaw || '').toLowerCase();
      if (!expected) continue;
      const outboundMatches = meta.target === 'direct' ? outboundTag === 'direct' : outboundTag === meta.target;
      if (!outboundMatches) continue;

      if ((type === 'domain' && value === expected)
        || (type === 'domain_suffix' && (value === expected || value.endsWith(`.${expected}`)))
        || (type === 'domain_keyword' && value.includes(expected))) {
        return {
          ...meta,
          matchedBy: 'host-heuristic'
        };
      }
    }

    if (meta.kind === 'ruleset') {
      const outboundMatches = meta.target === 'direct' ? outboundTag === 'direct' : outboundTag === meta.target;
      if (!outboundMatches) continue;
      if (String(meta.descriptor || '').toLowerCase().includes('youtube') && value.includes('youtube')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('google') && value.includes('google')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('github') && value.includes('github')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('telegram') && value.includes('telegram')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('tiktok') && value.includes('tiktok')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('netflix') && value.includes('netflix')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('paypal') && value.includes('paypal')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('steam') && value.includes('steam')) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('microsoft') && (value.includes('microsoft') || value.includes('live.com') || value.includes('msauth.net') || value.includes('msftauth.net'))) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('onedrive') && (value.includes('onedrive') || value.includes('1drv.com'))) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('apple') && (value.includes('apple') || value.includes('icloud'))) return { ...meta, matchedBy: 'host-heuristic' };
      if (String(meta.descriptor || '').toLowerCase().includes('ai') && (value.includes('openai') || value.includes('anthropic') || value.includes('claude.ai') || value.includes('midjourney'))) return { ...meta, matchedBy: 'host-heuristic' };
    }
  }

  return null;
};

export const handleProxyRuntimeLine = (context, line, options = {}) => {
  const cleanLine = context.stripAnsi(line).replace(/^\[Proxy STDERR\]\s*/u, '');
  // Capture inbounds: system HTTP/SOCKS and TUN.
  // HTTP/SOCKS: "inbound/http[system-http]: inbound connection to host:port"
  // TUN often logs differently; also accept any inbound/*[tun-in] line with host:port.
  const inboundMatch = cleanLine.match(/\[(\d+)\s+[^\]]+\].*inbound[\\/](?:http|mixed|socks|tun)\[(system-http|system-socks|tun-in)\]:.*?(?:inbound connection to|connection (?:to|from) )(.+):(\d+)/u)
    || cleanLine.match(/\[(\d+)\s+[^\]]+\].*inbound[\\/]tun\[(tun-in)\].*?(\d{1,3}(?:\.\d{1,3}){3}|\[?[0-9a-fA-F:]+\]?):(\d+)/u);
  if (inboundMatch) {
    const [, connId, inboundTag, host, port] = inboundMatch;
    const trace = context.connectionTraceMap.get(connId) || {};
    context.connectionTraceMap.set(connId, {
      ...trace,
      inboundTag,
      host: String(host || '').replace(/^\[|\]$/g, ''),
      port,
      ruleTag: trace.ruleTag || null,
      createdAt: trace.createdAt || Date.now()
    });
  }

  // TUN may only expose match/outbound lines without a prior "inbound connection" line.
  // Seed a capture trace from router match lines that mention tun-in.
  const tunMatchSeed = cleanLine.match(/\[(\d+)\s+[^\]]+\].*router: match(?:\[(\d+)\])?.*inbound=\[([^\]]*)\].*=>\s+route\(([^)]+)\)/u);
  if (tunMatchSeed) {
    const [, connId, ruleIndex, inboundList, outboundTag] = tunMatchSeed;
    const inbounds = String(inboundList || '').split(/\s+/).filter(Boolean);
    const isCapture = inbounds.some((tag) => ['system-http', 'system-socks', 'tun-in'].includes(tag));
    if (isCapture) {
      const trace = context.connectionTraceMap.get(connId) || { createdAt: Date.now(), ruleTag: null };
      if (!trace.inboundTag) {
        trace.inboundTag = inbounds.includes('tun-in')
          ? 'tun-in'
          : (inbounds.find((tag) => tag === 'system-http' || tag === 'system-socks') || inbounds[0]);
      }
      if (ruleIndex != null) {
        const indexedRule = context.routingRuleIndexMap.get(String(ruleIndex));
        if (indexedRule) trace.ruleTag = indexedRule.ruleTag;
      }
      trace.outboundTag = outboundTag;
      context.connectionTraceMap.set(connId, trace);
    }
  }

  const sniffMatch = cleanLine.match(/\[(\d+)\s+[^\]]+\].*router: sniffed protocol: [^,]+, domain: (\S+)/u);
  if (sniffMatch) {
    const [, connId, host] = sniffMatch;
    const trace = context.connectionTraceMap.get(connId) || { createdAt: Date.now(), ruleTag: null };
    trace.sniffedHost = host;
    context.connectionTraceMap.set(connId, trace);
  }

  const indexedRuleMatch = cleanLine.match(/\[(\d+)\s+[^\]]+\].*router: match\[(\d+)\].*=>\s+route\(([^)]+)\)/u);
  if (indexedRuleMatch) {
    const [, connId, ruleIndex, outboundTag] = indexedRuleMatch;
    const trace = context.connectionTraceMap.get(connId) || { createdAt: Date.now(), ruleTag: null };
    const indexedRule = context.routingRuleIndexMap.get(ruleIndex);
    if (indexedRule) trace.ruleTag = indexedRule.ruleTag;
    trace.outboundTag = outboundTag;
    context.connectionTraceMap.set(connId, trace);
  }

  const ruleMatch = cleanLine.match(/\[(\d+)\s+[^\]]+\].*match(?:ed)?\s+rule(?:[_\s-]?set)?[^\[]*\[([^\]]+)\]/iu);
  if (ruleMatch) {
    const [, connId, ruleTag] = ruleMatch;
    const trace = context.connectionTraceMap.get(connId);
    if (trace) {
      trace.ruleTag = String(ruleTag || '').trim();
      context.connectionTraceMap.set(connId, trace);
    }
  }

  const outboundMatch = cleanLine.match(/\[(\d+)\s+[^\]]+\].*outbound[\\/][^\[]+\[(out-[^\]]+)\]: outbound connection to (.+):(\d+)$/u);
  if (outboundMatch) {
    const [, connId, outboundTag, host] = outboundMatch;
    const trace = context.connectionTraceMap.get(connId);
    if (trace && trace.inboundTag && ['system-http', 'system-socks', 'tun-in'].includes(trace.inboundTag)) {
      const resolvedOutboundTag = trace.outboundTag && trace.outboundTag.startsWith('out-') ? trace.outboundTag : outboundTag;
      const hit = context.resolveRoutingHit(trace.ruleTag, trace.sniffedHost || trace.host || host, resolvedOutboundTag, { allowHeuristic: true });
      if (hit) {
        const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        context.log.log(`[${ts}] [Routing Hit] ${hit.kind}:${hit.name} -> ${hit.target} | ${hit.descriptor}`);
        if (context.onRoutingHit) {
          try {
            context.onRoutingHit({
              timestamp: new Date().toISOString(),
              host: trace.sniffedHost || trace.host || host || null,
              port: trace.port ? Number(trace.port) : null,
              outbound: resolvedOutboundTag,
              kind: hit.kind,
              name: hit.name,
              target: hit.target,
              descriptor: hit.descriptor,
              matchedTag: hit.matchedTag || null,
              matchedBy: hit.matchedBy || null,
              matchType: hit.matchType || null,
              matchValue: hit.matchValue || null
            });
          } catch {
            // ignore hook failures to keep proxy runtime stable
          }
        }
      }
    }
    context.connectionTraceMap.delete(connId);
  }

  if (options.logRaw !== false) {
    context.log.log(`[Proxy Log] ${line}`);
  }
};
