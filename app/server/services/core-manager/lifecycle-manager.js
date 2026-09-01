export const bindProcessState = (manager) => {
  const boundProcess = manager.proxyService.proxyProcess;
  if (!boundProcess) {
    return;
  }

  boundProcess.once('exit', async (code, signal) => {
    if (manager._expectedCoreExitProcess === boundProcess) {
      return;
    }
    if (manager.proxyService.proxyProcess !== boundProcess) {
      return;
    }

    const wasRunning = manager.state.status === 'running';
    await manager.cleanupSystemProxyAfterExit();
    await manager.cleanupTunCaptureAfterExit?.();
    if (manager.proxyService.proxyProcess !== boundProcess) {
      return;
    }

    const isClean = code === 0 || signal === 'SIGTERM';
    manager.state = {
      ...manager.state,
      status: isClean ? 'stopped' : 'error',
      lastError: isClean
        ? null
        : `sing-box exited unexpectedly${code !== null ? ` with code ${code}` : ''}`,
      startedAt: null,
      executablePath: null
    };

    if (!isClean && wasRunning) {
      const maxRestartAttempts = 5;
      manager._restartAttempts = (manager._restartAttempts || 0) + 1;
      if (manager._restartAttempts > maxRestartAttempts) {
        manager.store.appendLog(`[CoreManager] sing-box crashed ${maxRestartAttempts} times, giving up`);
        manager.state = { ...manager.state, status: 'crashed', lastError: 'sing-box crashed too many times, manual restart required' };
        return;
      }
      const delay = Math.min(1000 * 2 ** (manager._restartAttempts - 1), 30000);
      manager.store.appendLog(`[CoreManager] sing-box crashed, restarting in ${delay}ms (attempt ${manager._restartAttempts}/${maxRestartAttempts})`);
      if (manager._autoRestartTimer) {
        clearTimeout(manager._autoRestartTimer);
      }
      manager._autoRestartTimer = setTimeout(async () => {
        manager._autoRestartTimer = null;
        try {
          await manager.start();
          manager._restartAttempts = 0;
        } catch (err) {
          manager.store.appendLog(`[CoreManager] Auto-restart failed: ${err.message}`);
        }
      }, delay);
      manager._autoRestartTimer.unref?.();
    } else {
      manager._restartAttempts = 0;
    }
  });
};

export const start = async (manager, options = {}) => {
  let binary = null;
  let runtimeResolution = null;
  let replacedProcess = null;

  try {
    if (manager._autoRestartTimer) {
      clearTimeout(manager._autoRestartTimer);
      manager._autoRestartTimer = null;
    }
    const settings = manager.getSettingsSnapshot();
    const nodes = manager.store.getNodes();

    // Preserve the existing process-mode bootstrap order: resolve the managed
    // executable before mutating ProxyService node state. Auto mode still
    // resolves Native first and only bootstraps the executable after fallback.
    const requestedRuntimeMode = String(settings.coreRuntimeMode || 'process').trim().toLowerCase();
    if (requestedRuntimeMode === 'process') {
      binary = await manager.binaryManager.ensureAvailable(settings.singBoxBinaryPath);
    }

    manager.proxyService.setNodes(nodes);

    runtimeResolution = await manager.coreRuntimeFactory.resolve(manager.proxyService, {
      mode: settings.coreRuntimeMode,
      process: {
        binPath: settings.singBoxBinaryPath
      }
    });

    if (runtimeResolution.mode === 'process') {
      binary = binary || await manager.binaryManager.ensureAvailable(settings.singBoxBinaryPath);
      runtimeResolution.runtime.defaultOptions = {
        ...runtimeResolution.runtime.defaultOptions,
        binPath: binary.executablePath
      };
    }

    if (typeof manager.proxyService.setCoreRuntime === 'function') {
      manager.proxyService.setCoreRuntime(runtimeResolution.runtime);
    }
    replacedProcess = manager.proxyService.proxyProcess || null;
    if (replacedProcess) {
      manager._expectedCoreExitProcess = replacedProcess;
    }
    let result;
    try {
      result = await manager.proxyService.start({
        ...(binary ? { binPath: binary.executablePath } : {}),
        runtime: manager.getRuntimeOptions(settings, nodes),
        skipValidation: !!options.skipValidation,
        waitForAllNodePorts: options.waitForAllNodePorts,
        waitNodeIds: options.waitNodeIds,
        readyTimeoutMs: options.readyTimeoutMs
      });
    } finally {
      if (manager._expectedCoreExitProcess === replacedProcess) {
        manager._expectedCoreExitProcess = null;
      }
    }
    let systemProxy = null;
    if (settings.systemProxyEnabled && settings.systemProxyCaptureEnabled && !settings.tunEnabled) {
      systemProxy = await manager.systemProxyManager.apply({
        host: settings.proxyListenHost,
        httpPort: settings.systemProxyHttpPort,
        socksPort: settings.systemProxySocksPort
      });
    } else {
      systemProxy = await manager.systemProxyManager.getStatus().catch(() => manager.buildSystemProxyState());
      if (manager.isManagedSystemProxyStatus(systemProxy, settings)) {
        systemProxy = await manager.systemProxyManager.disable();
      }
    }

    // TUN capture is config-driven: once the core is running with tun-in, mark capture.
    // Clear the flag when TUN is off so status never lies after a mode switch.
    if (settings.tunEnabled && !settings.tunCaptureEnabled) {
      await manager.updateSettings({ tunCaptureEnabled: true }, { backup: false });
    } else if (!settings.tunEnabled && settings.tunCaptureEnabled) {
      await manager.updateSettings({ tunCaptureEnabled: false }, { backup: false });
    }

    manager.state = {
      ...manager.state,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastError: null,
      executablePath: result.executablePath || null,
      configPath: result.configPath,
      coreRuntime: {
        mode: runtimeResolution.mode,
        source: runtimeResolution.source,
        libraryPath: runtimeResolution.libraryPath || null,
        runtimeVersion: runtimeResolution.runtimeVersion || null,
        singBoxVersion: runtimeResolution.singBoxVersion || null,
        abiVersion: runtimeResolution.abiVersion || null,
        fallbackFrom: runtimeResolution.fallbackFrom || null,
        fallbackError: runtimeResolution.fallbackError || null
      },
      binary: manager.buildBinaryState({
        status: 'ready',
        mode: runtimeResolution.mode,
        resolvedPath: binary?.executablePath || runtimeResolution.libraryPath || null,
        source: binary?.source || runtimeResolution.source,
        lastError: null,
        version: binary?.version || runtimeResolution.singBoxVersion || manager.state.binary.version,
        runtimeVersion: runtimeResolution.runtimeVersion || null,
        abiVersion: runtimeResolution.abiVersion || null
      }),
      systemProxy: manager.buildSystemProxyState(systemProxy)
    };
    if (runtimeResolution.mode === 'process') {
      manager.bindProcessState();
    }
    try {
      await manager.syncRunningSelectors(settings, nodes);
    } catch (syncError) {
      manager.store.appendLog(`[CoreManager] Failed to sync running selectors: ${syncError.message}`);
    }
    void manager.runNodeGroupAutoTestTick();
    return manager.getStatus();
  } catch (error) {
    const preserveRunningProcess = error?.phase === 'validation'
      && replacedProcess
      && manager.proxyService?.proxyProcess === replacedProcess;

    if (binary && manager.proxyService?.proxyProcess && !preserveRunningProcess) {
      await manager.proxyService.stop();
    }

    if (preserveRunningProcess) {
      // Config validation failed while the previous sing-box process is still
      // serving. Leave it running and surface the error without tearing down a
      // working proxy.
      manager.state = {
        ...manager.state,
        lastError: error.message
      };
      throw error;
    }

    const hasReadyRuntime = !!binary || runtimeResolution?.mode === 'embedded';
    const binaryState = hasReadyRuntime
      ? manager.buildBinaryState({
          status: 'ready',
          mode: runtimeResolution?.mode || 'process',
          resolvedPath: binary?.executablePath || runtimeResolution?.libraryPath || null,
          source: binary?.source || runtimeResolution?.source,
          lastError: null,
          version: binary?.version || runtimeResolution?.singBoxVersion || manager.state.binary.version,
          runtimeVersion: runtimeResolution?.runtimeVersion || null,
          abiVersion: runtimeResolution?.abiVersion || null
        })
      : manager.buildBinaryState({
          status: 'error',
          lastError: error.message
        });

    manager.state = {
      ...manager.state,
      status: 'error',
      lastError: error.message,
      binary: binaryState,
      systemProxy: manager.buildSystemProxyState({
        ...manager.state.systemProxy,
        lastError: manager.state.systemProxy?.lastError || null
      })
    };
    throw error;
  }
};

export const stop = async (manager) => {
  manager._restartAttempts = 0;
  if (manager._autoRestartTimer) {
    clearTimeout(manager._autoRestartTimer);
    manager._autoRestartTimer = null;
  }
  const stoppingProcess = manager.proxyService.proxyProcess || null;
  if (stoppingProcess) {
    manager._expectedCoreExitProcess = stoppingProcess;
  }
  try {
    await manager.proxyService.stop();
  } finally {
    if (manager._expectedCoreExitProcess === stoppingProcess) {
      manager._expectedCoreExitProcess = null;
    }
  }
  const settings = manager.getSettingsSnapshot();
  let systemProxy = null;
  if (settings.systemProxyCaptureEnabled) {
    systemProxy = await manager.systemProxyManager.disable().catch((error) => manager.buildSystemProxyState({
      ...manager.state.systemProxy,
      lastError: error.message,
      mode: 'error'
    }));
  } else {
    systemProxy = await manager.systemProxyManager.getStatus().catch(() => manager.buildSystemProxyState());
    if (manager.isManagedSystemProxyStatus(systemProxy, settings)) {
      systemProxy = await manager.systemProxyManager.disable().catch((error) => manager.buildSystemProxyState({
        ...manager.state.systemProxy,
        lastError: error.message,
        mode: 'error'
      }));
    }
  }
  if (settings.tunCaptureEnabled) {
    await manager.updateSettings({ tunCaptureEnabled: false }, { backup: false }).catch(() => null);
  }
  manager.state = {
    ...manager.state,
    status: 'stopped',
    startedAt: null,
    lastError: null,
    executablePath: null,
    coreRuntime: {
      ...(manager.state.coreRuntime || {}),
      status: 'stopped'
    },
    binary: manager.buildBinaryState({
      status: manager.state.binary?.status === 'error' ? 'error' : manager.buildBinaryState().status,
      lastError: manager.state.binary?.status === 'error' ? manager.state.binary.lastError : null,
      version: manager.state.binary?.version || null,
      resolvedPath: manager.state.binary?.resolvedPath || manager.buildBinaryState().resolvedPath,
      source: manager.state.binary?.source || manager.buildBinaryState().source
    }),
    systemProxy: manager.buildSystemProxyState(systemProxy)
  };
  return manager.getStatus();
};

export const restart = async (manager, options = {}) => {
  await stop(manager);
  return start(manager, options);
};
