import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

import {
  DEFAULT_DNS_BOOTSTRAP_SERVER,
  DEFAULT_DNS_DIRECT_SERVER,
  DEFAULT_DNS_STRATEGY,
  DEFAULT_PROXY_BASE_PORT,
  DEFAULT_SPEEDTEST_URL
} from '../shared/constants.js';
import { formatHostForUrl, normalizeHost, resolveLoopbackHost } from '../shared/network.js';

const SPEEDTEST_CONFIG_PREFIX = 'singbox_speedtest_';
const SPEEDTEST_REQUEST_COUNT = 2;
const SPEEDTEST_REQUEST_GAP_MS = 100;
const SPEEDTEST_WARMUP_DELAY_MS = 1000;
const SPEEDTEST_TIMEOUT_MS = 10000;

const toInt = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeSpeedtestError = (error, targetUrl = '') => {
  const status = Number.parseInt(error?.response?.status, 10);
  if (Number.isInteger(status) && status > 0) {
    return `测速目标返回 HTTP ${status}`;
  }

  const code = String(error?.code || '').trim().toUpperCase();
  const rawMessage = String(error?.message || '').trim();
  const message = rawMessage.toLowerCase();
  if (message.includes('client network socket disconnected before secure tls connection was established')) {
    return `测速目标 TLS 握手失败，节点或测速地址可能不兼容${targetUrl ? `: ${targetUrl}` : ''}`;
  }
  if (message.includes('certificate') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return `测速目标证书校验失败${targetUrl ? `: ${targetUrl}` : ''}`;
  }
  if (code === 'ECONNABORTED' || message.includes('timeout')) {
    return '测速请求超时';
  }
  if (code === 'ECONNRESET' || message.includes('socket hang up')) {
    return '测速连接被重置';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `测速目标解析失败${targetUrl ? `: ${targetUrl}` : ''}`;
  }
  if (code === 'ECONNREFUSED') {
    return '测速代理入口不可用';
  }

  return rawMessage || code || '测速失败';
};

export const buildSpeedtestRuntimeOptions = (context, options = {}) => {
  const runtime = {
    ...context.runtimeOptions,
    ...(options.runtime || {})
  };
  const rawStrategy = String(options.dnsStrategy || runtime.dnsStrategy || DEFAULT_DNS_STRATEGY).trim();
  const dnsStrategy = ['prefer_ipv4', 'ipv4_only', 'prefer_ipv6', 'ipv6_only'].includes(rawStrategy)
    ? rawStrategy
    : DEFAULT_DNS_STRATEGY;
  const dnsDirectServer = String(options.dnsDirectServer || runtime.dnsDirectServer || DEFAULT_DNS_DIRECT_SERVER).trim() || DEFAULT_DNS_DIRECT_SERVER;

  return {
    activeNodeId: options.activeNodeId || null,
    dnsRemoteServer: String(options.dnsRemoteServer || dnsDirectServer).trim() || dnsDirectServer,
    dnsDirectServer,
    dnsBootstrapServer: String(options.dnsBootstrapServer || runtime.dnsBootstrapServer || DEFAULT_DNS_BOOTSTRAP_SERVER).trim() || DEFAULT_DNS_BOOTSTRAP_SERVER,
    dnsFinal: 'dns-local',
    dnsStrategy,
    speedtestUrl: String(options.speedtestUrl || runtime.speedtestUrl || DEFAULT_SPEEDTEST_URL).trim() || DEFAULT_SPEEDTEST_URL,
    tlsFragmentEnabled: options.tlsFragmentEnabled ?? runtime.tlsFragmentEnabled ?? false
  };
};

export const createSpeedtestService = (context, nodes, options = {}) => {
  const speedtestNodes = (Array.isArray(nodes) ? nodes : [nodes])
    .filter(Boolean)
    .map((node) => ({ ...node }));
  if (!speedtestNodes.length) {
    throw new Error('No nodes selected for speed test');
  }

  const listenHost = normalizeHost(options.proxyListen, resolveLoopbackHost(context.proxyListen));
  const basePort = toInt(options.basePort, DEFAULT_PROXY_BASE_PORT);
  const service = new context.constructor({
    configDir: context.configDir,
    projectRoot: context.projectRoot,
    proxyListen: listenHost,
    basePort,
    log: context.log
  });
  service.setNodes(speedtestNodes);

  const runtime = buildSpeedtestRuntimeOptions(context, {
    ...options,
    activeNodeId: speedtestNodes[0]?.id || null
  });
  const config = service.generateConfig(runtime);
  delete config.experimental;

  return {
    service,
    config,
    listenHost,
    runtime
  };
};

export const resolveSpeedtestNodes = (context, nodes = []) => {
  const selectedNodes = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
  const sourceNodeMap = new Map(
    (context.nodes || [])
      .filter((node) => node?.id)
      .map((node) => [node.id, node])
  );
  const includedNodeMap = new Map();
  const includeNode = (node) => {
    if (!node?.id || includedNodeMap.has(node.id)) {
      return;
    }
    includedNodeMap.set(node.id, { ...node });
  };

  selectedNodes.forEach(includeNode);

  selectedNodes.forEach((node) => {
    if (String(node.type || '').toLowerCase() !== 'socks') {
      return;
    }
    const frontProxyNodeId = String(node.frontProxyNodeId || '').trim();
    if (!frontProxyNodeId || frontProxyNodeId === node.id || includedNodeMap.has(frontProxyNodeId)) {
      return;
    }
    const frontProxyNode = sourceNodeMap.get(frontProxyNodeId);
    if (!frontProxyNode || String(frontProxyNode.type || '').toLowerCase() === 'socks') {
      return;
    }
    includeNode(frontProxyNode);
  });

  return [...includedNodeMap.values()];
};

export const withSpeedtestRuntime = async (context, nodes, options = {}, callback) => {
  const selectedNodes = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
  if (!selectedNodes.length) {
    throw new Error('No nodes selected for speed test');
  }

  const execPath = context.resolveExecutablePath(options.binPath || context.executablePath);
  const listenHost = normalizeHost(options.proxyListen, resolveLoopbackHost(context.proxyListen));
  const selectedNodeIds = new Set(selectedNodes.map((node) => node?.id).filter(Boolean));
  const speedtestNodes = resolveSpeedtestNodes(context, selectedNodes);
  const allocatedNodes = [];
  for (const node of speedtestNodes) {
    const localPort = await context.reserveEphemeralPort(listenHost);
    allocatedNodes.push({ ...node, local_port: localPort });
  }
  const testedNodes = allocatedNodes.filter((node) => selectedNodeIds.has(node.id));

  const { service, config, runtime } = createSpeedtestService(context, allocatedNodes, {
    ...options,
    proxyListen: listenHost,
    basePort: allocatedNodes[0]?.local_port || options.basePort
  });
  const configPath = path.join(
    context.configDir,
    `${SPEEDTEST_CONFIG_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`
  );

  let processRef = null;
  const stderrLines = [];
  try {
    context.writeConfig(config, configPath);
    context.log.log?.(`[Speedtest] Starting dedicated runtime nodes=${allocatedNodes.map((node) => node.id).join(',')} url=${runtime.speedtestUrl} dns=${runtime.dnsDirectServer} bootstrap=${runtime.dnsBootstrapServer} listen=${listenHost}`);
    processRef = spawn(execPath, ['run', '-c', configPath]);

    processRef.stdout.on('data', (data) => {
      data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => {
        context.log.log?.(`[Speedtest Log] ${line}`);
      });
    });

    processRef.stderr.on('data', (data) => {
      data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => {
        stderrLines.push(line);
        context.log.error?.(`[Speedtest STDERR] ${line}`);
      });
    });

    processRef.on('error', (error) => {
      context.log.error?.(`[ProxyService] Failed to start speedtest sing-box process: ${error.message}`);
    });

    try {
      await service.waitForRuntimeReady({}, listenHost, processRef);
    } catch (error) {
      const stderrDetail = stderrLines.slice(-3).join(' | ');
      if (stderrDetail) {
        throw new Error(`${error.message}: ${stderrDetail}`);
      }
      throw error;
    }
    await sleep(toInt(options.warmupDelayMs, SPEEDTEST_WARMUP_DELAY_MS));

    return await callback({
      service,
      listenHost,
      configPath,
      processRef,
      nodes: testedNodes,
      runtime
    });
  } finally {
    await context.stopProcess(processRef);
    try {
      fs.unlinkSync(configPath);
    } catch {
      // ignore temp speedtest cleanup failures
    }
  }
};

export const measureSpeedtestLatency = async (context, localPort, options = {}) => {
  const targetUrl = String(options.url || DEFAULT_SPEEDTEST_URL).trim() || DEFAULT_SPEEDTEST_URL;
  const requestCount = Math.max(1, toInt(options.requestCount, SPEEDTEST_REQUEST_COUNT));
  const requestGapMs = Math.max(0, toInt(options.requestGapMs, SPEEDTEST_REQUEST_GAP_MS));
  const timeoutMs = Math.max(1000, toInt(options.timeoutMs, SPEEDTEST_TIMEOUT_MS));
  const listenHost = normalizeHost(options.proxyListen, resolveLoopbackHost(context.proxyListen));
  const agent = new SocksProxyAgent(`socks5h://${formatHostForUrl(listenHost)}:${localPort}`, {
    keepAlive: true,
    timeout: timeoutMs
  });
  const samples = [];
  const nodeId = String(options.nodeId || '').trim() || 'unknown';

  for (let index = 0; index < requestCount; index += 1) {
    const startedAt = Date.now();
    try {
      const response = await axios.get(targetUrl, {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: timeoutMs,
        proxy: false,
        validateStatus: () => true
      });
      const latencyMs = Date.now() - startedAt;
      samples.push(latencyMs);
      context.log.log?.(`[Speedtest] node=${nodeId} sample=${index + 1}/${requestCount} url=${targetUrl} via=${listenHost}:${localPort} proxy=socks5h keepalive=on dns=proxy status=${response.status || 0} latency=${latencyMs}ms`);
    } catch (error) {
      const detail = error?.response?.status
        ? `HTTP ${error.response.status}`
        : error?.code || error?.message || 'unknown error';
      context.log.error?.(`[Speedtest] node=${nodeId} sample=${index + 1}/${requestCount} url=${targetUrl} via=${listenHost}:${localPort} proxy=socks5h keepalive=on dns=proxy failed=${detail}`);
      throw new Error(normalizeSpeedtestError(error, targetUrl));
    }
    if (index + 1 < requestCount) {
      await sleep(requestGapMs);
    }
  }

  return Math.min(...samples);
};

export const testNode = async (context, nodeId, options = {}) => {
  const [result] = await testNodes(context, [nodeId], options);
  if (!result?.ok) {
    throw new Error(result?.error || 'Speed test failed');
  }
  return result.latencyMs;
};

export const testNodes = async (context, nodeIds = [], options = {}) => {
  const requestedIds = Array.isArray(nodeIds) && nodeIds.length
    ? [...new Set(nodeIds)]
    : context.nodes.map((node) => node.id);
  const selectedNodes = requestedIds
    .map((nodeId) => context.nodes.find((node) => node?.id === nodeId))
    .filter(Boolean);

  if (!selectedNodes.length) {
    throw new Error('No nodes selected for speed test');
  }

  const concurrency = 5;
  return withSpeedtestRuntime(context, selectedNodes, options, async ({ service, listenHost, nodes, runtime }) => {
    const results = [];
    for (let index = 0; index < nodes.length; index += concurrency) {
      const batch = nodes.slice(index, index + concurrency);
      const batchResults = await Promise.all(batch.map(async (node) => {
        let result;
        try {
          const latencyMs = await measureSpeedtestLatency(context, service.getLocalPort(node.id), {
            proxyListen: listenHost,
            url: runtime.speedtestUrl,
            nodeId: node.id
          });
          result = { id: node.id, ok: true, latencyMs };
        } catch (error) {
          result = { id: node.id, ok: false, error: error.message };
        }
        await options.onResult?.(result);
        return result;
      }));
      results.push(...batchResults);
    }
    return results;
  });
};
