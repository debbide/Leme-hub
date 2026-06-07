import { createNodeId, getNodeSignature } from './common.js';

const assignStableLocalPorts = (nodes, basePort) => {
  const occupied = new Set();
  const reservedPorts = new Set([18998, 18999]);
  let nextPort = basePort;

  reservedPorts.forEach((port) => occupied.add(port));

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

const appendNodes = (existingNodes, incomingNodes) => [...existingNodes, ...incomingNodes];

const countPotentialDuplicateNodes = (existingNodes, incomingNodes) => {
  const seenIds = new Set(existingNodes.map((node) => node.id));
  const seenSignatures = new Set(existingNodes.map(getNodeSignature));
  return incomingNodes.reduce((count, node) => {
    const withId = node.id ? node : { ...node, id: createNodeId() };
    const signature = getNodeSignature(withId);
    if (seenIds.has(withId.id) || seenSignatures.has(signature)) {
      return count + 1;
    }
    return count;
  }, 0);
};

export {
  appendNodes,
  assignStableLocalPorts,
  countPotentialDuplicateNodes,
  mergeUniqueNodes
};
