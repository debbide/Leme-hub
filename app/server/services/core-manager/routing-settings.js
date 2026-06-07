import { BUILTIN_RULESETS, CUSTOM_RULE_ACTIONS, CUSTOM_RULE_TYPES, RULESET_KINDS, RULESET_TARGETS } from '../../../shared/constants.js';
import { createHttpError } from './common.js';
import { hasExistingNodeGroup } from './node-groups.js';

const isValidIpv4Cidr = (value) => {
  const match = String(value || '').trim().match(/^((?:\d{1,3}\.){3}\d{1,3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) {
    return false;
  }

  return match[1].split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
};

const ROUTING_ITEM_KINDS = ['rule', 'builtin_ruleset', 'custom_entry'];

const legacyRoutingItemsFromSettings = (settings = {}, nodeGroups = []) => {
  const rules = Array.isArray(settings.customRules) ? normalizeCustomRules(settings.customRules, nodeGroups) : [];
  const rulesets = Array.isArray(settings.rulesets) ? normalizeRulesets(settings.rulesets, nodeGroups) : [];

  return [
    ...rules.map((rule, index) => ({
      id: String(rule.id || `routing-rule-${index + 1}`),
      kind: 'rule',
      type: rule.type,
      value: rule.value,
      action: rule.action,
      nodeId: rule.nodeId,
      nodeGroupId: rule.nodeGroupId,
      note: rule.note || ''
    })),
    ...rulesets.flatMap((ruleset, index) => {
      if (ruleset.kind === 'builtin') {
        return [{
          id: String(ruleset.id || `routing-builtin-${index + 1}`),
          kind: 'builtin_ruleset',
          presetId: ruleset.presetId,
          name: ruleset.name || '',
          target: ruleset.target,
          nodeId: ruleset.nodeId,
          groupId: ruleset.groupId,
          enabled: ruleset.enabled !== false,
          note: ruleset.note || ''
        }];
      }

      return (ruleset.entries || []).map((entry, entryIndex) => ({
        id: String(entry.id || `${ruleset.id}-entry-${entryIndex + 1}`),
        kind: 'custom_entry',
        rulesetId: String(ruleset.id || `routing-custom-${index + 1}`),
        rulesetName: ruleset.name || '',
        type: entry.type,
        value: entry.value,
        target: ruleset.target,
        nodeId: ruleset.nodeId,
        groupId: ruleset.groupId,
        enabled: ruleset.enabled !== false,
        note: entry.note || ruleset.note || ''
      }));
    })
  ];
};

const normalizeRoutingItem = (item, index, nodeGroups = []) => {
  if (!item || typeof item !== 'object') {
    throw createHttpError(`routingItems[${index}] must be an object`, 400);
  }

  const kind = String(item.kind || '').trim();
  if (!ROUTING_ITEM_KINDS.includes(kind)) {
    throw createHttpError(`routingItems[${index}] has invalid kind`, 400);
  }

  if (kind === 'rule') {
    const normalized = normalizeCustomRule(item, index, nodeGroups);
    return {
      id: String(item.id || normalized.id),
      kind,
      type: normalized.type,
      value: normalized.value,
      action: normalized.action,
      nodeId: normalized.nodeId,
      nodeGroupId: normalized.nodeGroupId,
      note: normalized.note || ''
    };
  }

  if (kind === 'builtin_ruleset') {
    const normalized = normalizeRuleset({
      id: item.id,
      kind: 'builtin',
      presetId: item.presetId,
      name: item.name,
      target: item.target,
      nodeId: item.nodeId,
      groupId: item.groupId,
      enabled: item.enabled,
      note: item.note
    }, index, nodeGroups);

    return {
      id: String(item.id || normalized.id),
      kind,
      presetId: normalized.presetId,
      name: normalized.name,
      target: normalized.target,
      nodeId: normalized.nodeId,
      groupId: normalized.groupId,
      enabled: normalized.enabled !== false,
      note: normalized.note || ''
    };
  }

  const entry = normalizeRulesetEntry(item, index, index);
  const target = String(item.target || '').trim();
  const nodeId = item.nodeId == null || item.nodeId === '' ? null : String(item.nodeId).trim();
  const groupId = item.groupId == null || item.groupId === '' ? null : String(item.groupId).trim();

  if (!RULESET_TARGETS.includes(target)) {
    throw createHttpError(`routingItems[${index}] has invalid target`, 400);
  }
  if (target === 'node' && !nodeId) {
    throw createHttpError(`routingItems[${index}] target=node requires nodeId`, 400);
  }
  if (target === 'node_group' && !groupId) {
    throw createHttpError(`routingItems[${index}] target=node_group requires groupId`, 400);
  }
  if (target === 'node_group' && groupId && !hasExistingNodeGroup(nodeGroups, groupId)) {
    throw createHttpError(`routingItems[${index}] target=node_group requires an existing node group`, 400);
  }

  return {
    id: String(item.id || entry.id),
    kind,
    rulesetId: String(item.rulesetId || item.id || `custom-entry-${index + 1}`),
    rulesetName: typeof item.rulesetName === 'string' ? item.rulesetName.trim() : '',
    type: entry.type,
    value: entry.value,
    target,
    nodeId,
    groupId,
    enabled: item.enabled !== false,
    note: typeof item.note === 'string' ? item.note.trim() : ''
  };
};

const normalizeRoutingItems = (items, nodeGroups = []) => {
  const normalized = items.map((item, index) => normalizeRoutingItem(item, index, nodeGroups));
  const seenIds = new Set();
  const seenSignatures = new Set();

  normalized.forEach((item, index) => {
    if (seenIds.has(item.id)) {
      throw createHttpError(`routingItems[${index}] duplicates another item id`, 400);
    }
    seenIds.add(item.id);

    const signature = item.kind === 'rule'
      ? `rule|${item.type}|${item.action}|${item.nodeId || ''}|${item.nodeGroupId || ''}|${String(item.value || '').toLowerCase()}`
      : item.kind === 'builtin_ruleset'
        ? `builtin_ruleset|${item.presetId}|${item.target}|${item.nodeId || ''}|${item.groupId || ''}`
        : `custom_entry|${item.rulesetId || ''}|${item.type}|${item.target}|${item.nodeId || ''}|${item.groupId || ''}|${String(item.value || '').toLowerCase()}`;

    if (seenSignatures.has(signature)) {
      throw createHttpError(`routingItems[${index}] duplicates another routing item`, 400);
    }
    seenSignatures.add(signature);
  });

  return normalized;
};

const routingItemsToLegacySettings = (routingItems = []) => {
  const customRules = [];
  const builtinRulesets = [];
  const customRulesetMap = new Map();

  routingItems.forEach((item, index) => {
    if (item.kind === 'rule') {
      customRules.push({
        id: item.id || `rule-${index + 1}`,
        type: item.type,
        value: item.value,
        action: item.action,
        nodeId: item.nodeId,
        nodeGroupId: item.nodeGroupId,
        note: item.note || ''
      });
      return;
    }

    if (item.kind === 'builtin_ruleset') {
      builtinRulesets.push({
        id: item.id || `ruleset-${index + 1}`,
        kind: 'builtin',
        presetId: item.presetId,
        name: item.note || item.name || BUILTIN_RULESET_MAP.get(item.presetId)?.name || item.presetId,
        enabled: item.enabled !== false,
        target: item.target,
        nodeId: item.nodeId,
        groupId: item.groupId,
        entries: [],
        note: item.note || ''
      });
      return;
    }

    const rulesetId = String(item.rulesetId || item.id || `custom-entry-${index + 1}`);
    if (!customRulesetMap.has(rulesetId)) {
      customRulesetMap.set(rulesetId, {
        id: rulesetId,
        kind: 'custom',
        name: item.rulesetName || item.note || `自定义规则 ${customRulesetMap.size + 1}`,
        enabled: item.enabled !== false,
        target: item.target,
        nodeId: item.nodeId,
        groupId: item.groupId,
        entries: [],
        note: item.note || ''
      });
    }

    customRulesetMap.get(rulesetId).entries.push({
      id: item.id || `${rulesetId}-entry-${customRulesetMap.get(rulesetId).entries.length + 1}`,
      type: item.type,
      value: item.value,
      note: item.note || ''
    });
  });

  return {
    customRules,
    rulesets: [...builtinRulesets, ...customRulesetMap.values()]
  };
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
  if (action === 'node_group' && nodeGroupId && !hasExistingNodeGroup(nodeGroups, nodeGroupId)) {
    throw createHttpError(`customRules[${index}] target=node_group requires an existing node group`, 400);
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
  if (target === 'node_group' && groupId && !hasExistingNodeGroup(nodeGroups, groupId)) {
    throw createHttpError(`rulesets[${index}] target=node_group requires an existing node group`, 400);
  }

  if (kind === 'builtin') {
    if (!presetId || !BUILTIN_RULESET_MAP.has(presetId)) {
      throw createHttpError(`rulesets[${index}] has invalid presetId`, 400);
    }

    return {
      id,
      kind,
      presetId,
      name: String(ruleset.name || '').trim() || BUILTIN_RULESET_MAP.get(presetId).name,
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

export {
  legacyRoutingItemsFromSettings,
  normalizeCustomRules,
  normalizeRoutingItems,
  normalizeRulesets,
  routingItemsToLegacySettings
};
