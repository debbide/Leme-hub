import { createHttpError, normalizeCountryCode, normalizeIsoTimestamp } from './common.js';

const buildCountryGroupName = (countryCode) => `国家/${countryCode}`;

const AUTO_COUNTRY_NODE_GROUP_PREFIX = 'country-auto-';

const NODE_GROUP_TYPES = ['custom', 'country'];

const NODE_GROUP_ICON_MODES = ['auto', 'emoji', 'none'];

const NODE_GROUP_AUTO_TEST_MIN_SEC = 60;

const NODE_GROUP_AUTO_TEST_MAX_SEC = 3600;

const NODE_GROUP_AUTO_TEST_DEFAULT_SEC = 300;

const NODE_GROUP_AUTO_TEST_TICK_MS = 15000;

const NODE_GROUP_SWITCH_DELTA_MS = 120;

const NODE_GROUP_SWITCH_COOLDOWN_MS = 15 * 60 * 1000;

const NODE_GROUP_SWITCH_FAIL_THRESHOLD = 3;

const SYSTEM_PROXY_AUTO_SWITCH_MIN_SEC = 60;

const SYSTEM_PROXY_AUTO_SWITCH_MAX_SEC = 86400;

const SYSTEM_PROXY_AUTO_SWITCH_DEFAULT_SEC = 600;

const SYSTEM_PROXY_AUTO_SWITCH_TICK_MS = 15000;

const normalizeNodeGroupAutoTestIntervalSec = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return NODE_GROUP_AUTO_TEST_DEFAULT_SEC;
  }
  return Math.min(NODE_GROUP_AUTO_TEST_MAX_SEC, Math.max(NODE_GROUP_AUTO_TEST_MIN_SEC, parsed));
};

const normalizeSystemProxyAutoSwitchIntervalSec = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return SYSTEM_PROXY_AUTO_SWITCH_DEFAULT_SEC;
  }

  return Math.min(SYSTEM_PROXY_AUTO_SWITCH_MAX_SEC, Math.max(SYSTEM_PROXY_AUTO_SWITCH_MIN_SEC, parsed));
};

const getNodeGroupById = (nodeGroups = [], groupId = null) => {
  const normalizedGroupId = groupId == null ? null : String(groupId).trim();
  if (!normalizedGroupId) {
    return null;
  }

  return nodeGroups.find((group) => group.id === normalizedGroupId) || null;
};

const getNodeGroupSelectedNodeId = (group) => {
  const selectedNodeId = group?.selectedNodeId == null ? null : String(group.selectedNodeId).trim();
  if (!selectedNodeId) {
    return null;
  }

  return Array.isArray(group?.nodeIds) && group.nodeIds.includes(selectedNodeId) ? selectedNodeId : null;
};

const hasExistingNodeGroup = (nodeGroups = [], groupId = null) => Boolean(getNodeGroupById(nodeGroups, groupId));

const normalizeSystemProxyAutoSwitchSettings = (settings = {}, nodeGroups = [], options = {}) => {
  const { strict = false } = options;
  const requestedEnabled = !!settings.systemProxyAutoSwitchEnabled;
  const requestedGroupId = settings.systemProxyAutoSwitchGroupId == null
    ? null
    : String(settings.systemProxyAutoSwitchGroupId).trim() || null;
  const group = getNodeGroupById(nodeGroups, requestedGroupId);
  const selectedNodeId = getNodeGroupSelectedNodeId(group);

  if (strict && requestedEnabled) {
    if (!requestedGroupId) {
      throw createHttpError('systemProxyAutoSwitchGroupId is required when auto switch is enabled', 400);
    }
    if (!group) {
      throw createHttpError('systemProxyAutoSwitchGroupId must reference an existing node group', 400);
    }
    if (!selectedNodeId) {
      throw createHttpError('systemProxyAutoSwitchGroupId must reference a node group with an active node', 400);
    }
  }

  return {
    enabled: requestedEnabled && Boolean(selectedNodeId),
    groupId: group ? group.id : null,
    intervalSec: normalizeSystemProxyAutoSwitchIntervalSec(settings.systemProxyAutoSwitchIntervalSec),
    lastAt: normalizeIsoTimestamp(settings.systemProxyAutoSwitchLastAt),
    group,
    selectedNodeId
  };
};

const normalizeNodeGroupLatencyCache = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  const inputResults = input.results && typeof input.results === 'object' ? input.results : {};
  const results = {};

  Object.entries(inputResults).forEach(([nodeId, entry]) => {
    const id = String(nodeId || '').trim();
    if (!id || !entry || typeof entry !== 'object') {
      return;
    }

    const ok = Boolean(entry.ok);
    const normalized = {
      ok,
      latencyMs: null,
      error: null,
      updatedAt: normalizeIsoTimestamp(entry.updatedAt)
    };

    if (ok) {
      const latencyMs = Number.parseInt(entry.latencyMs, 10);
      if (!Number.isInteger(latencyMs) || latencyMs < 0) {
        return;
      }
      normalized.latencyMs = latencyMs;
    } else {
      const error = String(entry.error || '').trim();
      normalized.error = error ? error.slice(0, 160) : 'failed';
    }

    results[id] = normalized;
  });

  return {
    updatedAt: normalizeIsoTimestamp(input.updatedAt),
    results
  };
};

const normalizeNodeGroup = (group, index, nodes) => {
  if (!group || typeof group !== 'object') {
    throw createHttpError(`nodeGroups[${index}] must be an object`, 400);
  }

  const id = String(group.id || `node-group-${index + 1}`).trim();
  const type = NODE_GROUP_TYPES.includes(String(group.type || '').trim())
    ? String(group.type || '').trim()
    : 'custom';
  const countryCode = normalizeCountryCode(group.countryCode);
  const iconMode = NODE_GROUP_ICON_MODES.includes(String(group.iconMode || '').trim())
    ? String(group.iconMode || '').trim()
    : 'auto';
  const iconEmoji = typeof group.iconEmoji === 'string' ? group.iconEmoji.trim().slice(0, 4) : '';
  const note = typeof group.note === 'string' ? group.note.trim().slice(0, 200) : '';

  const name = String(group.name || '').trim() || (type === 'country' && countryCode ? buildCountryGroupName(countryCode) : '');
  if (!name) throw createHttpError(`nodeGroups[${index}] must include a name`, 400);

  const validNodeIds = new Set(nodes.map((node) => node.id));
  const nodeIds = Array.isArray(group.nodeIds)
    ? [...new Set(group.nodeIds.map((value) => String(value || '').trim()).filter((id) => validNodeIds.has(id)))]
    : [];

  const selectedNodeId = group.selectedNodeId == null ? null : String(group.selectedNodeId).trim();
  if (selectedNodeId && !nodeIds.includes(selectedNodeId)) {
    throw createHttpError(`nodeGroups[${index}] selectedNodeId must belong to nodeIds`, 400);
  }

  return {
    id,
    name,
    type,
    countryCode,
    iconMode,
    iconEmoji,
    note,
    nodeIds,
    selectedNodeId: selectedNodeId || nodeIds[0] || null
  };
};

const normalizeNodeGroups = (nodeGroups, nodes) => {
  const normalized = nodeGroups.map((group, index) => normalizeNodeGroup(group, index, nodes));
  const seenIds = new Set();
  const seenNames = new Set();
  normalized.forEach((group, index) => {
    if (seenIds.has(group.id)) throw createHttpError(`nodeGroups[${index}] duplicates another group id`, 400);
    const lowerName = group.name.toLowerCase();
    if (seenNames.has(lowerName)) throw createHttpError(`nodeGroups[${index}] duplicates another group name`, 400);
    seenIds.add(group.id);
    seenNames.add(lowerName);
  });
  return normalized;
};

export {
  AUTO_COUNTRY_NODE_GROUP_PREFIX,
  NODE_GROUP_AUTO_TEST_TICK_MS,
  NODE_GROUP_ICON_MODES,
  NODE_GROUP_SWITCH_COOLDOWN_MS,
  NODE_GROUP_SWITCH_DELTA_MS,
  NODE_GROUP_SWITCH_FAIL_THRESHOLD,
  NODE_GROUP_TYPES,
  SYSTEM_PROXY_AUTO_SWITCH_TICK_MS,
  buildCountryGroupName,
  getNodeGroupById,
  getNodeGroupSelectedNodeId,
  hasExistingNodeGroup,
  normalizeNodeGroupAutoTestIntervalSec,
  normalizeNodeGroupLatencyCache,
  normalizeNodeGroups,
  normalizeSystemProxyAutoSwitchIntervalSec,
  normalizeSystemProxyAutoSwitchSettings
};
