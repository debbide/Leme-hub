import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveServerRuntime } from '../app/server/runtime.js';

const baseSettings = {
  uiHost: '0.0.0.0',
  uiPort: 51888
};

test('desktop mode inherits persisted ui host and port by default', () => {
  const runtime = resolveServerRuntime(baseSettings, {});

  assert.equal(runtime.mode, 'desktop');
  assert.equal(runtime.host, '0.0.0.0');
  assert.equal(runtime.port, 51888);
});

test('server mode defaults to all interfaces without remote flag', () => {
  const runtime = resolveServerRuntime(baseSettings, { LEME_MODE: 'server' });

  assert.equal(runtime.mode, 'server');
  assert.equal(runtime.host, '0.0.0.0');
  assert.equal(runtime.port, 51888);
});

test('server mode binds all interfaces when remote flag is enabled', () => {
  const runtime = resolveServerRuntime(baseSettings, { LEME_MODE: 'server', LEME_ALLOW_REMOTE: 'true' });

  assert.equal(runtime.host, '0.0.0.0');
  assert.equal(runtime.port, 51888);
});

test('server mode ignores persisted desktop host when not overridden', () => {
  const runtime = resolveServerRuntime({ uiHost: '192.168.1.20', uiPort: 60000 }, { LEME_MODE: 'server' });

  assert.equal(runtime.host, '0.0.0.0');
  assert.equal(runtime.port, 51888);
});

test('server mode still accepts explicit env overrides', () => {
  const runtime = resolveServerRuntime(baseSettings, {
    LEME_MODE: 'server',
    LEME_UI_HOST: '10.0.0.5',
    LEME_UI_PORT: '52100'
  });

  assert.equal(runtime.host, '10.0.0.5');
  assert.equal(runtime.port, 52100);
});
