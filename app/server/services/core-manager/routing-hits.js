import fs from 'fs';

import { getNodeGroupOutboundTag } from '../../../proxy/ProxyService.js';
import {
  getNodeDisplayName,
  getNodeGroupSelectedNodeId,
  normalizeCountryCode,
  normalizeIsoTimestamp,
  ROUTING_HIT_HISTORY_LIMIT,
  ROUTING_HIT_READ_LIMIT
} from './state-utils.js';

export const createRoutingHitDisplayContext = (settings = {}, nodes = []) => ({
  settings,
  nodes,
  nodeMap: new Map(nodes.map((node) => [`out-${node.id}`, node])),
  groupMap: new Map((settings.nodeGroups || []).map((group) => [getNodeGroupOutboundTag(group.id), group]))
});

export const getRoutingHitGroupDisplayName = (group, options = {}) => {
  if (!group || typeof group !== 'object') {
    return '';
  }

  const resolveCountryName = typeof options.resolveCountryName === 'function'
    ? options.resolveCountryName
    : () => null;
  const explicitCountryCode = normalizeCountryCode(group.countryCode);
  if (explicitCountryCode) {
    return resolveCountryName(explicitCountryCode) || explicitCountryCode;
  }

  const normalizedName = String(group.name || '').trim();
  const nameCountryCode = normalizedName.match(/^国家\/([A-Za-z]{2})$/u)?.[1];
  if (nameCountryCode) {
    const normalized = normalizeCountryCode(nameCountryCode);
    if (normalized) {
      return resolveCountryName(normalized) || normalized;
    }
  }

  const idCountryCode = String(group.id || '').trim().match(/^country-auto-([a-z]{2})$/u)?.[1];
  if (idCountryCode) {
    const normalized = normalizeCountryCode(idCountryCode);
    if (normalized) {
      return resolveCountryName(normalized) || normalized;
    }
  }

  return normalizedName || String(group.id || '').trim();
};

export const decorateRoutingHitEntry = (entry, context = createRoutingHitDisplayContext(), options = {}) => {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  const outbound = String(entry.outbound || '').trim();
  const target = String(entry.target || '').trim();
  const outboundNode = context.nodeMap.get(outbound) || null;
  const targetGroup = context.groupMap.get(target) || null;
  const outboundGroup = context.groupMap.get(outbound) || null;
  const activeGroup = targetGroup || outboundGroup || null;
  const selectedNodeId = activeGroup ? getNodeGroupSelectedNodeId(activeGroup) : null;
  const selectedNode = selectedNodeId
    ? context.nodes.find((node) => node.id === selectedNodeId) || null
    : null;
  const effectiveNode = outboundNode || selectedNode;
  const groupName = activeGroup ? getRoutingHitGroupDisplayName(activeGroup, options) : null;
  const nodeName = effectiveNode ? getNodeDisplayName(effectiveNode, outbound || target) : null;
  const outboundName = activeGroup && nodeName
    ? `${groupName} -> ${nodeName}`
    : activeGroup
      ? groupName
      : outboundNode
        ? nodeName
        : String(entry.outboundName || '').trim() || outbound || target;
  const targetName = activeGroup
    ? groupName
    : target === 'direct'
      ? 'direct'
      : getNodeDisplayName(context.nodeMap.get(target), target) || target;

  return {
    ...entry,
    outboundName,
    targetName,
    effectiveOutbound: effectiveNode ? `out-${effectiveNode.id}` : outbound || null,
    effectiveNodeId: effectiveNode?.id || null,
    effectiveNodeName: nodeName,
    nodeGroupId: activeGroup?.id || null,
    nodeGroupName: groupName
  };
};

export const normalizeRoutingHitHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const timestamp = normalizeIsoTimestamp(entry.timestamp) || new Date().toISOString();
  const host = String(entry.host || '').trim();
  const kind = String(entry.kind || '').trim();
  const name = String(entry.name || '').trim();
  const target = String(entry.target || '').trim();
  const descriptor = String(entry.descriptor || '').trim();
  if (!host || !kind || !name || !target) {
    return null;
  }

  const outbound = String(entry.outbound || '').trim();
  const portParsed = Number.parseInt(entry.port, 10);

  return {
    timestamp,
    host,
    port: Number.isInteger(portParsed) && portParsed > 0 ? portParsed : null,
    outbound,
    outboundName: entry.outboundName ? String(entry.outboundName).trim() : null,
    kind,
    name,
    target,
    targetName: entry.targetName ? String(entry.targetName).trim() : null,
    descriptor,
    matchedTag: entry.matchedTag ? String(entry.matchedTag).trim() : null,
    matchedBy: entry.matchedBy ? String(entry.matchedBy).trim() : null,
    matchType: entry.matchType ? String(entry.matchType).trim() : null,
    matchValue: entry.matchValue ? String(entry.matchValue).trim() : null,
    effectiveOutbound: entry.effectiveOutbound ? String(entry.effectiveOutbound).trim() : null,
    effectiveNodeId: entry.effectiveNodeId ? String(entry.effectiveNodeId).trim() : null,
    effectiveNodeName: entry.effectiveNodeName ? String(entry.effectiveNodeName).trim() : null,
    nodeGroupId: entry.nodeGroupId ? String(entry.nodeGroupId).trim() : null,
    nodeGroupName: entry.nodeGroupName ? String(entry.nodeGroupName).trim() : null,
    persisted: true
  };
};

export const readRoutingHitHistory = (historyPath, options = {}) => {
  const limit = options.limit ?? ROUTING_HIT_READ_LIMIT;
  const context = options.context || createRoutingHitDisplayContext();
  try {
    const lines = fs.readFileSync(historyPath, 'utf8').split(/\r?\n/u).filter(Boolean);
    return lines
      .slice(-Math.max(1, limit))
      .map((line) => {
        try {
          const parsed = normalizeRoutingHitHistoryEntry(JSON.parse(line));
          return parsed ? decorateRoutingHitEntry(parsed, context, options) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const appendRoutingHitHistory = (historyPath, entry, options = {}) => {
  const normalized = normalizeRoutingHitHistoryEntry(decorateRoutingHitEntry(entry, options.context, options));
  if (!normalized) {
    return;
  }

  fs.appendFileSync(historyPath, `${JSON.stringify(normalized)}\n`);
  const lines = fs.readFileSync(historyPath, 'utf8').split(/\r?\n/u).filter(Boolean);
  if (lines.length > ROUTING_HIT_HISTORY_LIMIT) {
    fs.writeFileSync(historyPath, `${lines.slice(-ROUTING_HIT_HISTORY_LIMIT).join('\n')}\n`);
  }
};
