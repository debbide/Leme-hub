import fs from 'fs';

import koffi from 'koffi';

import { DEFAULT_NATIVE_ABI_VERSION } from '../../shared/constants.js';

const CORE_STATUS = {
  0: 'stopped',
  1: 'running'
};

export class EmbeddedCoreRuntime {
  constructor(options = {}) {
    this.libraryPath = options.libraryPath;
    this.expectedAbiVersion = options.expectedAbiVersion || DEFAULT_NATIVE_ABI_VERSION;
    this.ffi = options.ffi || koffi;
    this.library = options.library || null;
    this.functions = options.functions || null;
    this.versionInfo = null;
    this.lastError = null;
  }

  initialize() {
    if (this.functions) {
      return this.validateLoadedRuntime();
    }
    if (!this.libraryPath) {
      throw new Error('EmbeddedCoreRuntime requires a native library path');
    }
    if (!fs.existsSync(this.libraryPath)) {
      throw new Error(`Native sing-box library does not exist: ${this.libraryPath}`);
    }

    this.library = this.library || this.ffi.load(this.libraryPath);
    this.functions = {
      abiVersion: this.library.func('int leme_core_abi_version()'),
      singBoxVersion: this.library.func('void *leme_core_singbox_version()'),
      goVersion: this.library.func('void *leme_core_go_version()'),
      checkConfig: this.library.func('int leme_core_check_config(const char *config)'),
      start: this.library.func('int leme_core_start(const char *config)'),
      stop: this.library.func('int leme_core_stop()'),
      reload: this.library.func('int leme_core_reload(const char *config)'),
      status: this.library.func('int leme_core_status()'),
      lastError: this.library.func('void *leme_core_last_error()'),
      freeString: this.library.func('void leme_core_free_string(void *value)')
    };
    return this.validateLoadedRuntime();
  }

  validateLoadedRuntime() {
    const abiVersion = this.functions.abiVersion();
    if (abiVersion !== this.expectedAbiVersion) {
      throw new Error(`Native sing-box ABI mismatch: expected ${this.expectedAbiVersion}, received ${abiVersion}`);
    }
    this.versionInfo = {
      abiVersion,
      goVersion: this.readOwnedString(this.functions.goVersion),
      singBoxVersion: this.readOwnedString(this.functions.singBoxVersion)
    };
    return this.getVersionInfo();
  }

  readOwnedString(getPointer) {
    const pointer = getPointer();
    if (!pointer) {
      return '';
    }
    try {
      return this.ffi.decode(pointer, 'const char *') || '';
    } finally {
      this.functions.freeString(pointer);
    }
  }

  ensureInitialized() {
    if (!this.functions) {
      this.initialize();
    }
  }

  readLastError() {
    return this.readOwnedString(this.functions.lastError) || 'Unknown native sing-box error';
  }

  callChecked(operation, ...args) {
    this.ensureInitialized();
    const result = this.functions[operation](...args);
    if (result !== 0) {
      this.lastError = this.readLastError();
      throw new Error(this.lastError);
    }
    this.lastError = null;
  }

  checkConfig(config) {
    const content = typeof config === 'string' ? config : JSON.stringify(config);
    this.callChecked('checkConfig', content);
    return { valid: true };
  }

  start(config) {
    const content = typeof config === 'string' ? config : JSON.stringify(config);
    this.callChecked('start', content);
    return this.getStatus();
  }

  reload(config) {
    const content = typeof config === 'string' ? config : JSON.stringify(config);
    this.callChecked('reload', content);
    return this.getStatus();
  }

  stop() {
    this.callChecked('stop');
    return this.getStatus();
  }

  getStatus() {
    this.ensureInitialized();
    const code = this.functions.status();
    return {
      lastError: this.lastError,
      libraryPath: this.libraryPath || null,
      mode: 'embedded',
      status: CORE_STATUS[code] || 'error',
      statusCode: code,
      ...this.getVersionInfo()
    };
  }

  getVersionInfo() {
    return this.versionInfo ? { ...this.versionInfo } : null;
  }
}