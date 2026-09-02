export const start = async (manager, options = {}) => {
  let runtimeResolution = null;

  try {
    if (manager._autoRestartTimer) {
      clearTimeout(manager._autoRestartTimer);
      manager._autoRestartTimer = null;
    }
    const settings = manager.getSettingsSnapshot();
    const nodes = manager.store.getNodes();

    manager.proxyService.setNodes(nodes);

    runtimeResolution = await manager.coreRuntimeFactory.resolve(manager.proxyService, {
      mode: settings.coreRuntimeMode
    });

    if (typeof manager.proxyService.setCoreRuntime === 'function') {
      manager.proxyService.setCoreRuntime(runtimeResolution.runtime);
    }

    const result = await manager.proxyService.start({
      runtime: manager.getRuntimeOptions(settings, nodes),
      skipValidation: !!options.skipValidation,
      waitForAllNodePorts: options.waitForAllNodePorts,
      waitNodeIds: options.waitNodeIds,
      readyTimeoutMs: options.readyTimeoutMs
    });
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
      configPath: result.configPath,
      coreRuntime: {
        mode: runtimeResolution.mode,
        status: 'running',
        source: runtimeResolution.source,
        libraryPath: runtimeResolution.libraryPath || null,
        runtimeVersion: runtimeResolution.runtimeVersion || null,
        singBoxVersion: runtimeResolution.singBoxVersion || null,
        abiVersion: runtimeResolution.abiVersion || null
      },
      binary: manager.buildBinaryState({
        status: 'ready',
        resolvedPath: runtimeResolution.libraryPath || null,
        source: runtimeResolution.source,
        lastError: null,
        version: runtimeResolution.singBoxVersion || manager.state.binary?.version || null,
        runtimeVersion: runtimeResolution.runtimeVersion || null,
        abiVersion: runtimeResolution.abiVersion || null
      }),
      systemProxy: manager.buildSystemProxyState(systemProxy)
    };
    try {
      await manager.syncRunningSelectors(settings, nodes);
    } catch (syncError) {
      manager.store.appendLog(`[CoreManager] Failed to sync running selectors: ${syncError.message}`);
    }
    void manager.runNodeGroupAutoTestTick();
    return manager.getStatus();
  } catch (error) {
    // Embedded validation runs before the core is started or reloaded, so a
    // validation failure never tears down a still-serving core.
    const validationFailed = error?.phase === 'validation';
    const wasRunning = manager.state.status === 'running';
    manager.state = {
      ...manager.state,
      status: validationFailed && wasRunning ? 'running' : 'error',
      lastError: error.message,
      binary: manager.buildBinaryState({
        status: runtimeResolution ? 'ready' : 'error',
        lastError: runtimeResolution ? null : error.message
      }),
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
  await manager.proxyService.stop();
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
    coreRuntime: {
      ...(manager.state.coreRuntime || {}),
      status: 'stopped'
    },
    binary: manager.buildBinaryState({
      status: manager.state.binary?.status === 'error' ? 'error' : 'ready',
      lastError: manager.state.binary?.status === 'error' ? manager.state.binary.lastError : null,
      version: manager.state.binary?.version || null,
      resolvedPath: manager.state.binary?.resolvedPath || null,
      source: manager.state.binary?.source || null
    }),
    systemProxy: manager.buildSystemProxyState(systemProxy)
  };
  return manager.getStatus();
};

export const restart = async (manager, options = {}) => {
  await stop(manager);
  return start(manager, options);
};
