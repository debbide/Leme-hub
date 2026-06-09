import {
  buildDeferredApplyWarning,
  getNodesRuntimeSignature
} from './state-utils.js';

const NODE_APPLY_DEBOUNCE_MS = 120;
const MAX_READY_NODE_WAIT_IDS = 16;

const normalizeWaitNodeIds = (nodeIds = []) => [...new Set(
  (Array.isArray(nodeIds) ? nodeIds : [nodeIds])
    .map((nodeId) => String(nodeId || '').trim())
    .filter(Boolean)
)].slice(0, MAX_READY_NODE_WAIT_IDS);

const getFastNodeRecords = (manager) => manager.getNodeRecords({ enrichGeoIp: false });

const mergePendingWaitNodeIds = (manager, waitNodeIds = []) => {
  const merged = [
    ...(Array.isArray(manager._nodeApplyPendingWaitNodeIds) ? manager._nodeApplyPendingWaitNodeIds : []),
    ...normalizeWaitNodeIds(waitNodeIds)
  ];
  manager._nodeApplyPendingWaitNodeIds = normalizeWaitNodeIds(merged);
};

const buildFastRestartOptions = (waitNodeIds = []) => ({
  skipValidation: true,
  waitForAllNodePorts: false,
  waitNodeIds: normalizeWaitNodeIds(waitNodeIds)
});

const scheduleApplyQueue = (manager) => {
  manager._nodeApplyTimer = setTimeout(() => {
    manager._nodeApplyTimer = null;
    void manager.runNodeChangesApplyQueue();
  }, NODE_APPLY_DEBOUNCE_MS);
  manager._nodeApplyTimer.unref?.();
};

export const applyNodeChanges = async (manager, savedNodes, options = {}) => {
  if (manager.state.status !== 'running') {
    const nodes = await getFastNodeRecords(manager);
    return {
      nodes,
      restartRequired: false,
      autoRestarted: false,
      core: manager.getStatus()
    };
  }

  try {
    await manager.validateRuntimeConfig(savedNodes);
  } catch (error) {
    const warning = buildDeferredApplyWarning(error.message);
    manager.store.appendLog(`[CoreManager] Auto-apply skipped: ${error.message}`);
    return {
      nodes: await getFastNodeRecords(manager),
      restartRequired: false,
      autoRestarted: false,
      warning,
      core: manager.getStatus()
    };
  }

  const core = await manager.restart(buildFastRestartOptions(options.waitNodeIds));
  return {
    nodes: await getFastNodeRecords(manager),
    restartRequired: false,
    autoRestarted: true,
    core
  };
};

export const queueNodeChangesApply = async (manager, savedNodes, options = {}) => {
  if (manager.state.status !== 'running') {
    const nodes = await getFastNodeRecords(manager);
    return {
      nodes,
      restartRequired: false,
      autoRestarted: false,
      applyPending: false,
      core: manager.getStatus()
    };
  }

  manager._nodeApplyPendingNodes = Array.isArray(savedNodes) ? [...savedNodes] : [];
  mergePendingWaitNodeIds(manager, options.waitNodeIds);
  manager._nodeApplyLastError = null;
  manager._nodeApplyLastFailedAt = null;

  const shouldStartApply = !manager._nodeApplyRunning;
  if (shouldStartApply) {
    manager._nodeApplyRunning = true;
    manager._nodeApplyLastStartedAt = new Date().toISOString();
  }

  const nodes = await getFastNodeRecords(manager);

  if (shouldStartApply) {
    scheduleApplyQueue(manager);
  }

  return {
    nodes,
    restartRequired: false,
    autoRestarted: false,
    applyPending: true,
    warning: '节点已保存，正在后台应用到核心',
    core: manager.getStatus()
  };
};

export const runNodeChangesApplyQueue = async (manager) => {
  while (manager._nodeApplyPendingNodes) {
    const nodes = manager._nodeApplyPendingNodes;
    const waitNodeIds = normalizeWaitNodeIds(manager._nodeApplyPendingWaitNodeIds);
    manager._nodeApplyPendingNodes = null;
    manager._nodeApplyPendingWaitNodeIds = null;

    if (manager.state.status !== 'running') {
      continue;
    }

    try {
      await manager.validateRuntimeConfig(nodes);
      if (manager._nodeApplyPendingNodes) {
        continue;
      }
      if (manager.state.status === 'running') {
        await manager.restart(buildFastRestartOptions(waitNodeIds));
        manager._nodeApplyLastAppliedAt = new Date().toISOString();
        manager.store.appendLog('[CoreManager] Queued node changes applied to running core');
      }
      manager._nodeApplyLastError = null;
      manager._nodeApplyLastFailedAt = null;
    } catch (error) {
      manager._nodeApplyLastError = error.message;
      manager._nodeApplyLastFailedAt = new Date().toISOString();
      manager.store.appendLog(`[CoreManager] Queued node apply failed: ${error.message}`);
    }
  }

  manager._nodeApplyRunning = false;

  if (manager._nodeApplyPendingNodes) {
    manager._nodeApplyRunning = true;
    manager._nodeApplyLastStartedAt = new Date().toISOString();
    scheduleApplyQueue(manager);
  }
};

export const getNodeApplyStatus = (manager) => {
  const pending = Boolean(manager._nodeApplyPendingNodes);
  const running = Boolean(manager._nodeApplyRunning);
  const lastError = manager._nodeApplyLastError || null;
  const state = running || pending
    ? 'applying'
    : lastError
      ? 'failed'
      : manager._nodeApplyLastAppliedAt
        ? 'applied'
        : 'idle';

  return {
    state,
    pending,
    running,
    lastError,
    lastStartedAt: manager._nodeApplyLastStartedAt,
    lastAppliedAt: manager._nodeApplyLastAppliedAt,
    lastFailedAt: manager._nodeApplyLastFailedAt
  };
};

export const shouldApplyNodeRuntimeChanges = (manager, previousNodes, nextNodes) => {
  return getNodesRuntimeSignature(previousNodes) !== getNodesRuntimeSignature(nextNodes);
};

export const buildSavedNodeChangeResult = async (manager) => {
  return {
    nodes: await getFastNodeRecords(manager),
    restartRequired: false,
    autoRestarted: false,
    applyPending: false,
    core: manager.getStatus()
  };
};
