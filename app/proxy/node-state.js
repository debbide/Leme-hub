export const setNodes = (context, nodes) => {
  context.nodes = Array.isArray(nodes) ? nodes : [];
  updatePortMap(context);
};

export const resolveDefaultNodeId = (validNodes, requestedNodeId) => {
  if (requestedNodeId && validNodes.some((node) => node.id === requestedNodeId)) {
    return requestedNodeId;
  }

  return validNodes[0]?.id || null;
};

export const updatePortMap = (context) => {
  context.nodePortMap.clear();
  const usedPorts = new Set();
  const reservedPorts = new Set([18998, 18999]);

  reservedPorts.forEach((port) => {
    if (Number.isInteger(port) && port > 0) {
      usedPorts.add(port);
    }
  });

  context.nodes.forEach((node, index) => {
    let desiredPort = null;

    if (node && node.local_port !== undefined && node.local_port !== null) {
      const parsed = parseInt(node.local_port, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        desiredPort = parsed;
      }
    }

    if (!desiredPort || usedPorts.has(desiredPort)) {
      desiredPort = context.basePort + index;
      while (usedPorts.has(desiredPort)) {
        desiredPort += 1;
      }
    }

    usedPorts.add(desiredPort);
    context.nodePortMap.set(node.id, desiredPort);
  });
};

export const getLocalPort = (context, nodeId) => context.nodePortMap.get(nodeId);
