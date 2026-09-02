import test from 'node:test';
import assert from 'node:assert/strict';

import { EmbeddedCoreRuntime } from '../app/proxy/runtime/EmbeddedCoreRuntime.js';

const createRuntime = (overrides = {}) => {
  const freed = [];
  let status = 0;
  let lastError = '';
  const values = new Map([
    ['singbox-pointer', '1.14.0'],
    ['go-pointer', 'go1.25.5 windows/amd64'],
    ['error-pointer', () => lastError]
  ]);
  const functions = {
    abiVersion: () => 2,
    singBoxVersion: () => 'singbox-pointer',
    goVersion: () => 'go-pointer',
    checkConfig: () => 0,
    start: () => { status = 1; return 0; },
    reload: () => { status = 1; return 0; },
    stop: () => { status = 0; return 0; },
    status: () => status,
    lastError: () => 'error-pointer',
    freeString: (pointer) => freed.push(pointer),
    ...overrides.functions
  };
  const decodes = [];
  const ffi = {
    decode: (pointer, type, length) => {
      decodes.push({ pointer, type, length });
      const value = values.get(pointer);
      return typeof value === 'function' ? value() : value;
    }
  };
  const { functions: _ignoredFunctions, ...runtimeOverrides } = overrides;
  const runtime = new EmbeddedCoreRuntime({
    ...runtimeOverrides,
    ffi,
    functions
  });
  return {
    decodes,
    freed,
    runtime,
    setLastError: (value) => { lastError = value; }
  };
};

test('initializes an embedded runtime and releases native strings', () => {
  const { decodes, freed, runtime } = createRuntime();
  const version = runtime.initialize();

  assert.equal(version.abiVersion, 2);
  assert.equal(version.singBoxVersion, '1.14.0');
  assert.equal(version.goVersion, 'go1.25.5 windows/amd64');
  assert.deepEqual(decodes, [
    { pointer: 'go-pointer', type: 'char', length: -1 },
    { pointer: 'singbox-pointer', type: 'char', length: -1 }
  ]);
  assert.deepEqual(freed, ['go-pointer', 'singbox-pointer']);
});

test('rejects an incompatible native ABI', () => {
  const { runtime } = createRuntime({
    functions: { abiVersion: () => 3 }
  });

  assert.throws(() => runtime.initialize(), /ABI mismatch/);
});

test('wraps check, start, reload and stop lifecycle calls', () => {
  const { runtime } = createRuntime();
  runtime.initialize();

  assert.equal(runtime.checkConfig({ outbounds: [] }).valid, true);
  assert.equal(runtime.start({ outbounds: [] }).status, 'running');
  assert.equal(runtime.reload({ outbounds: [] }).status, 'running');
  assert.equal(runtime.stop().status, 'stopped');
});

test('converts native failures to JavaScript errors and frees error strings', () => {
  const setup = createRuntime({
    functions: { checkConfig: () => 1 }
  });
  setup.setLastError('decode config: invalid JSON');
  setup.runtime.initialize();

  assert.throws(() => setup.runtime.checkConfig('{'), /decode config: invalid JSON/);
  assert.equal(setup.freed.includes('error-pointer'), true);
});