import {
  buildDeferredApplyWarning,
  getNodesRuntimeSignature
} from './state-utils.js';

export const applyNodeChanges = async (manager, savedNodes) => {
  if (manager.state.status !== 'running') {
    const nodes = await manager.getNodeRecords();
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
      nodes: await manager.getNodeRecords(),
      restartRequired: false,
      autoRestarted: false,
      warning,
      core: manager.getStatus()
    };
  }

  const core = await manager.restart();
  return {
    nodes: await manager.getNodeRecords(),
    restartRequired: false,
    autoRestarted: true,
    core
  };
};

export const queueNodeChangesApply = async (manager, savedNodes) => {
  if (manager.state.status !== 'running') {
    const nodes = await manager.getNodeRecords();
    return {
      nodes,
      restartRequired: false,
      autoRestarted: false,
      applyPending: false,
      core: manager.getStatus()
    };
  }

  manager._nodeApplyPendingNodes = Array.isArray(savedNodes) ? [...savedNodes] : [];
  manager._nodeApplyLastError = null;
  manager._nodeApplyLastFailedAt = null;

  const shouldStartApply = !manager._nodeApplyRunning;
  if (shouldStartApply) {
    manager._nodeApplyRunning = true;
    manager._nodeApplyLastStartedAt = new Date().toISOString();
  }

  const nodes = await manager.getNodeRecords();

  if (shouldStartApply) {
    setTimeout(() => {
      void manager.runNodeChangesApplyQueue();
    }, 0);
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
    manager._nodeApplyPendingNodes = null;

    if (manager.state.status !== 'running') {
      continue;
    }

    try {
      await manager.validateRuntimeConfig(nodes);
      if (manager._nodeApplyPendingNodes) {
        continue;
      }
      if (manager.state.status === 'running') {
        await manager.restart();
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
    setTimeout(() => {
      void manager.runNodeChangesApplyQueue();
    }, 0);
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
    nodes: await manager.getNodeRecords(),
    restartRequired: false,
    autoRestarted: false,
    applyPending: false,
    core: manager.getStatus()
  };
};
