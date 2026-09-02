import test from 'node:test';
import assert from 'node:assert/strict';

import { CoreRuntimeFactory } from '../app/proxy/runtime/CoreRuntimeFactory.js';

const context = { proxyProcess: null };

test('creates and initializes the embedded runtime', async () => {
  const embeddedRuntime = {
    initialize: () => ({ abiVersion: 2, singBoxVersion: '1.14.0' })
  };
  const factory = new CoreRuntimeFactory({
    nativeManager: {
      ensureAvailable: async () => ({
        abiVersion: 2,
        libraryPath: '/native/libleme-singbox.so',
        source: 'managed-native'
      })
    },
    createEmbeddedRuntime: () => embeddedRuntime
  });

  const result = await factory.resolve(context, { mode: 'embedded' });
  assert.equal(result.mode, 'embedded');
  assert.equal(result.runtime, embeddedRuntime);
  assert.equal(result.singBoxVersion, '1.14.0');
});

test('does not fall back when embedded mode is explicitly selected', async () => {
  const factory = new CoreRuntimeFactory({
    nativeManager: {
      ensureAvailable: async () => {
        throw new Error('ABI mismatch');
      }
    }
  });

  await assert.rejects(
    () => factory.resolve(context, { mode: 'embedded' }),
    /ABI mismatch/
  );
});

test('rejects unsupported runtime modes', async () => {
  const factory = new CoreRuntimeFactory();
  await assert.rejects(
    () => factory.resolve(context, { mode: 'unknown' }),
    /Unsupported core runtime mode/
  );
});