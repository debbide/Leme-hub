import {
  CORE_RUNTIME_MODES,
  DEFAULT_CORE_RUNTIME_MODE
} from '../../shared/constants.js';
import { EmbeddedCoreRuntime } from './EmbeddedCoreRuntime.js';

export class CoreRuntimeFactory {
  constructor(options = {}) {
    this.nativeManager = options.nativeManager || null;
    this.createEmbeddedRuntime = options.createEmbeddedRuntime
      || ((runtimeOptions) => new EmbeddedCoreRuntime(runtimeOptions));
  }

  normalizeMode(mode) {
    const normalized = String(mode || DEFAULT_CORE_RUNTIME_MODE).trim().toLowerCase();
    if (!CORE_RUNTIME_MODES.includes(normalized)) {
      throw new Error(`Unsupported core runtime mode: ${mode}`);
    }
    return normalized;
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
    this.normalizeMode(options.mode);
    return this.createEmbedded(options);
  }
}