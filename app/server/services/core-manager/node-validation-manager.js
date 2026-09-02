import { ProxyService } from '../../../proxy/ProxyService.js';
import {
  getNodeDisplayName
} from './state-utils.js';

export const createValidationProxyService = (manager, settings = manager.getSettingsSnapshot(), coreRuntime = null) => {
  return new ProxyService({
    configDir: manager.paths.dataDir,
    projectRoot: manager.paths.root,
    proxyListen: settings.proxyListenHost,
    basePort: settings.proxyBasePort,
    configFileName: manager.paths.configPath.split(/[/\\]/).pop(),
    log: manager.createLogger(),
    coreRuntime
  });
};

export const ensureValidationRuntime = async (manager) => {
  if (manager._validationCoreRuntime) {
    return manager._validationCoreRuntime;
  }

  const resolution = await manager.coreRuntimeFactory.createEmbedded();
  manager._validationCoreRuntime = resolution.runtime;
  return manager._validationCoreRuntime;
};

export const validateSingleNodeConfig = async (manager, node, options = {}) => {
  if (!node) {
    return { validated: false };
  }

  const settings = options.settings || manager.getSettingsSnapshot();
  const runtime = options.coreRuntime || await manager.ensureValidationRuntime();

  const candidate = { ...node };
  const service = manager.createValidationProxyService(settings, runtime);
  service.setNodes([candidate]);
  const config = service.generateConfig({
    activeNodeId: candidate.id || null,
    systemDefaultNodeId: candidate.id || null,
    proxyMode: 'global'
  });
  const expectedTag = candidate.id ? `out-${candidate.id}` : null;
  if (expectedTag && !config.outbounds?.some((outbound) => outbound.tag === expectedTag)) {
    throw new Error('节点缺少必要字段或格式不受支持');
  }

  await service.validateConfig(config);
  return { validated: true };
};

export const filterValidNodes = async (manager, nodes, options = {}) => {
  const candidates = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  if (!candidates.length) {
    return { validNodes: [], invalidNodes: [] };
  }

  const settings = options.settings || manager.getSettingsSnapshot();
  let runtime;
  try {
    runtime = options.coreRuntime || await manager.ensureValidationRuntime();
  } catch (error) {
    // Native runtime unavailable: keep the lenient legacy behaviour and accept
    // nodes without local validation instead of blocking imports entirely.
    manager.store.appendLog(`[CoreManager] Node validation skipped: native runtime unavailable (${error.message})`);
    return { validNodes: candidates, invalidNodes: [] };
  }

  const validNodes = [];
  const invalidNodes = [];

  for (const node of candidates) {
    try {
      await manager.validateSingleNodeConfig(node, { settings, coreRuntime: runtime });
      validNodes.push(node);
    } catch (error) {
      const message = String(error?.message || error || '鑺傜偣閰嶇疆鏃犳晥').trim() || '鑺傜偣閰嶇疆鏃犳晥';
      invalidNodes.push({ node, error: message });
      manager.store.appendLog(`[CoreManager] Node validation skipped ${getNodeDisplayName(node, node?.id || 'node')}: ${message}`);
    }
  }

  return { validNodes, invalidNodes };
};

export const validateRuntimeConfig = async (manager, nodes, settings = manager.getSettingsSnapshot()) => {
  if (!Array.isArray(nodes) || !nodes.length) {
    return { validated: false };
  }

  let runtime;
  try {
    runtime = await manager.ensureValidationRuntime();
  } catch (error) {
    manager.store.appendLog(`[CoreManager] Runtime config validation skipped: native runtime unavailable (${error.message})`);
    return { validated: false };
  }

  const service = manager.createValidationProxyService(settings, runtime);
  service.setNodes(nodes);
  const config = service.generateConfig(manager.getRuntimeOptions(settings, nodes));
  await service.validateConfig(config);
  return { validated: true };
};
