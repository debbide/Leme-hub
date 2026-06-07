import { truncateText } from './common.js';

const getNodeDisplayName = (node, fallback = '') => (
  node?.name
  || node?.displayName
  || node?.label
  || node?.server
  || fallback
);

const buildInvalidNodeWarning = (invalidNodes = []) => {
  if (!Array.isArray(invalidNodes) || !invalidNodes.length) {
    return null;
  }

  const samples = invalidNodes
    .slice(0, 2)
    .map(({ node, error }) => `${truncateText(getNodeDisplayName(node, node?.id || node?.type || 'node'), 40)}: ${truncateText(error, 96)}`)
    .filter(Boolean)
    .join('; ');

  return invalidNodes.length === 1
    ? `已跳过 1 个无效节点：${samples}`
    : `已跳过 ${invalidNodes.length} 个无效节点，例如：${samples}`;
};

const buildDeferredApplyWarning = (errorMessage) => `节点已保存，但未自动应用到当前核心：${truncateText(errorMessage, 180)}`;

const NODE_RUNTIME_METADATA_KEYS = new Set([
  'name',
  'group',
  'countryCodeOverride'
]);

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const getNodeRuntimeComparable = (node) => {
  if (!node || typeof node !== 'object') {
    return node;
  }

  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !NODE_RUNTIME_METADATA_KEYS.has(key))
      .map(([key, value]) => [key, getNodeRuntimeComparable(value)])
  );
};

const getNodesRuntimeSignature = (nodes = []) => stableStringify(
  (Array.isArray(nodes) ? nodes : []).map((node) => getNodeRuntimeComparable(node))
);

export {
  buildDeferredApplyWarning,
  buildInvalidNodeWarning,
  getNodeDisplayName,
  getNodesRuntimeSignature
};
