import {
  restartProxyRuntime,
  startProxyRuntime,
  stopProxyRuntime,
  validateConfig
} from '../runtime.js';

/**
 * Compatibility runtime that preserves the existing sing-box child-process
 * implementation while exposing the same high-level interface as the
 * embedded runtime.
 */
export class ProcessCoreRuntime {
  constructor(context, options = {}) {
    if (!context) {
      throw new Error('ProcessCoreRuntime requires a ProxyService context');
    }

    this.context = context;
    this.defaultOptions = { ...options };
    this.lastError = null;
  }

  initialize() {
    return this.getStatus();
  }

  async checkConfig(config, options = {}) {
    try {
      const result = await validateConfig(this.context, config, {
        ...this.defaultOptions,
        ...options
      });
      this.lastError = null;
      return result;
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  async start(options = {}) {
    try {
      const result = await startProxyRuntime(this.context, {
        ...this.defaultOptions,
        ...options
      });
      this.lastError = null;
      return {
        ...result,
        mode: 'process'
      };
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  async reload(nodes, options = {}) {
    try {
      const result = await restartProxyRuntime(this.context, nodes, {
        ...this.defaultOptions,
        ...options
      });
      this.lastError = null;
      return {
        ...result,
        mode: 'process'
      };
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  async restart(nodes, options = {}) {
    return this.reload(nodes, options);
  }

  async stop() {
    try {
      await stopProxyRuntime(this.context);
      this.lastError = null;
      return this.getStatus();
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  getStatus() {
    const processRef = this.context.proxyProcess;
    const exited = processRef
      ? processRef.exitCode !== null || processRef.signalCode !== null
      : true;

    return {
      executablePath: this.context.executablePath || null,
      lastError: this.lastError?.message || null,
      mode: 'process',
      process: processRef || null,
      status: processRef && !exited ? 'running' : 'stopped'
    };
  }

  getVersionInfo() {
    return {
      executablePath: this.context.executablePath || null,
      mode: 'process'
    };
  }
}