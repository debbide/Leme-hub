import test from 'node:test';
import assert from 'node:assert/strict';

import { SystemProxyManager } from '../app/server/services/SystemProxyManager.js';

test('windows disabled status clears parsed proxy endpoints', async () => {
  const manager = new SystemProxyManager({
    platform: 'win32',
    execFile: async (_command, args) => {
      const name = args[args.length - 1];
      if (name === 'ProxyEnable') {
        return { stdout: 'ProxyEnable    REG_DWORD    0x0' };
      }

      return { stdout: 'ProxyServer    REG_SZ    http=127.0.0.1:20101;socks=127.0.0.1:20100' };
    }
  });

  const status = await manager.getStatus();

  assert.equal(status.enabled, false);
  assert.equal(status.http, null);
  assert.equal(status.socks, null);
});

test('linux disabled status clears proxy endpoints', async () => {
  const manager = new SystemProxyManager({
    platform: 'linux',
    execFile: async (_command, args) => {
      const key = args[2] + ':' + args[3];
      const values = {
        'org.gnome.system.proxy:mode': "'none'",
        'org.gnome.system.proxy.http:host': "'127.0.0.1'",
        'org.gnome.system.proxy.http:port': '20101',
        'org.gnome.system.proxy.socks:host': "'127.0.0.1'",
        'org.gnome.system.proxy.socks:port': '20100'
      };
      return { stdout: values[key] || '' };
    }
  });

  const status = await manager.getStatus();

  assert.equal(status.enabled, false);
  assert.equal(status.http, null);
  assert.equal(status.socks, null);
});
