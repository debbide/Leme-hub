export const buildNormalizedRoutingItems = ({ routingItems = [], customRules = [], rulesets = [] }) => (
  Array.isArray(routingItems) && routingItems.length
    ? routingItems
    : [
      ...customRules.map((rule) => ({ ...rule, kind: 'rule' })),
      ...rulesets.flatMap((ruleset) => ruleset.kind === 'builtin'
        ? [{ ...ruleset, kind: 'builtin_ruleset' }]
        : ruleset.kind === 'remote'
          ? [{ ...ruleset, kind: 'remote' }]
          : (ruleset.entries || []).map((entry) => ({
          id: entry.id,
          rulesetId: ruleset.id,
          rulesetName: ruleset.name,
          kind: 'custom_entry',
          type: entry.type,
          value: entry.value,
          target: ruleset.target,
          nodeId: ruleset.nodeId,
          groupId: ruleset.groupId,
          enabled: ruleset.enabled !== false,
          note: entry.note || ruleset.note || ''
        })))
    ]
);
