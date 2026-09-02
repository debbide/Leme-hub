import net from 'net';

import { normalizeHost } from '../shared/network.js';

export const writeConfig = (config, targetPath) => {
  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));
};

export const waitForPortReady = (context, port, timeoutMs = 15000, host = context.proxyListen) => {
  const targetHost = normalizeHost(host, context.proxyListen);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    };

    const attempt = () => {
      if (settled) {
        return;
      }
      const socket = new net.Socket();

      socket.once('connect', () => {
        socket.destroy();
        finish(resolve);
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          finish(reject, new Error(`Timed out waiting for the embedded core to listen on ${targetHost}:${port}`));
          return;
        }

        setTimeout(attempt, 200);
      });

      socket.connect(port, targetHost);
    };

    attempt();
  });
};

const normalizeNodeIdList = (nodeIds = []) => [...new Set(
  (Array.isArray(nodeIds) ? nodeIds : [nodeIds])
    .map((nodeId) => String(nodeId || '').trim())
    .filter(Boolean)
)];

export const collectRuntimeReadyPorts = (context, runtime = {}, options = {}) => {
  const ports = new Set();
  const waitForAllNodePorts = options.waitForAllNodePorts !== false;
  const waitNodeIds = normalizeNodeIdList(options.waitNodeIds);
  const addNodePort = (nodeId) => {
    if (!nodeId) {
      return;
    }
    const port = context.getLocalPort(nodeId);
    if (port) {
      ports.add(port);
    }
  };

  if (waitForAllNodePorts) {
    for (const node of context.nodes || []) {
      addNodePort(node?.id);
    }
  } else {
    for (const nodeId of waitNodeIds) {
      addNodePort(nodeId);
    }
    addNodePort(runtime.activeNodeId);
    addNodePort(runtime.systemDefaultNodeId);
  }

  if (runtime.systemProxyEnabled && runtime.systemProxySocksPort) {
    ports.add(runtime.systemProxySocksPort);
  }

  if (runtime.systemProxyEnabled && runtime.systemProxyHttpPort) {
    ports.add(runtime.systemProxyHttpPort);
  }

  return [...ports];
};

export const waitForRuntimeReady = async (context, runtime = {}, host = context.proxyListen, options = {}) => {
  const ports = collectRuntimeReadyPorts(context, runtime, options);

  if (!ports.length) {
    return;
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
  await Promise.all(ports.map((port) => waitForPortReady(context, port, timeoutMs, host)));
};

export const reserveEphemeralPort = async (context, host = resolveLoopbackHost(context.proxyListen)) => {
  const targetHost = normalizeHost(host, resolveLoopbackHost(context.proxyListen));
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    const cleanup = () => {
      server.removeAllListeners('error');
    };

    server.once('error', (error) => {
      cleanup();
      reject(error);
    });

    server.listen(0, targetHost, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        if (!Number.isInteger(port) || port <= 0) {
          reject(new Error(`Failed to reserve a speedtest port on ${targetHost}`));
          return;
        }
        resolve(port);
      });
    });
  });
};
