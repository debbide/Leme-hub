import fs from 'fs';
import path from 'path';

import { SingBoxBinaryManager } from '../../proxy/SingBoxBinaryManager.js';
import { ProxyService } from '../../proxy/ProxyService.js';
import { BUILTIN_RULESETS, CUSTOM_RULE_ACTIONS, CUSTOM_RULE_TYPES, ROUTING_MODES, RULESET_KINDS, RULESET_TARGETS } from '../../shared/constants.js';
import { AutoStartManager } from './AutoStartManager.js';
import { ConnectionsService } from './ConnectionsService.js';
import { GeoIpService, geoFlagFromCountryCode } from './GeoIpService.js';
import { RulesetDatabaseService } from './RulesetDatabaseService.js';
import { SystemProxyManager } from './SystemProxyManager.js';

const createHttpError = (message, status) => Object.assign(new Error(message), { status });

const createNodeId = () => Math.random().toString(36).slice(2, 10);

const getNodeSignature = (node) => [
  node.type || '',
  node.server || '',
  node.port || '',
  node.uuid || '',
  node.password || '',
  node.method || ''
].join('|');

const validatePort = (value, fieldName) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw createHttpError(`${fieldName} must be a valid TCP port`, 400);
  }

  return parsed;
};

const normalizeCountryCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : null;
};

const buildCountryGroupName = (countryCode) => `国家/${countryCode}`;
const AUTO_COUNTRY_NODE_GROUP_PREFIX = 'country-auto-';
const NODE_GROUP_TYPES = ['custom', 'country'];
const NODE_GROUP_ICON_MODES = ['auto', 'emoji', 'none'];
const NODE_GROUP_AUTO_TEST_MIN_SEC = 60;
const NODE_GROUP_AUTO_TEST_MAX_SEC = 3600;
const NODE_GROUP_AUTO_TEST_DEFAULT_SEC = 300;

const normalizeIsoTimestamp = (value) => {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
};

const normalizeNodeGroupAutoTestIntervalSec = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return NODE_GROUP_AUTO_TEST_DEFAULT_SEC;
  }
  return Math.min(NODE_GROUP_AUTO_TEST_MAX_SEC, Math.max(NODE_GROUP_AUTO_TEST_MIN_SEC, parsed));
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

const ROUTING_HIT_HISTORY_LIMIT = 2000;
const ROUTING_HIT_READ_LIMIT = 300;

const pickConnectionBytes = (connection, keys) => {
  for (const key of keys) {
    const value = connection?.[key] ?? connection?.metadata?.[key] ?? connection?.stats?.[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
};

const pickConnectionTimestamp = (connection) => {
  const candidates = [
    connection?.timestamp,
    connection?.time,
    connection?.start,
    connection?.startAt,
    connection?.startedAt,
    connection?.createdAt,
    connection?.metadata?.timestamp,
    connection?.metadata?.time,
    connection?.metadata?.start,
    connection?.metadata?.createdAt
  ];

  for (const value of candidates) {
    const normalized = normalizeIsoTimestamp(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const isValidIpv4Cidr = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,3})(?:\.(\d{1,3}))(?:\.(\d{1,3}))(?:\.(\d{1,3}))\/(\d|[12]\d|3[0-2])$/);
  if (!match) {
    return false;
  }

  return match.slice(1, 5).every((part) => Number(part) >= 0 && Number(part) <= 255);
};

const normalizeCustomRule = (rule, index, nodeGroups = []) => {
  if (!rule || typeof rule !== 'object') {
    throw createHttpError(`customRules[${index}] must be an object`, 400);
  }

  const type = String(rule.type || '').trim();
  const action = String(rule.action || '').trim();
  const value = String(rule.value || '').trim();
  const nodeId = rule.nodeId == null || rule.nodeId === '' ? null : String(rule.nodeId).trim();
  const nodeGroupId = rule.nodeGroupId == null || rule.nodeGroupId === '' ? null : String(rule.nodeGroupId).trim();

  if (!CUSTOM_RULE_TYPES.includes(type)) {
    throw createHttpError(`customRules[${index}] has invalid type`, 400);
  }

  if (!CUSTOM_RULE_ACTIONS.includes(action)) {
    throw createHttpError(`customRules[${index}] has invalid action`, 400);
  }

  if (action === 'node' && !nodeId) {
    throw createHttpError(`customRules[${index}] target=node requires nodeId`, 400);
  }
  if (action === 'node_group' && !nodeGroupId) {
    throw createHttpError(`customRules[${index}] target=node_group requires nodeGroupId`, 400);
  }
  if (action === 'node_group' && nodeGroupId && !nodeGroups.some((group) => group.id === nodeGroupId && group.selectedNodeId)) {
    throw createHttpError(`customRules[${index}] target=node_group requires a valid selected group node`, 400);
  }

  if (!value) {
    throw createHttpError(`customRules[${index}] must include a value`, 400);
  }

  if (type === 'ip_cidr' && !isValidIpv4Cidr(value)) {
    throw createHttpError(`customRules[${index}] must include a valid IPv4 CIDR`, 400);
  }

  return {
    id: rule.id || `rule-${index + 1}`,
    type,
    action,
    nodeId,
    nodeGroupId,
    value,
    note: typeof rule.note === 'string' ? rule.note.trim() : ''
  };
};

const normalizeCustomRules = (rules, nodeGroups = []) => {
  const normalizedRules = rules.map((rule, index) => normalizeCustomRule(rule, index, nodeGroups));
  const seen = new Map();

  normalizedRules.forEach((rule, index) => {
    const signature = `${rule.type}|${rule.action}|${rule.nodeId || ''}|${rule.nodeGroupId || ''}|${rule.value.toLowerCase()}`;
    if (seen.has(signature)) {
      throw createHttpError(`customRules[${index}] duplicates customRules[${seen.get(signature)}]`, 400);
    }
    seen.set(signature, index);
  });

  return normalizedRules;
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

const BUILTIN_RULESET_MAP = new Map(BUILTIN_RULESETS.map((ruleset) => [ruleset.id, ruleset]));

const normalizeRulesetEntry = (entry, index, rulesetIndex) => {
  if (!entry || typeof entry !== 'object') {
    throw createHttpError(`rulesets[${rulesetIndex}].entries[${index}] must be an object`, 400);
  }

  const type = String(entry.type || '').trim();
  const value = String(entry.value || '').trim();
  if (!CUSTOM_RULE_TYPES.includes(type)) {
    throw createHttpError(`rulesets[${rulesetIndex}].entries[${index}] has invalid type`, 400);
  }
  if (!value) {
    throw createHttpError(`rulesets[${rulesetIndex}].entries[${index}] must include a value`, 400);
  }
  if (type === 'ip_cidr' && !isValidIpv4Cidr(value)) {
    throw createHttpError(`rulesets[${rulesetIndex}].entries[${index}] must include a valid IPv4 CIDR`, 400);
  }

  return {
    id: entry.id || `entry-${index + 1}`,
    type,
    value,
    note: typeof entry.note === 'string' ? entry.note.trim() : ''
  };
};

const normalizeRuleset = (ruleset, index, nodeGroups = []) => {
  if (!ruleset || typeof ruleset !== 'object') {
    throw createHttpError(`rulesets[${index}] must be an object`, 400);
  }

  const kind = String(ruleset.kind || '').trim();
  const target = String(ruleset.target || '').trim();
  const id = String(ruleset.id || `ruleset-${index + 1}`).trim();
  const presetId = ruleset.presetId == null ? null : String(ruleset.presetId).trim();
  const nodeId = ruleset.nodeId == null || ruleset.nodeId === '' ? null : String(ruleset.nodeId).trim();
  const groupId = ruleset.groupId == null || ruleset.groupId === '' ? null : String(ruleset.groupId).trim();

  if (!RULESET_KINDS.includes(kind)) {
    throw createHttpError(`rulesets[${index}] has invalid kind`, 400);
  }
  if (!RULESET_TARGETS.includes(target)) {
    throw createHttpError(`rulesets[${index}] has invalid target`, 400);
  }
  if (target === 'node' && !nodeId) {
    throw createHttpError(`rulesets[${index}] target=node requires nodeId`, 400);
  }
  if (target === 'node_group' && !groupId) {
    throw createHttpError(`rulesets[${index}] target=node_group requires groupId`, 400);
  }
  if (target === 'node_group' && groupId && !nodeGroups.some((group) => group.id === groupId && group.selectedNodeId)) {
    throw createHttpError(`rulesets[${index}] target=node_group requires a valid selected group node`, 400);
  }

  if (kind === 'builtin') {
    if (!presetId || !BUILTIN_RULESET_MAP.has(presetId)) {
      throw createHttpError(`rulesets[${index}] has invalid presetId`, 400);
    }

    return {
      id,
      kind,
      presetId,
      name: String(ruleset.name || BUILTIN_RULESET_MAP.get(presetId).name).trim() || BUILTIN_RULESET_MAP.get(presetId).name,
      enabled: ruleset.enabled !== false,
      target,
      nodeId,
      groupId,
      entries: [],
      note: typeof ruleset.note === 'string' ? ruleset.note.trim() : ''
    };
  }

  if (!Array.isArray(ruleset.entries) || !ruleset.entries.length) {
    throw createHttpError(`rulesets[${index}] custom entries must be a non-empty array`, 400);
  }

  const entries = ruleset.entries.map((entry, entryIndex) => normalizeRulesetEntry(entry, entryIndex, index));
  const seenEntries = new Set();
  entries.forEach((entry, entryIndex) => {
    const signature = `${entry.type}|${entry.value.toLowerCase()}`;
    if (seenEntries.has(signature)) {
      throw createHttpError(`rulesets[${index}].entries[${entryIndex}] duplicates another entry`, 400);
    }
    seenEntries.add(signature);
  });

  return {
    id,
    kind,
    presetId: null,
    name: String(ruleset.name || '').trim() || `Custom Ruleset ${index + 1}`,
    enabled: ruleset.enabled !== false,
    target,
    nodeId,
    groupId,
    entries,
    note: typeof ruleset.note === 'string' ? ruleset.note.trim() : ''
  };
};

const normalizeRulesets = (rulesets, nodeGroups = []) => {
  const normalized = rulesets.map((ruleset, index) => normalizeRuleset(ruleset, index, nodeGroups));
  const seenIds = new Set();
  normalized.forEach((ruleset, index) => {
    if (seenIds.has(ruleset.id)) {
      throw createHttpError(`rulesets[${index}] duplicates another ruleset id`, 400);
    }
    seenIds.add(ruleset.id);
  });
  return normalized;
};

const normalizeSubscriptionRecord = (record, index) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const url = String(record.url || '').trim();
  if (!url) {
    return null;
  }

  return {
    id: record.id || `subscription-${index + 1}`,
    url,
    name: String(record.name || '').trim() || url,
    groupName: String(record.groupName || '').trim() || null,
    importedCount: Number.parseInt(record.importedCount, 10) || 0,
    lastSyncedAt: record.lastSyncedAt || null,
    lastNodeCount: Number.parseInt(record.lastNodeCount, 10) || 0
  };
};

export const assignStableLocalPorts = (nodes, basePort) => {
  const occupied = new Set();
  let nextPort = basePort;

  for (const node of nodes) {
    const parsed = Number.parseInt(node.local_port, 10);
    if (Number.isInteger(parsed) && parsed > 0 && !occupied.has(parsed)) {
      occupied.add(parsed);
    }
  }

  return nodes.map((node) => {
    const parsed = Number.parseInt(node.local_port, 10);
    if (Number.isInteger(parsed) && parsed > 0 && !occupied.has(parsed)) {
      occupied.add(parsed);
      return { ...node, local_port: parsed };
    }

    if (Number.isInteger(parsed) && parsed > 0) {
      return { ...node, local_port: parsed };
    }

    while (occupied.has(nextPort)) {
      nextPort += 1;
    }

    const assigned = nextPort;
    occupied.add(assigned);
    nextPort += 1;
    return { ...node, local_port: assigned };
  });
};

const mergeUniqueNodes = (existingNodes, incomingNodes) => {
  const seen = new Set(existingNodes.map((node) => node.id));
  const seenSignatures = new Set(existingNodes.map(getNodeSignature));
  const merged = [...existingNodes];

  for (const node of incomingNodes) {
    const withId = node.id ? node : { ...node, id: createNodeId() };
    const signature = getNodeSignature(withId);
    if (!seen.has(withId.id) && !seenSignatures.has(signature)) {
      merged.push(withId);
      seen.add(withId.id);
      seenSignatures.add(signature);
    }
  }

  return merged;
};

export class CoreManager {
  constructor(paths, store, options = {}) {
    this.paths = paths;
    this.store = store;
    this.options = options;
    this.state = {
      status: 'stopped',
      startedAt: null,
      lastError: null,
      executablePath: null,
      configPath: this.paths.configPath,
      binary: {
        status: 'missing',
        configuredPath: this.store.getSettings().singBoxBinaryPath,
        managedPath: this.paths.binDir,
        source: 'missing',
        lastError: null,
        version: null
      },
      systemProxy: {
        enabled: false,
        mode: 'unknown',
        provider: 'uninitialized',
        http: null,
        socks: null,
        lastError: null,
        supported: false,
        desiredEnabled: false
      },
      autoStart: {
        enabled: false,
        provider: 'uninitialized',
        supported: false,
        command: null,
        desiredEnabled: false
      }
    };

    this.binaryManager = new SingBoxBinaryManager(this.paths, {
      log: this.createLogger()
    });

    this.state.binary = this.buildBinaryState();
    this.systemProxyManager = new SystemProxyManager();
    this.state.systemProxy = this.buildSystemProxyState();
    this.autoStartManager = new AutoStartManager({
      env: options.env,
      executablePath: options.autoStartExecutablePath
    });
    this.state.autoStart = this.buildAutoStartState();
    this.geoIpService = new GeoIpService(this.paths, {
      log: this.createLogger()
    });
    this.rulesetDatabaseService = new RulesetDatabaseService(this.paths, {
      log: this.createLogger()
    });
    this.connectionsService = new ConnectionsService();
    const routingHitHistoryDir = this.paths.logsDir || this.paths.dataDir || this.paths.root;
    this.routingHitHistoryPath = path.join(routingHitHistoryDir, 'routing-hits.jsonl');
    if (!fs.existsSync(this.routingHitHistoryPath)) {
      fs.writeFileSync(this.routingHitHistoryPath, '');
    }

    this.proxyService = new ProxyService({
      configDir: this.paths.dataDir,
      projectRoot: this.paths.root,
      proxyListen: this.store.getSettings().proxyListenHost,
      basePort: this.store.getSettings().proxyBasePort,
      configFileName: this.paths.configPath.split(/[/\\]/).pop(),
      log: this.createLogger(),
      onRoutingHit: (hit) => this.appendRoutingHitHistory(hit)
    });
  }

  createLogger() {
    return {
      log: (message) => this.store.appendLog(message),
      error: (message) => this.store.appendLog(message),
      warn: (message) => this.store.appendLog(message)
    };
  }

  normalizeRoutingHitHistoryEntry(entry) {
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
      kind,
      name,
      target,
      descriptor,
      matchedTag: entry.matchedTag ? String(entry.matchedTag).trim() : null,
      matchedBy: entry.matchedBy ? String(entry.matchedBy).trim() : null,
      matchType: entry.matchType ? String(entry.matchType).trim() : null,
      matchValue: entry.matchValue ? String(entry.matchValue).trim() : null,
      persisted: true
    };
  }

  readRoutingHitHistory(limit = ROUTING_HIT_READ_LIMIT) {
    try {
      const lines = fs.readFileSync(this.routingHitHistoryPath, 'utf8').split(/\r?\n/).filter(Boolean);
      const normalized = lines
        .slice(-Math.max(1, limit))
        .map((line) => {
          try {
            return this.normalizeRoutingHitHistoryEntry(JSON.parse(line));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return normalized;
    } catch {
      return [];
    }
  }

  appendRoutingHitHistory(entry) {
    const normalized = this.normalizeRoutingHitHistoryEntry(entry);
    if (!normalized) {
      return;
    }

    try {
      fs.appendFileSync(this.routingHitHistoryPath, `${JSON.stringify(normalized)}\n`);
      const lines = fs.readFileSync(this.routingHitHistoryPath, 'utf8').split(/\r?\n/).filter(Boolean);
      if (lines.length > ROUTING_HIT_HISTORY_LIMIT) {
        fs.writeFileSync(this.routingHitHistoryPath, `${lines.slice(-ROUTING_HIT_HISTORY_LIMIT).join('\n')}\n`);
      }
    } catch (error) {
      this.store.appendLog(`[CoreManager] Failed to persist routing hit: ${error.message}`);
    }
  }

  getSettingsSnapshot() {
    const settings = this.store.getSettings();
    const normalizedSubscriptions = Array.isArray(settings.subscriptions)
      ? settings.subscriptions.map(normalizeSubscriptionRecord).filter(Boolean)
      : [];
    const normalizedNodeGroupAutoTestIntervalSec = normalizeNodeGroupAutoTestIntervalSec(settings.nodeGroupAutoTestIntervalSec);
    const normalizedNodeGroupLatencyCache = normalizeNodeGroupLatencyCache(settings.nodeGroupLatencyCache);

    if (settings.customRules === undefined) {
      return {
        ...settings,
        customRules: [],
        rulesets: [],
        nodeGroups: [],
        subscriptions: normalizedSubscriptions,
        nodeGroupAutoTestIntervalSec: normalizedNodeGroupAutoTestIntervalSec,
        nodeGroupLatencyCache: normalizedNodeGroupLatencyCache
      };
    }

    if (!Array.isArray(settings.customRules)) {
      this.store.appendLog('[CoreManager] Invalid customRules persisted in settings; resetting to []');
      return this.store.saveSettings({
        ...settings,
        customRules: []
      });
    }

    try {
      const nodes = this.store.getNodes();
      const normalizedNodeGroups = Array.isArray(settings.nodeGroups) ? normalizeNodeGroups(settings.nodeGroups, nodes) : [];
      const normalizedRules = normalizeCustomRules(settings.customRules, normalizedNodeGroups);
      const normalizedRulesets = Array.isArray(settings.rulesets) ? normalizeRulesets(settings.rulesets, normalizedNodeGroups) : [];
      if (JSON.stringify(settings.customRules) !== JSON.stringify(normalizedRules)) {
        return this.store.saveSettings({
          ...settings,
          customRules: normalizedRules,
          rulesets: normalizedRulesets,
          nodeGroups: normalizedNodeGroups,
          subscriptions: normalizedSubscriptions
        });
      }

      if (JSON.stringify(settings.rulesets || []) !== JSON.stringify(normalizedRulesets)) {
        return this.store.saveSettings({
          ...settings,
          customRules: normalizedRules,
          rulesets: normalizedRulesets,
          nodeGroups: normalizedNodeGroups,
          subscriptions: normalizedSubscriptions
        });
      }

      if (JSON.stringify(settings.nodeGroups || []) !== JSON.stringify(normalizedNodeGroups)) {
        return this.store.saveSettings({
          ...settings,
          customRules: normalizedRules,
          rulesets: normalizedRulesets,
          nodeGroups: normalizedNodeGroups,
          subscriptions: normalizedSubscriptions,
          nodeGroupAutoTestIntervalSec: normalizedNodeGroupAutoTestIntervalSec,
          nodeGroupLatencyCache: normalizedNodeGroupLatencyCache
        });
      }

      if (settings.nodeGroupAutoTestIntervalSec !== normalizedNodeGroupAutoTestIntervalSec || JSON.stringify(settings.nodeGroupLatencyCache || {}) !== JSON.stringify(normalizedNodeGroupLatencyCache)) {
        return this.store.saveSettings({
          ...settings,
          customRules: normalizedRules,
          rulesets: normalizedRulesets,
          nodeGroups: normalizedNodeGroups,
          subscriptions: normalizedSubscriptions,
          nodeGroupAutoTestIntervalSec: normalizedNodeGroupAutoTestIntervalSec,
          nodeGroupLatencyCache: normalizedNodeGroupLatencyCache
        });
      }

      return {
        ...settings,
        customRules: normalizedRules,
        rulesets: normalizedRulesets,
        nodeGroups: normalizedNodeGroups,
        subscriptions: normalizedSubscriptions,
        nodeGroupAutoTestIntervalSec: normalizedNodeGroupAutoTestIntervalSec,
        nodeGroupLatencyCache: normalizedNodeGroupLatencyCache
      };
    } catch (error) {
      this.store.appendLog(`[CoreManager] Invalid persisted routing settings ignored: ${error.message}`);
      return this.store.saveSettings({
        ...settings,
        customRules: [],
        rulesets: [],
        nodeGroups: [],
        subscriptions: normalizedSubscriptions,
        nodeGroupAutoTestIntervalSec: normalizedNodeGroupAutoTestIntervalSec,
        nodeGroupLatencyCache: normalizedNodeGroupLatencyCache
      });
    }
  }

  buildBinaryState(overrides = {}) {
    const settings = this.getSettingsSnapshot();
    const status = this.binaryManager.getStatus(settings.singBoxBinaryPath);

    return {
      status: status.ready ? 'ready' : 'missing',
      configuredPath: status.configuredPath,
      managedPath: status.managedPath,
      resolvedPath: status.configuredExists ? status.configuredPath : (status.managedExists ? status.managedPath : null),
      source: status.source,
      lastError: null,
      version: null,
      ...overrides
    };
  }

  buildSystemProxyState(overrides = {}) {
    const settings = this.getSettingsSnapshot();
    const capabilities = this.systemProxyManager.getCapabilities();

    return {
      enabled: false,
      mode: capabilities.supported ? 'off' : 'unsupported',
      provider: capabilities.provider,
      http: null,
      socks: null,
      lastError: null,
      supported: capabilities.supported,
      desiredEnabled: !!settings.systemProxyEnabled,
      ...overrides
    };
  }

  buildAutoStartState(overrides = {}) {
    const settings = this.getSettingsSnapshot();
    const capabilities = this.autoStartManager.getCapabilities();

    return {
      enabled: false,
      provider: capabilities.provider,
      supported: capabilities.supported,
      command: null,
      desiredEnabled: !!settings.autoStart,
      ...overrides
    };
  }

  resolveActiveNodeId(settings = this.store.getSettings(), nodes = this.store.getNodes()) {
    if (settings.activeNodeId && nodes.some((node) => node.id === settings.activeNodeId)) {
      return settings.activeNodeId;
    }

    return nodes[0]?.id || null;
  }

  getProxyProfile() {
    const settings = this.getSettingsSnapshot();
    const nodes = this.store.getNodes();
    const activeNodeId = this.resolveActiveNodeId(settings, nodes);
    const listenHost = settings.proxyListenHost;
    const unifiedSocksPort = settings.systemProxySocksPort;
    const unifiedHttpPort = settings.systemProxyHttpPort;

    return {
      mode: settings.routingMode,
      systemProxyEnabled: !!settings.systemProxyEnabled,
      activeNodeId,
      unifiedHttpPort,
      unifiedSocksPort,
      manualPortRangeStart: settings.proxyBasePort,
      listenHost,
      systemDefaultEndpoint: {
        protocol: 'http',
        host: listenHost,
        port: unifiedHttpPort,
        url: `http://${listenHost}:${unifiedHttpPort}`
      },
      httpCompatibilityEndpoint: {
        protocol: 'socks5',
        host: listenHost,
        port: unifiedSocksPort,
        url: `socks5://${listenHost}:${unifiedSocksPort}`
      },
      systemSocksEndpoint: {
        protocol: 'socks5',
        host: listenHost,
        port: unifiedSocksPort,
        url: `socks5://${listenHost}:${unifiedSocksPort}`
      },
      customRules: settings.customRules,
      rulesets: settings.rulesets || [],
      nodeGroups: settings.nodeGroups || [],
      activeNode: nodes.find((node) => node.id === activeNodeId) || null
    };
  }

  getBuiltinRulesets() {
    return [
      ...BUILTIN_RULESETS.map((ruleset) => ({
        id: ruleset.id,
        name: ruleset.name,
        kind: 'builtin',
        remoteRuleSetIds: Array.isArray(ruleset.remoteRuleSetIds) ? [...ruleset.remoteRuleSetIds] : [],
        entries: ruleset.entries.map((entry, index) => ({
        id: `${ruleset.id}-entry-${index + 1}`,
        type: entry.type,
        value: entry.value,
        note: entry.note || ''
        }))
      }))
    ];
  }

  async refreshAutoStartState() {
    try {
      const status = await this.autoStartManager.getStatus();
      this.state.autoStart = this.buildAutoStartState(status);
    } catch (error) {
      this.state.autoStart = this.buildAutoStartState({
        enabled: false,
        command: null,
        error: error.message
      });
    }

    return this.state.autoStart;
  }

  updateSubscriptionRecord(url, importedCount, nodes) {
    const settings = this.getSettingsSnapshot();
    const now = new Date().toISOString();
    const nextRecord = {
      id: settings.subscriptions.find((item) => item.url === url)?.id || `subscription-${Date.now()}`,
      url,
      name: url,
      importedCount,
      lastSyncedAt: now,
      lastNodeCount: nodes.filter((node) => node.subscriptionUrl === url).length
    };

    const subscriptions = [
      ...settings.subscriptions.filter((item) => item.url !== url),
      nextRecord
    ];

    this.store.saveSettings({
      ...settings,
      subscriptions
    });

    return nextRecord;
  }

  async refreshSystemProxyState() {
    try {
      const status = await this.systemProxyManager.getStatus();
      this.state.systemProxy = this.buildSystemProxyState(status);
    } catch (error) {
      this.state.systemProxy = this.buildSystemProxyState({
        lastError: error.message,
        mode: 'error'
      });
    }

    return this.state.systemProxy;
  }

  async cleanupSystemProxyAfterExit() {
    const desiredEnabled = !!this.getSettingsSnapshot().systemProxyEnabled;
    if (!desiredEnabled) {
      this.state.systemProxy = this.buildSystemProxyState(await this.systemProxyManager.getStatus().catch(() => this.buildSystemProxyState()));
      return this.state.systemProxy;
    }

    try {
      const disabled = await this.systemProxyManager.disable();
      this.state.systemProxy = this.buildSystemProxyState(disabled);
    } catch (error) {
      this.state.systemProxy = this.buildSystemProxyState({
        ...this.state.systemProxy,
        enabled: false,
        mode: 'error',
        lastError: error.message
      });
    }

    return this.state.systemProxy;
  }

  async applySystemProxy() {
    if (this.state.status !== 'running') {
      throw createHttpError('Core must be running before applying system proxy', 400);
    }

    const settings = this.getSettingsSnapshot();
    const status = await this.systemProxyManager.apply({
      host: settings.proxyListenHost,
      httpPort: settings.systemProxyHttpPort,
      socksPort: settings.systemProxySocksPort
    });

    if (!settings.systemProxyEnabled) {
      await this.updateSettings({ systemProxyEnabled: true });
    }
    this.state.systemProxy = this.buildSystemProxyState(status);
    return this.state.systemProxy;
  }

  async disableSystemProxy() {
    const status = await this.systemProxyManager.disable();
    if (this.getSettingsSnapshot().systemProxyEnabled) {
      await this.updateSettings({ systemProxyEnabled: false });
    }
    this.state.systemProxy = this.buildSystemProxyState(status);
    return this.state.systemProxy;
  }

  getRuntimeOptions(settings = this.store.getSettings(), nodes = this.store.getNodes()) {
    return {
      activeNodeId: this.resolveActiveNodeId(settings, nodes),
      customRules: settings.customRules,
      rulesets: settings.rulesets || [],
      nodeGroups: settings.nodeGroups || [],
      proxyMode: settings.routingMode,
      systemProxyEnabled: !!settings.systemProxyEnabled,
      systemProxyHttpPort: settings.systemProxyHttpPort,
      systemProxySocksPort: settings.systemProxySocksPort
    };
  }

  async updateSettings(patch) {
    const current = this.getSettingsSnapshot();
    const next = {
      ...current,
      ...patch
    };

    if (next.routingMode && !ROUTING_MODES.includes(next.routingMode)) {
      throw createHttpError('Invalid routing mode', 400);
    }

    const proxyBasePort = validatePort(next.proxyBasePort, 'proxyBasePort');
    const systemProxySocksPort = validatePort(next.systemProxySocksPort, 'systemProxySocksPort');
    const systemProxyHttpPort = validatePort(next.systemProxyHttpPort, 'systemProxyHttpPort');
    if (Object.prototype.hasOwnProperty.call(patch, 'customRules') && !Array.isArray(next.customRules)) {
      throw createHttpError('customRules must be an array', 400);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'rulesets') && !Array.isArray(next.rulesets)) {
      throw createHttpError('rulesets must be an array', 400);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroups') && !Array.isArray(next.nodeGroups)) {
      throw createHttpError('nodeGroups must be an array', 400);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroupAutoTestIntervalSec')) {
      const parsedIntervalSec = Number.parseInt(patch.nodeGroupAutoTestIntervalSec, 10);
      if (!Number.isInteger(parsedIntervalSec)) {
        throw createHttpError('nodeGroupAutoTestIntervalSec must be an integer', 400);
      }
      next.nodeGroupAutoTestIntervalSec = normalizeNodeGroupAutoTestIntervalSec(parsedIntervalSec);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'nodeGroupLatencyCache')) {
      if (!patch.nodeGroupLatencyCache || typeof patch.nodeGroupLatencyCache !== 'object') {
        throw createHttpError('nodeGroupLatencyCache must be an object', 400);
      }
      next.nodeGroupLatencyCache = normalizeNodeGroupLatencyCache(patch.nodeGroupLatencyCache);
    }

    const nodeGroups = Array.isArray(next.nodeGroups)
      ? normalizeNodeGroups(next.nodeGroups, this.store.getNodes())
      : current.nodeGroups;
    const customRules = Array.isArray(next.customRules)
      ? normalizeCustomRules(next.customRules, nodeGroups)
      : current.customRules;
    const rulesets = Array.isArray(next.rulesets)
      ? normalizeRulesets(next.rulesets, nodeGroups)
      : current.rulesets;

    if (systemProxySocksPort === systemProxyHttpPort) {
      throw createHttpError('systemProxySocksPort and systemProxyHttpPort must be different', 400);
    }

    const nodes = this.store.getNodes();
    const normalizedNodes = assignStableLocalPorts(nodes, proxyBasePort);
    const occupiedManualPorts = new Set(normalizedNodes.map((node) => Number.parseInt(node.local_port, 10)).filter((port) => Number.isInteger(port)));

    if (occupiedManualPorts.has(systemProxySocksPort) || systemProxySocksPort === proxyBasePort) {
      throw createHttpError('systemProxySocksPort conflicts with manual proxy ports', 400);
    }

    if (occupiedManualPorts.has(systemProxyHttpPort) || systemProxyHttpPort === proxyBasePort) {
      throw createHttpError('systemProxyHttpPort conflicts with manual proxy ports', 400);
    }

    const activeNodeId = this.resolveActiveNodeId(next, nodes);
    let autoStart = this.state.autoStart;
    if (Object.prototype.hasOwnProperty.call(patch, 'autoStart')) {
      autoStart = patch.autoStart
        ? await this.autoStartManager.enable()
        : await this.autoStartManager.disable();
    }

    const saved = this.store.saveSettings({
      ...next,
      proxyBasePort,
      systemProxySocksPort,
      systemProxyHttpPort,
      customRules,
      rulesets,
      nodeGroups,
      activeNodeId,
      autoStart: !!next.autoStart,
      nodeGroupAutoTestIntervalSec: normalizeNodeGroupAutoTestIntervalSec(next.nodeGroupAutoTestIntervalSec),
      nodeGroupLatencyCache: normalizeNodeGroupLatencyCache(next.nodeGroupLatencyCache)
    });
    this.state.autoStart = this.buildAutoStartState(autoStart);

    const runtimeSensitiveKeys = ['activeNodeId', 'routingMode', 'customRules', 'rulesets', 'nodeGroups'];
    const shouldAutoRestart = this.state.status === 'running'
      && runtimeSensitiveKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));

    let core = this.getStatus();
    if (shouldAutoRestart) {
      core = await this.restart();
    }

    return {
      settings: { ...saved },
      proxy: this.getProxyProfile(),
      restartRequired: shouldAutoRestart ? false : this.getRestartRequired(),
      autoRestarted: shouldAutoRestart,
      core
    };
  }

  getStatus() {
    const binary = this.buildBinaryState(this.state.binary);

    return {
      ...this.state,
      binary: { ...binary },
      proxy: this.getProxyProfile(),
      systemProxy: { ...this.state.systemProxy },
      autoStart: { ...this.state.autoStart },
      geoIp: this.getGeoIpStatus(),
      rulesetDatabase: this.getRulesetDatabaseStatus(),
      settings: this.getSettingsSnapshot(),
      paths: {
        root: this.paths.root,
        runtimeRoot: this.paths.runtimeRoot,
        dataDir: this.paths.dataDir,
        configPath: this.paths.configPath,
        settingsPath: this.paths.settingsPath,
        rulesDir: this.paths.rulesDir,
        rulesetMetaPath: this.paths.rulesetMetaPath
      },
      hasConfig: fs.existsSync(this.paths.configPath),
      nodeCount: this.store.getNodes().length,
      nodes: this.store.getNodes(),
      recentLogs: this.store.getRecentLogs(200)
    };
  }

  async initializeGeoIp() {
    await this.geoIpService.initialize();
  }

  async initializeRulesetDatabase() {
    await this.rulesetDatabaseService.initialize();
  }

  getGeoIpStatus() {
    return this.geoIpService.getStatus();
  }

  async refreshGeoIp() {
    await this.geoIpService.refreshNow();
    return this.getGeoIpStatus();
  }

  getRulesetDatabaseStatus() {
    return this.rulesetDatabaseService.getStatus();
  }

  async refreshRulesetDatabase() {
    await this.rulesetDatabaseService.refreshNow();
    return this.getRulesetDatabaseStatus();
  }

  async getRoutingHits() {
    const history = this.readRoutingHitHistory();
    if (this.state.status !== 'running') return history;
    const settings = this.store.getSettings();
    if (!settings.systemProxyEnabled || settings.routingMode !== 'rule') return history;

    const nodeMap = new Map(this.store.getNodes().map((node) => [`out-${node.id}`, node]));
    const connections = await this.connectionsService.getConnections();
    const liveHits = connections
      .map((connection) => {
        const metadata = connection.metadata || {};
        const host = metadata.host || metadata.destinationIP || metadata.destination || '';
        const chains = Array.isArray(connection.chains) ? connection.chains : [];
        const outboundTag = chains[chains.length - 1] || '';
        const hit = this.proxyService.resolveRoutingHit(connection.rule || connection.rulePayload || null, host, outboundTag, { allowHeuristic: false });
        if (!hit) return null;
        return {
          id: connection.id || `${host}-${outboundTag}`,
          timestamp: pickConnectionTimestamp(connection),
          host,
          port: metadata.destinationPort || metadata.dstPort || null,
          outbound: outboundTag,
          outboundName: nodeMap.get(outboundTag)?.name || nodeMap.get(outboundTag)?.displayName || nodeMap.get(outboundTag)?.label || nodeMap.get(outboundTag)?.server || outboundTag,
          kind: hit.kind,
          name: hit.name,
          target: hit.target,
          descriptor: hit.descriptor,
          matchedTag: hit.matchedTag || null,
          matchedBy: hit.matchedBy || null,
          matchType: hit.matchType || null,
          matchValue: hit.matchValue || null,
          persisted: false,
          chains,
          rule: connection.rule || null,
          rulePayload: connection.rulePayload || null
        };
      })
      .filter(Boolean);

    const merged = [...liveHits, ...history].slice(0, ROUTING_HIT_READ_LIMIT);
    return merged;
  }

  async getTrafficSnapshot() {
    if (this.state.status !== 'running') {
      return {
        timestamp: new Date().toISOString(),
        uploadBytes: 0,
        downloadBytes: 0,
        connectionCount: 0
      };
    }

    const connections = await this.connectionsService.getConnections();
    const totals = connections.reduce((acc, connection) => {
      acc.uploadBytes += pickConnectionBytes(connection, ['upload', 'uploadBytes', 'up', 'upBytes', 'sent', 'tx']);
      acc.downloadBytes += pickConnectionBytes(connection, ['download', 'downloadBytes', 'down', 'downBytes', 'received', 'rx']);
      return acc;
    }, { uploadBytes: 0, downloadBytes: 0 });

    return {
      timestamp: new Date().toISOString(),
      uploadBytes: Math.round(totals.uploadBytes),
      downloadBytes: Math.round(totals.downloadBytes),
      connectionCount: connections.length
    };
  }

  async getNodeRecords() {
    const settings = this.getSettingsSnapshot();
    const nodes = this.store.getNodes();

    this.proxyService.proxyListen = settings.proxyListenHost;
    this.proxyService.basePort = settings.proxyBasePort;
    this.proxyService.setNodes(nodes);

    const records = nodes.map((node) => ({
      ...node,
      localPort: this.proxyService.getLocalPort(node.id),
      listenHost: settings.proxyListenHost,
      shareLink: this.proxyService.toShareLink ? this.proxyService.toShareLink(node) : null,
      endpoint: {
        protocol: 'socks5',
        host: settings.proxyListenHost,
        port: this.proxyService.getLocalPort(node.id),
        url: `socks5://${settings.proxyListenHost}:${this.proxyService.getLocalPort(node.id)}`
      },
      copyText: `${settings.proxyListenHost}:${this.proxyService.getLocalPort(node.id)}`,
      isRunning: this.state.status === 'running'
    }));

    const enriched = await this.geoIpService.enrichNodes(records);
    return enriched.map((node) => {
      const countryCodeOverride = normalizeCountryCode(node.countryCodeOverride);
      if (!countryCodeOverride) {
        return {
          ...node,
          countryOverridden: false
        };
      }

      return {
        ...node,
        countryCode: countryCodeOverride,
        countryName: this.resolveCountryName(countryCodeOverride) || node.countryName || countryCodeOverride,
        flagEmoji: geoFlagFromCountryCode(countryCodeOverride),
        countryCodeOverride,
        countryOverridden: true
      };
    });
  }

  resolveCountryName(countryCode) {
    const normalized = normalizeCountryCode(countryCode);
    if (!normalized) {
      return null;
    }

    try {
      return new Intl.DisplayNames(['zh-CN', 'en'], { type: 'region' }).of(normalized) || normalized;
    } catch {
      return normalized;
    }
  }

  getNodeById(nodeId) {
    return this.store.getNodes().find((node) => node.id === nodeId) || null;
  }

  getRestartRequired() {
    return this.state.status === 'running';
  }

  async applyNodeChanges(savedNodes) {
    if (this.state.status !== 'running') {
      const nodes = await this.getNodeRecords();
      return {
        nodes,
        restartRequired: false,
        autoRestarted: false,
        core: this.getStatus()
      };
    }

    const core = await this.restart();
    return {
      nodes: await this.getNodeRecords(),
      restartRequired: false,
      autoRestarted: true,
      core
    };
  }

  normalizeNodes(nodes) {
    const normalizedNodes = (Array.isArray(nodes) ? nodes : []).map((node) => {
      const normalizedOverride = normalizeCountryCode(node?.countryCodeOverride);
      if (normalizedOverride) {
        return {
          ...node,
          countryCodeOverride: normalizedOverride
        };
      }

      if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, 'countryCodeOverride')) {
        return node;
      }

      const { countryCodeOverride, ...rest } = node;
      return rest;
    });

    return assignStableLocalPorts(normalizedNodes, this.getSettingsSnapshot().proxyBasePort);
  }

  saveNodes(nodes) {
    const savedNodes = this.store.saveNodes(this.normalizeNodes(nodes));
    const settings = this.getSettingsSnapshot();
    this.store.saveSettings({
      ...settings,
      activeNodeId: this.resolveActiveNodeId(settings, savedNodes)
    });
    return savedNodes;
  }

  mergeAndSaveNodes(incomingNodes) {
    return this.saveNodes(mergeUniqueNodes(this.store.getNodes(), incomingNodes));
  }

  async importProxyLink(link, group = null) {
    const normalizedLink = this.proxyService.normalizeManualImportContent
      ? this.proxyService.normalizeManualImportContent(link)
      : this.proxyService.normalizeSubscriptionContent
        ? this.proxyService.normalizeSubscriptionContent(link)
        : link;
    const parsedNodes = this.proxyService.parseProxyLinks
      ? this.proxyService.parseProxyLinks(normalizedLink)
      : [this.proxyService.parseProxyLink(normalizedLink)].filter(Boolean);
    if (!parsedNodes.length) {
      throw createHttpError('Invalid proxy link', 400);
    }

    const nodes = parsedNodes.map((parsedNode) => ({
      ...(parsedNode.id ? parsedNode : { ...parsedNode, id: createNodeId() }),
      ...(group ? { group } : {})
    }));
    const savedNodes = this.mergeAndSaveNodes(nodes);
    const applied = await this.applyNodeChanges(savedNodes);
    return {
      node: applied.nodes.find((item) => item.id === nodes[0].id),
      importedCount: nodes.length,
      ...applied
    };
  }

  async importRawNode(rawNode) {
    const savedNodes = this.mergeAndSaveNodes([rawNode]);
    return this.applyNodeChanges(savedNodes);
  }

  async updateNode(nodeId, patch) {
    const nodes = this.store.getNodes();
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index === -1) {
      throw createHttpError('Node not found', 404);
    }

    nodes[index] = {
      ...nodes[index],
      ...patch,
      id: nodeId
    };

    const savedNodes = this.saveNodes(nodes);
    const applied = await this.applyNodeChanges(savedNodes);
    return {
      node: applied.nodes.find((item) => item.id === nodeId),
      ...applied
    };
  }

  async deleteNode(nodeId) {
    const nodes = this.store.getNodes();
    const remainingNodes = nodes.filter((node) => node.id !== nodeId);
    if (remainingNodes.length === nodes.length) {
      throw createHttpError('Node not found', 404);
    }

    return this.applyNodeChanges(this.saveNodes(remainingNodes));
  }

  getGroups() {
    const nodes = this.store.getNodes();
    const stored = this.getSettingsSnapshot().groups || [];
    const seen = new Set(stored);
    const groups = [...stored];
    for (const node of nodes) {
      const g = node.group ? String(node.group).trim() : null;
      if (g && !seen.has(g)) {
        seen.add(g);
        groups.push(g);
      }
    }
    return groups;
  }

  async createGroup(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw createHttpError('Group name cannot be empty', 400);
    const settings = this.getSettingsSnapshot();
    const groups = settings.groups || [];
    if (groups.includes(trimmed)) return { groups: this.getGroups() };
    this.store.saveSettings({ ...settings, groups: [...groups, trimmed] });
    return { groups: this.getGroups() };
  }

  async setNodeGroup(nodeIds, group) {
    const normalizedGroup = group ? String(group).trim() || null : null;
    const nodes = this.store.getNodes().map((node) =>
      nodeIds.includes(node.id) ? { ...node, group: normalizedGroup } : node
    );
    const savedNodes = this.saveNodes(nodes);
    return this.applyNodeChanges(savedNodes);
  }

  async renameGroup(oldName, newName) {
    const trimmedNew = String(newName || '').trim();
    if (!trimmedNew) throw createHttpError('Group name cannot be empty', 400);
    const nodes = this.store.getNodes().map((node) =>
      node.group === oldName ? { ...node, group: trimmedNew } : node
    );
    const settings = this.getSettingsSnapshot();
    const groups = (settings.groups || []).map(g => g === oldName ? trimmedNew : g);
    this.store.saveSettings({ ...settings, groups });
    const savedNodes = this.saveNodes(nodes);
    return this.applyNodeChanges(savedNodes);
  }

  async deleteGroup(groupName) {
    const nodes = this.store.getNodes().map((node) =>
      node.group === groupName ? { ...node, group: null } : node
    );
    const settings = this.getSettingsSnapshot();
    const groups = (settings.groups || []).filter(g => g !== groupName);
    this.store.saveSettings({ ...settings, groups });
    const savedNodes = this.saveNodes(nodes);
    return this.applyNodeChanges(savedNodes);
  }

  async groupNodesByCountry() {
    const nodeRecords = await this.getNodeRecords();
    const countryByNodeId = new Map(
      nodeRecords.map((node) => [node.id, normalizeCountryCode(node.countryCode)])
    );

    let groupedCount = 0;
    let skippedCount = 0;
    const nextNodes = this.store.getNodes().map((node) => {
      const countryCode = countryByNodeId.get(node.id);
      if (!countryCode) {
        skippedCount += 1;
        return node;
      }

      groupedCount += 1;
      return {
        ...node,
        group: buildCountryGroupName(countryCode)
      };
    });

    if (!groupedCount) {
      throw createHttpError('No nodes with resolvable country information', 400);
    }

    const savedNodes = this.saveNodes(nextNodes);
    this.syncAutoCountryNodeGroups(savedNodes, countryByNodeId);
    const applied = await this.applyNodeChanges(savedNodes);
    return {
      groupedCount,
      skippedCount,
      groups: this.getGroups(),
      nodeGroups: this.getNodeGroups(),
      ...applied
    };
  }

  async setNodeCountryOverride(nodeId, countryCode) {
    const normalizedOverride = normalizeCountryCode(countryCode);
    const nodes = this.store.getNodes();
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index === -1) {
      throw createHttpError('Node not found', 404);
    }

    const nextNode = {
      ...nodes[index]
    };
    if (normalizedOverride) {
      nextNode.countryCodeOverride = normalizedOverride;
    } else {
      delete nextNode.countryCodeOverride;
    }
    nodes[index] = nextNode;

    const savedNodes = this.saveNodes(nodes);
    const nodeRecords = await this.getNodeRecords();
    const countryByNodeId = new Map(
      nodeRecords.map((node) => [node.id, normalizeCountryCode(node.countryCode)])
    );
    this.syncAutoCountryNodeGroups(savedNodes, countryByNodeId);
    const applied = await this.applyNodeChanges(savedNodes);
    return {
      node: applied.nodes.find((item) => item.id === nodeId) || null,
      groups: this.getGroups(),
      nodeGroups: this.getNodeGroups(),
      ...applied
    };
  }

  syncAutoCountryNodeGroups(nodes, countryByNodeId = null) {
    const settings = this.getSettingsSnapshot();
    const allNodeGroups = Array.isArray(settings.nodeGroups) ? settings.nodeGroups : [];
    const manualNodeGroups = allNodeGroups.filter((group) => !String(group.id || '').startsWith(AUTO_COUNTRY_NODE_GROUP_PREFIX));
    const existingAutoGroupMap = new Map(
      allNodeGroups
        .filter((group) => String(group.id || '').startsWith(AUTO_COUNTRY_NODE_GROUP_PREFIX))
        .map((group) => [group.id, group])
    );

    let resolvedCountryByNodeId = countryByNodeId;
    if (!resolvedCountryByNodeId) {
      resolvedCountryByNodeId = new Map();
      for (const node of nodes || []) {
        resolvedCountryByNodeId.set(node.id, normalizeCountryCode(node.countryCodeOverride));
      }
    }

    const nodeIdsByCountry = new Map();
    for (const node of nodes || []) {
      const code = normalizeCountryCode(resolvedCountryByNodeId.get(node.id));
      if (!code) continue;
      if (!nodeIdsByCountry.has(code)) {
        nodeIdsByCountry.set(code, []);
      }
      nodeIdsByCountry.get(code).push(node.id);
    }

    const autoNodeGroups = Array.from(nodeIdsByCountry.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([countryCode, nodeIds]) => {
        const id = `${AUTO_COUNTRY_NODE_GROUP_PREFIX}${countryCode.toLowerCase()}`;
        const existing = existingAutoGroupMap.get(id);
        const selectedNodeId = nodeIds.includes(existing?.selectedNodeId) ? existing.selectedNodeId : (nodeIds[0] || null);
        return {
          id,
          name: buildCountryGroupName(countryCode),
          type: 'country',
          countryCode,
          iconMode: 'auto',
          iconEmoji: '',
          note: '',
          nodeIds,
          selectedNodeId
        };
      });

    const normalizedNodeGroups = normalizeNodeGroups([...manualNodeGroups, ...autoNodeGroups], nodes || []);
    this.store.saveSettings({
      ...settings,
      nodeGroups: normalizedNodeGroups
    });
  }

  getNodeGroups() {
    return this.getSettingsSnapshot().nodeGroups || [];
  }

  async getNodeGroupsResolved() {
    const nodes = this.store.getNodes();
    if (!nodes.length) {
      return this.getNodeGroups();
    }

    try {
      const nodeRecords = await this.getNodeRecords();
      const countryByNodeId = new Map(
        nodeRecords.map((node) => [node.id, normalizeCountryCode(node.countryCode)])
      );
      this.syncAutoCountryNodeGroups(nodes, countryByNodeId);
    } catch {
      // Keep existing node group state when geo enrichment is unavailable.
    }

    return this.getNodeGroups();
  }

  async createNodeGroup(payload = {}) {
    const type = NODE_GROUP_TYPES.includes(String(payload.type || '').trim())
      ? String(payload.type || '').trim()
      : 'custom';
    const countryCode = normalizeCountryCode(payload.countryCode);
    const name = String(payload.name || '').trim() || (type === 'country' && countryCode ? buildCountryGroupName(countryCode) : '');
    if (!name) throw createHttpError('Node group name cannot be empty', 400);

    const iconMode = NODE_GROUP_ICON_MODES.includes(String(payload.iconMode || '').trim())
      ? String(payload.iconMode || '').trim()
      : 'auto';
    const iconEmoji = typeof payload.iconEmoji === 'string' ? payload.iconEmoji.trim().slice(0, 4) : '';
    const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 200) : '';
    const nodeIds = Array.isArray(payload.nodeIds) ? payload.nodeIds : [];
    const selectedNodeId = payload.selectedNodeId == null ? null : String(payload.selectedNodeId).trim();

    const settings = this.getSettingsSnapshot();
    const currentGroups = settings.nodeGroups || [];
    const nextGroups = [...currentGroups, {
      id: createNodeId(),
      name,
      type,
      countryCode,
      iconMode,
      iconEmoji,
      note,
      nodeIds,
      selectedNodeId
    }];
    return this.updateSettings({ nodeGroups: nextGroups });
  }

  async updateNodeGroup(groupId, patch = {}) {
    if (!groupId) {
      throw createHttpError('Node group id is required', 400);
    }

    const settings = this.getSettingsSnapshot();
    const existing = (settings.nodeGroups || []).find((group) => group.id === groupId);
    if (!existing) {
      throw createHttpError('Node group not found', 404);
    }

    const nextGroup = {
      ...existing,
      ...(Object.prototype.hasOwnProperty.call(patch, 'name') ? { name: patch.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'type') ? { type: patch.type } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'countryCode') ? { countryCode: patch.countryCode } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'iconMode') ? { iconMode: patch.iconMode } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'iconEmoji') ? { iconEmoji: patch.iconEmoji } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'note') ? { note: patch.note } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'selectedNodeId') ? { selectedNodeId: patch.selectedNodeId } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'nodeIds') ? { nodeIds: patch.nodeIds } : {})
    };

    const nextGroups = (settings.nodeGroups || []).map((group) => group.id === groupId ? nextGroup : group);
    return this.updateSettings({ nodeGroups: nextGroups });
  }

  async deleteNodeGroup(groupId) {
    const settings = this.getSettingsSnapshot();
    const nextGroups = (settings.nodeGroups || []).filter((group) => group.id !== groupId);
    return this.updateSettings({
      nodeGroups: nextGroups,
      customRules: (settings.customRules || []).map((rule) => rule.action === 'node_group' && rule.nodeGroupId === groupId ? { ...rule, action: 'default', nodeGroupId: null } : rule),
      rulesets: (settings.rulesets || []).map((ruleset) => ruleset.target === 'node_group' && ruleset.groupId === groupId ? { ...ruleset, target: 'default', groupId: null } : ruleset)
    });
  }

  async updateNodeGroupNodes(groupId, nodeIds) {
    const settings = this.getSettingsSnapshot();
    const normalizedIds = Array.isArray(nodeIds) ? nodeIds : [];
    const nextGroups = (settings.nodeGroups || []).map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        nodeIds: normalizedIds,
        selectedNodeId: normalizedIds.includes(group.selectedNodeId) ? group.selectedNodeId : (normalizedIds[0] || null)
      };
    });
    return this.updateSettings({ nodeGroups: nextGroups });
  }

  async selectNodeGroupNode(groupId, selectedNodeId) {
    const settings = this.getSettingsSnapshot();
    const nextGroups = (settings.nodeGroups || []).map((group) => group.id === groupId ? { ...group, selectedNodeId } : group);
    return this.updateSettings({ nodeGroups: nextGroups });
  }

  async syncSubscription(url) {
    const importedNodes = await this.proxyService.syncSubscription(url);
    if (!importedNodes.length) {
      throw createHttpError('Subscription returned no usable nodes', 400);
    }

    const settings = this.getSettingsSnapshot();
    const subRecord = settings.subscriptions.find((s) => s.url === url);
    const groupName = subRecord?.groupName || null;

    const existingNodes = this.store.getNodes().filter((node) => node.subscriptionUrl !== url);
    const savedNodes = this.saveNodes(mergeUniqueNodes(existingNodes, importedNodes.map((node) => ({
      ...node,
      source: 'subscription',
      subscriptionUrl: url,
      ...(groupName ? { group: groupName } : {})
    }))));

    const applied = await this.applyNodeChanges(savedNodes);
    const subscription = this.updateSubscriptionRecord(url, importedNodes.length, applied.nodes);

    return {
      importedCount: importedNodes.length,
      subscription,
      ...applied
    };
  }

  bindProcessState() {
    if (!this.proxyService.proxyProcess) {
      return;
    }

    this.proxyService.proxyProcess.once('exit', async (code, signal) => {
      await this.cleanupSystemProxyAfterExit();
      const isClean = code === 0 || signal === 'SIGTERM';
      this.state = {
        ...this.state,
        status: isClean ? 'stopped' : 'error',
        lastError: isClean
          ? null
          : `sing-box exited unexpectedly${code !== null ? ` with code ${code}` : ''}`,
        startedAt: null,
        executablePath: null
      };

      if (!isClean) {
        const MAX_RESTART_ATTEMPTS = 5;
        this._restartAttempts = (this._restartAttempts || 0) + 1;
        if (this._restartAttempts > MAX_RESTART_ATTEMPTS) {
          this.store.appendLog(`[CoreManager] sing-box crashed ${MAX_RESTART_ATTEMPTS} times, giving up`);
          this.state = { ...this.state, status: 'crashed', lastError: 'sing-box crashed too many times, manual restart required' };
          return;
        }
        const delay = Math.min(1000 * 2 ** (this._restartAttempts - 1), 30000);
        this.store.appendLog(`[CoreManager] sing-box crashed, restarting in ${delay}ms (attempt ${this._restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
        setTimeout(async () => {
          try {
            await this.start();
            this._restartAttempts = 0;
          } catch (err) {
            this.store.appendLog(`[CoreManager] Auto-restart failed: ${err.message}`);
          }
        }, delay);
      } else {
        this._restartAttempts = 0;
      }
    });
  }

  async start() {
    let binary = null;

    try {
      const settings = this.getSettingsSnapshot();
      binary = await this.binaryManager.ensureAvailable(settings.singBoxBinaryPath);
      const nodes = this.store.getNodes();
      this.proxyService.setNodes(nodes);
      const result = await this.proxyService.start({
        binPath: binary.executablePath,
        runtime: this.getRuntimeOptions(settings, nodes)
      });
      const systemProxy = settings.systemProxyEnabled
        ? await this.systemProxyManager.apply({
            host: settings.proxyListenHost,
            httpPort: settings.systemProxyHttpPort,
            socksPort: settings.systemProxySocksPort
          })
        : await this.systemProxyManager.getStatus().catch(() => this.buildSystemProxyState());
      this.state = {
        ...this.state,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastError: null,
        executablePath: result.executablePath,
        configPath: result.configPath,
        binary: this.buildBinaryState({
          status: 'ready',
          resolvedPath: binary.executablePath,
          source: binary.source,
          lastError: null,
          version: binary.version || this.state.binary.version
        }),
        systemProxy: this.buildSystemProxyState(systemProxy)
      };
      this.bindProcessState();
      return this.getStatus();
    } catch (error) {
      if (binary && this.proxyService?.proxyProcess) {
        this.proxyService.stop();
      }

      const binaryState = binary
        ? this.buildBinaryState({
            status: 'ready',
            resolvedPath: binary.executablePath,
            source: binary.source,
            lastError: null,
            version: binary.version || this.state.binary.version
          })
        : this.buildBinaryState({
            status: 'error',
            lastError: error.message
          });

      this.state = {
        ...this.state,
        status: 'error',
        lastError: error.message,
        binary: binaryState,
        systemProxy: this.buildSystemProxyState({
          ...this.state.systemProxy,
          lastError: this.state.systemProxy?.lastError || null
        })
      };
      throw error;
    }
  }

  async stop() {
    this._restartAttempts = 0;
    this.proxyService.stop();
    const systemProxy = this.getSettingsSnapshot().systemProxyEnabled
      ? await this.systemProxyManager.disable().catch((error) => this.buildSystemProxyState({
          ...this.state.systemProxy,
          lastError: error.message,
          mode: 'error'
        }))
      : await this.systemProxyManager.getStatus().catch(() => this.buildSystemProxyState());
    this.state = {
      ...this.state,
      status: 'stopped',
      startedAt: null,
      lastError: null,
      executablePath: null,
      binary: this.buildBinaryState({
        status: this.state.binary?.status === 'error' ? 'error' : this.buildBinaryState().status,
        lastError: this.state.binary?.status === 'error' ? this.state.binary.lastError : null,
        version: this.state.binary?.version || null,
        resolvedPath: this.state.binary?.resolvedPath || this.buildBinaryState().resolvedPath,
        source: this.state.binary?.source || this.buildBinaryState().source
      }),
      systemProxy: this.buildSystemProxyState(systemProxy)
    };
    return this.getStatus();
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  async testNode(nodeId) {
    if (!this.getNodeById(nodeId)) {
      throw createHttpError('Node not found', 404);
    }

    let autoStarted = false;
    if (this.state.status !== 'running') {
      await this.start();
      autoStarted = true;
    }

    const latencyMs = await this.proxyService.testNode(nodeId);
    return {
      node: this.getNodeById(nodeId),
      latencyMs,
      core: this.getStatus(),
      autoStarted
    };
  }

  async testNodes(nodeIds = []) {
    const requestedIds = Array.isArray(nodeIds) && nodeIds.length
      ? [...new Set(nodeIds)]
      : this.store.getNodes().map((node) => node.id);

    if (!requestedIds.length) {
      throw createHttpError('No nodes available for latency tests', 400);
    }

    const unknownId = requestedIds.find((nodeId) => !this.getNodeById(nodeId));
    if (unknownId) {
      throw createHttpError(`Node not found: ${unknownId}`, 404);
    }

    let autoStarted = false;
    if (this.state.status !== 'running') {
      await this.start();
      autoStarted = true;
    }

    const CONCURRENCY = 5;
    const results = [];
    for (let i = 0; i < requestedIds.length; i += CONCURRENCY) {
      const batch = requestedIds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (nodeId) => {
        const node = this.getNodeById(nodeId);
        try {
          const latencyMs = await this.proxyService.testNode(nodeId);
          return { id: nodeId, ok: true, latencyMs, node };
        } catch (error) {
          return { id: nodeId, ok: false, error: error.message, node };
        }
      }));
      results.push(...batchResults);
    }

    return {
      results,
      core: this.getStatus(),
      autoStarted
    };
  }
}
