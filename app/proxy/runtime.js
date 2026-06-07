import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

import { normalizeHost, resolveLoopbackHost } from '../shared/network.js';
import { buildRoutingObservabilityLines } from './routing-observability.js';

const stripAnsi = (value = '') => String(value).replace(/\u001b\[[0-9;]*m/gu, '');

const summarizeProcessOutput = (...chunks) => stripAnsi(chunks.join('\n'))
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(-3)
  .join(' | ');

export const resolveExecutablePath = (explicitPath) => {
  if (!explicitPath) {
    throw new Error('ProxyService.start requires a resolved sing-box executable path');
  }

  const candidate = path.resolve(explicitPath);
  if (!fs.existsSync(candidate)) {
    throw new Error(`Resolved sing-box executable does not exist: ${candidate}`);
  }

  return candidate;
};

export const writeConfig = (config, targetPath) => {
  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));
};

export const validateConfig = async (context, config, options = {}) => {
  const execPath = resolveExecutablePath(options.binPath || context.executablePath);
  const explicitConfigPath = options.configPath ? path.resolve(options.configPath) : null;
  const configPath = explicitConfigPath || path.join(
    context.configDir,
    `singbox_validate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`
  );
  const shouldCleanup = !explicitConfigPath;

  writeConfig(config, configPath);

  try {
    await new Promise((resolve, reject) => {
      const stdoutChunks = [];
      const stderrChunks = [];
      let settled = false;

      const finish = (error = null) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      const processRef = spawn(execPath, ['check', '-c', configPath]);
      processRef.stdout.on('data', (data) => stdoutChunks.push(data.toString()));
      processRef.stderr.on('data', (data) => stderrChunks.push(data.toString()));
      processRef.once('error', (error) => finish(error));
      processRef.once('close', (code, signal) => {
        if (code === 0) {
          finish();
          return;
        }

        const detail = summarizeProcessOutput(stderrChunks.join('\n'), stdoutChunks.join('\n'));
        const fallback = signal
          ? `sing-box check terminated by signal ${signal}`
          : `sing-box check exited with code ${code}`;
        finish(new Error(detail || fallback));
      });
    });

    return {
      valid: true,
      configPath,
      executablePath: execPath
    };
  } finally {
    if (shouldCleanup) {
      try {
        fs.rmSync(configPath, { force: true });
      } catch {
        // best effort cleanup for transient validation files
      }
    }
  }
};

export const waitForPortReady = (context, port, timeoutMs = 15000, host = context.proxyListen, processRef = null) => {
  const targetHost = normalizeHost(host, context.proxyListen);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (processRef) {
        processRef.off('error', onProcessError);
        processRef.off('exit', onProcessExit);
      }
      callback(value);
    };

    const onProcessError = (error) => {
      finish(reject, error);
    };

    const onProcessExit = (code, signal) => {
      const detail = code !== null
        ? `exit code ${code}`
        : signal
          ? `signal ${signal}`
          : 'unknown status';
      finish(reject, new Error(`sing-box exited before listening on ${targetHost}:${port} (${detail})`));
    };

    if (processRef) {
      processRef.once('error', onProcessError);
      processRef.once('exit', onProcessExit);
    }

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
          finish(reject, new Error(`Timed out waiting for sing-box to listen on ${targetHost}:${port}`));
          return;
        }

        setTimeout(attempt, 200);
      });

      socket.connect(port, targetHost);
    };

    attempt();
  });
};

export const waitForRuntimeReady = async (context, runtime = {}, host = context.proxyListen, processRef = context.proxyProcess) => {
  const ports = new Set((context.nodes || []).map((node) => context.getLocalPort(node.id)).filter(Boolean));

  if (runtime.systemProxyEnabled && runtime.systemProxySocksPort) {
    ports.add(runtime.systemProxySocksPort);
  }

  if (runtime.systemProxyEnabled && runtime.systemProxyHttpPort) {
    ports.add(runtime.systemProxyHttpPort);
  }

  if (!ports.size) {
    return;
  }

  await Promise.all([...ports].map((port) => waitForPortReady(context, port, 15000, host, processRef)));
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

export const stopProcess = async (processRef) => {
  if (!processRef) {
    return;
  }

  if (processRef.exitCode !== null || processRef.killed) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    let forceTimer = null;
    let resolveTimer = null;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (forceTimer) clearTimeout(forceTimer);
      if (resolveTimer) clearTimeout(resolveTimer);
      resolve();
    };

    processRef.once('exit', finish);
    processRef.once('close', finish);

    try {
      processRef.kill();
    } catch {
      finish();
      return;
    }

    forceTimer = setTimeout(() => {
      try {
        processRef.kill('SIGKILL');
      } catch {
        finish();
      }
    }, 1500);

    resolveTimer = setTimeout(finish, 4000);
  });
};

export const stopProxyRuntime = async (context) => {
  if (!context.proxyProcess) {
    return;
  }

  const processRef = context.proxyProcess;
  context.proxyProcess = null;
  await stopProcess(processRef);
};

export const startProxyRuntime = async (context, options = {}) => {
  if (context.nodes.length === 0) {
    throw new Error('No proxy nodes configured');
  }

  const runtimeOptions = { ...(options.runtime || {}) };
  context.runtimeOptions = runtimeOptions;
  const config = context.generateConfig(runtimeOptions);
  const execPath = resolveExecutablePath(options.binPath);
  context.executablePath = execPath;
  await validateConfig(context, config, { binPath: execPath });
  writeConfig(config, context.configPath);
  buildRoutingObservabilityLines(runtimeOptions, config)
    .forEach((line) => context.log.log(line));
  await stopProxyRuntime(context);

  context.proxyProcess = spawn(execPath, ['run', '-c', context.configPath]);

  context.proxyProcess.stdout.on('data', (data) => {
    data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => context.handleProxyRuntimeLine(line));
  });

  context.proxyProcess.stderr.on('data', (data) => {
    data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => {
      const prefixedLine = `[Proxy STDERR] ${line}`;
      context.log.error(prefixedLine);
      context.handleProxyRuntimeLine(prefixedLine, { logRaw: false });
    });
  });

  context.proxyProcess.on('error', (error) => {
    context.log.error(`[ProxyService] Failed to start sing-box process: ${error.message}`);
  });

  await waitForRuntimeReady(context, runtimeOptions, context.proxyListen, context.proxyProcess);

  return {
    started: true,
    configPath: context.configPath,
    executablePath: execPath
  };
};

export const restartProxyRuntime = async (context, nodes, options = {}) => {
  context.setNodes(nodes);
  return startProxyRuntime(context, options);
};
