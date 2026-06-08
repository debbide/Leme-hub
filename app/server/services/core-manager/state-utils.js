export {
  createHttpError,
  createNodeId,
  getNodeSignature,
  normalizeCountryCode,
  normalizeIsoTimestamp,
  truncateText,
  validatePort
} from './common.js';

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
  getRuntimeReferencedNodeGroupIds,
  getNodeGroupsRuntimeSignature,
  hasNodeGroupsRuntimeChange,
  hasExistingNodeGroup,
  normalizeNodeGroupAutoTestIntervalSec,
  normalizeNodeGroupLatencyCache,
  normalizeNodeGroups,
  normalizeSystemProxyAutoSwitchIntervalSec,
  normalizeSystemProxyAutoSwitchSettings
} from './node-groups.js';

export {
  buildDeferredApplyWarning,
  buildInvalidNodeWarning,
  getNodeDisplayName,
  getNodesRuntimeSignature
} from './nodes.js';

export {
  ROUTING_HIT_HISTORY_LIMIT,
  ROUTING_HIT_READ_LIMIT,
  pickConnectionBytes,
  pickConnectionTimestamp
} from './connections.js';

export {
  legacyRoutingItemsFromSettings,
  normalizeCustomRules,
  normalizeRoutingItems,
  normalizeRulesets,
  routingItemsToLegacySettings
} from './routing-settings.js';

export {
  buildUniqueSubscriptionGroupName,
  deriveSubscriptionDisplayName,
  normalizeSubscriptionRecord
} from './subscriptions.js';

export {
  appendNodes,
  assignStableLocalPorts,
  countPotentialDuplicateNodes,
  mergeUniqueNodes
} from './ports.js';
