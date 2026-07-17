import {
  appendNodes,
  assignStableLocalPorts,
  buildInvalidNodeWarning,
  countPotentialDuplicateNodes,
  createHttpError,
  createNodeId,
  mergeUniqueNodes,
  normalizeCountryCode
} from './state-utils.js';

export {
  applyNodeChanges,
  buildSavedNodeChangeResult,
  getNodeApplyStatus,
  queueNodeChangesApply,
  runNodeChangesApplyQueue,
  shouldApplyNodeRuntimeChanges
} from './node-apply-manager.js';

export {
  createValidationProxyService,
  filterValidNodes,
  resolveValidationBinaryPath,
  validateRuntimeConfig,
  validateSingleNodeConfig
} from './node-validation-manager.js';

export const normalizeFrontProxyRefs = (manager, nodes = []) => {
  const normalizedNodes = Array.isArray(nodes) ? nodes : [];
  const nodeMap = new Map(normalizedNodes.filter((node) => node?.id).map((node) => [node.id, node]));

  return normalizedNodes.map((node) => {
    if (!node || typeof node !== 'object') {
      return node;
    }

    const frontProxyNodeId = String(node.frontProxyNodeId || '').trim();
    const targetNode = frontProxyNodeId ? nodeMap.get(frontProxyNodeId) : null;
    if (String(node.type || '').toLowerCase() === 'socks'
      && targetNode
      && targetNode.id !== node.id
      && String(targetNode.type || '').toLowerCase() !== 'socks') {
      return {
        ...node,
        frontProxyNodeId: targetNode.id
      };
    }

    if (!Object.prototype.hasOwnProperty.call(node, 'frontProxyNodeId')) {
      return node;
    }

    const { frontProxyNodeId: _frontProxyNodeId, ...rest } = node;
    return rest;
  });
};

export const normalizeNodes = (manager, nodes) => {
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

  return assignStableLocalPorts(manager.normalizeFrontProxyRefs(normalizedNodes), manager.getSettingsSnapshot().proxyBasePort);
};

export const saveNodes = (manager, nodes) => {
  const savedNodes = manager.store.saveNodes(manager.normalizeNodes(nodes));
  const settings = manager.getSettingsSnapshot();
  manager.store.saveSettings({
    activeNodeId: manager.resolveActiveNodeId(settings, savedNodes)
  }, { backup: false });
  return savedNodes;
};

export const mergeAndSaveNodes = (manager, incomingNodes) => {
  return manager.saveNodes(mergeUniqueNodes(manager.store.getNodes(), incomingNodes));
};

const getNodeIds = (nodes = []) => (Array.isArray(nodes) ? nodes : [])
  .map((node) => String(node?.id || '').trim())
  .filter(Boolean);

export const importProxyLink = async (manager, link, group = null) => {
  const normalizedLink = manager.proxyService.normalizeManualImportContent
    ? manager.proxyService.normalizeManualImportContent(link)
    : manager.proxyService.normalizeSubscriptionContent
      ? manager.proxyService.normalizeSubscriptionContent(link)
      : link;
  const parsedNodes = manager.proxyService.parseProxyLinks
    ? manager.proxyService.parseProxyLinks(normalizedLink)
    : [manager.proxyService.parseProxyLink(normalizedLink)].filter(Boolean);
  if (!parsedNodes.length) {
    throw createHttpError('Invalid proxy link', 400);
  }

  const nodes = parsedNodes.map((parsedNode) => ({
    ...(parsedNode.id ? parsedNode : { ...parsedNode, id: createNodeId() }),
    ...(group ? { group } : {})
  }));
  const { validNodes, invalidNodes } = await manager.filterValidNodes(nodes);
  if (!validNodes.length) {
    throw createHttpError(buildInvalidNodeWarning(invalidNodes) || 'Invalid proxy link', 400);
  }

  const existingNodes = manager.store.getNodes();
  const duplicateCount = countPotentialDuplicateNodes(existingNodes, validNodes);
  const savedNodes = manager.saveNodes(appendNodes(existingNodes, validNodes));
  const applied = await manager.queueNodeChangesApply(savedNodes, { waitNodeIds: getNodeIds(validNodes) });
  const warning = [applied.warning, buildInvalidNodeWarning(invalidNodes)].filter(Boolean).join('; ') || null;
  return {
    node: applied.nodes.find((item) => item.id === validNodes[0].id),
    importedCount: validNodes.length,
    invalidCount: invalidNodes.length,
    duplicateCount,
    ...applied,
    warning
  };
};

export const importRawNode = async (manager, rawNode) => {
  const existingNodes = manager.store.getNodes();
  const nextNodes = mergeUniqueNodes(existingNodes, [rawNode]);
  const addedNodes = nextNodes.filter((node) => !existingNodes.some((existing) => existing.id === node.id));
  if (addedNodes.length) {
    const { invalidNodes } = await manager.filterValidNodes(addedNodes);
    if (invalidNodes.length) {
      throw createHttpError(`节点配置校验失败：${invalidNodes[0].error}`, 400);
    }
  }

  const savedNodes = manager.saveNodes(nextNodes);
  return manager.queueNodeChangesApply(savedNodes, { waitNodeIds: getNodeIds(addedNodes) });
};

export const updateNode = async (manager, nodeId, patch) => {
  const nodes = manager.store.getNodes();
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) {
    throw createHttpError('Node not found', 404);
  }

  const currentNode = nodes[index];
  if (currentNode.source === 'subscription') {
    const requestedGroup = Object.prototype.hasOwnProperty.call(patch || {}, 'group')
      ? (patch.group ? String(patch.group).trim() || null : null)
      : currentNode.group || null;
    const currentGroup = currentNode.group ? String(currentNode.group).trim() || null : null;

    if (requestedGroup !== currentGroup) {
      throw createHttpError('Subscription nodes must stay in their dedicated group', 400);
    }
  }

  nodes[index] = {
    ...(currentNode.local_port ? { local_port: currentNode.local_port } : {}),
    ...patch,
    id: nodeId,
    ...(currentNode.source === 'subscription'
      ? {
          source: currentNode.source,
          subscriptionUrl: currentNode.subscriptionUrl,
          group: currentNode.group || null
        }
      : {})
  };

  const shouldApplyRuntimeChanges = manager.shouldApplyNodeRuntimeChanges([currentNode], [nodes[index]]);
  if (shouldApplyRuntimeChanges) {
    try {
      await manager.validateSingleNodeConfig(nodes[index]);
    } catch (error) {
      throw createHttpError(`节点配置校验失败：${error.message}`, 400);
    }
  }

  const savedNodes = manager.saveNodes(nodes);
  const applied = shouldApplyRuntimeChanges
    ? await manager.queueNodeChangesApply(savedNodes, { waitNodeIds: [nodeId] })
    : await manager.buildSavedNodeChangeResult();
  return {
    node: applied.nodes.find((item) => item.id === nodeId),
    ...applied
  };
};

export const deleteNode = async (manager, nodeId) => {
  const nodes = manager.store.getNodes();
  const remainingNodes = nodes.filter((node) => node.id !== nodeId);
  if (remainingNodes.length === nodes.length) {
    throw createHttpError('Node not found', 404);
  }

  const savedNodes = manager.saveNodes(remainingNodes);
  manager.syncAutoCountryNodeGroups(savedNodes);
  return manager.queueNodeChangesApply(savedNodes);
};

export const deleteNodes = async (manager, nodeIds) => {
  const ids = [...new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    throw createHttpError('Missing node ids', 400);
  }

  const nodes = manager.store.getNodes();
  const existingIds = new Set(nodes.map((node) => node.id));
  const missingIds = ids.filter((id) => !existingIds.has(id));
  if (missingIds.length) {
    throw createHttpError(`Node not found: ${missingIds[0]}`, 404);
  }

  const idSet = new Set(ids);
  const remainingNodes = nodes.filter((node) => !idSet.has(node.id));
  const savedNodes = manager.saveNodes(remainingNodes);
  manager.syncAutoCountryNodeGroups(savedNodes);
  
  const applied = await manager.queueNodeChangesApply(savedNodes);
  return {
    deletedCount: ids.length,
    ...applied
  };
};
