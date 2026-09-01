import {
  CORE_RUNTIME_MODES,
  DEFAULT_CORE_RUNTIME_MODE
} from '../../shared/constants.js';
import { EmbeddedCoreRuntime } from './EmbeddedCoreRuntime.js';
import { ProcessCoreRuntime } from './ProcessCoreRuntime.js';

export class CoreRuntimeFactory {
  constructor(options = {}) {
    this.nativeManager = options.nativeManager || null;
    this.log = options.log || console;
    this.createEmbeddedRuntime = options.createEmbeddedRuntime
      || ((runtimeOptions) => new EmbeddedCoreRuntime(runtimeOptions));
    this.createProcessRuntime = options.createProcessRuntime
      || ((context, runtimeOptions) => new ProcessCoreRuntime(context, runtimeOptions));
  }

  normalizeMode(mode) {
    const normalized = String(mode || DEFAULT_CORE_RUNTIME_MODE).trim().toLowerCase();
    if (!CORE_RUNTIME_MODES.includes(normalized)) {
      throw new Error(`Unsupported core runtime mode: ${mode}`);
    }
    return normalized;
  }

  createProcess(context, options = {}) {
    const runtime = this.createProcessRuntime(context, options.process || {});
    runtime.initialize();
    return {
      mode: 'process',
      runtime,
      source: 'managed-process'
    };
  }

  async createEmbedded(options = {}) {
    if (!this.nativeManager) {
      throw new Error('Embedded core runtime requires a SingBoxNativeManager');
    }

    const native = await this.nativeManager.ensureAvailable();
    const runtime = this.createEmbeddedRuntime({
      expectedAbiVersion: native.abiVersion,
      libraryPath: native.libraryPath,
      ...(options.embedded || {})
    });
    const versionInfo = runtime.initialize();

    return {
      ...native,
      ...versionInfo,
      mode: 'embedded',
      runtime,
      source: native.source || 'managed-native'
    };
  }

  async resolve(context, options = {}) {
    const mode = this.normalizeMode(options.mode);
    if (mode === 'process') {
      return this.createProcess(context, options);
    }
    if (mode === 'embedded') {
      return this.createEmbedded(options);
    }

    try {
      return await this.createEmbedded(options);
    } catch (error) {
      this.log.warn?.(`[CoreRuntime] Native runtime unavailable: ${error.message}`);
      this.log.warn?.('[CoreRuntime] Falling back to sing-box process runtime');
      return {
        ...this.createProcess(context, options),
        fallbackError: error.message,
        fallbackFrom: 'embedded'
      };
    }
  }
}