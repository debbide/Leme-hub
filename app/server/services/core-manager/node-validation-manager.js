import fs from 'fs';
import path from 'path';

import { ProxyService } from '../../../proxy/ProxyService.js';
import {
  getNodeDisplayName
} from './state-utils.js';

export const createValidationProxyService = (manager, settings = manager.getSettingsSnapshot()) => {
  return new ProxyService({
    configDir: manager.paths.dataDir,
    projectRoot: manager.paths.root,
    proxyListen: settings.proxyListenHost,
    basePort: settings.proxyBasePort,
    configFileName: manager.paths.configPath.split(/[/\\]/).pop(),
    log: manager.createLogger()
  });
};

export const resolveValidationBinaryPath = (manager, settings = manager.getSettingsSnapshot()) => {
  const status = manager.binaryManager.getStatus(settings.singBoxBinaryPath);
  const candidates = [
    manager.state.binary?.resolvedPath,
    manager.state.executablePath,
    status.configuredExists ? status.configuredPath : null,
    status.managedExists ? status.managedPath : null
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
};

export const validateSingleNodeConfig = async (manager, node, options = {}) => {
  if (!node) {
    return { validated: false };
  }

  const settings = options.settings || manager.getSettingsSnapshot();
  const binPath = options.binPath || manager.resolveValidationBinaryPath(settings);
  if (!binPath) {
    return { validated: false };
  }

  const candidate = { ...node };
  const service = manager.createValidationProxyService(settings);
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

  await service.validateConfig(config, { binPath });
  return { validated: true, binPath };
};

export const filterValidNodes = async (manager, nodes, options = {}) => {
  const candidates = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  if (!candidates.length) {
    return { validNodes: [], invalidNodes: [] };
  }

  const settings = options.settings || manager.getSettingsSnapshot();
  const binPath = options.binPath || manager.resolveValidationBinaryPath(settings);
  if (!binPath) {
    return { validNodes: candidates, invalidNodes: [] };
  }

  const validNodes = [];
  const invalidNodes = [];

  for (const node of candidates) {
    try {
      await manager.validateSingleNodeConfig(node, { settings, binPath });
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
  const binPath = manager.resolveValidationBinaryPath(settings);
  if (!binPath || !Array.isArray(nodes) || !nodes.length) {
    return { validated: false };
  }

  const service = manager.createValidationProxyService(settings);
  service.setNodes(nodes);
  const config = service.generateConfig(manager.getRuntimeOptions(settings, nodes));
  await service.validateConfig(config, { binPath });
  return { validated: true, binPath };
};
