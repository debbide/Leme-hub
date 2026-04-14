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

test('windows apply writes http and socks proxy server', async () => {
  const calls = [];
  const manager = new SystemProxyManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.setWindowsProxy({ host: '127.0.0.1', httpPort: 20101, socksPort: 20100 });

  assert.equal(calls[1][8], 'http=127.0.0.1:20101;https=127.0.0.1:20101;socks=127.0.0.1:20100');
  assert.equal(calls[2][4], 'ProxyOverride');
  assert.match(calls[2][8], /localhost/);
  assert.match(calls[2][8], /\*\.local/);
  assert.match(calls[2][8], /192\.168\.\*/);
});

test('linux apply sets http and socks endpoints together', async () => {
  const calls = [];
  const manager = new SystemProxyManager({
    platform: 'linux',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.setLinuxProxy({ host: '127.0.0.1', httpPort: 20101, socksPort: 20100 });

  assert.deepEqual(calls, [
    ['gsettings', 'set', 'org.gnome.system.proxy.http', 'host', '127.0.0.1'],
    ['gsettings', 'set', 'org.gnome.system.proxy.http', 'port', '20101'],
    ['gsettings', 'set', 'org.gnome.system.proxy.https', 'host', '127.0.0.1'],
    ['gsettings', 'set', 'org.gnome.system.proxy.https', 'port', '20101'],
    ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', '127.0.0.1'],
    ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '20100'],
    ['gsettings', 'set', 'org.gnome.system.proxy', 'ignore-hosts', "['localhost', '127.0.0.0/8', '::1', '*.local', '*.lan', '*.home.arpa', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', 'fc00::/7', 'fe80::/10']"],
    ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'manual']
  ]);
});
