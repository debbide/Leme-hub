import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { SystemProxyManager } from '../app/server/services/SystemProxyManager.js';

const createTempConfigHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lemehub-system-proxy-'));

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

test('windows status parses single proxy endpoint as http proxy', async () => {
  const manager = new SystemProxyManager({
    platform: 'win32',
    execFile: async (_command, args) => {
      const name = args[args.length - 1];
      if (name === 'ProxyEnable') {
        return { stdout: 'ProxyEnable    REG_DWORD    0x1' };
      }

      return { stdout: 'ProxyServer    REG_SZ    127.0.0.1:20101' };
    }
  });

  const status = await manager.getStatus();

  assert.equal(status.enabled, true);
  assert.deepEqual(status.http, { host: '127.0.0.1', port: 20101 });
  assert.equal(status.socks, null);
});

test('linux disabled status clears proxy endpoints', async (t) => {
  const configHome = createTempConfigHome();
  t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

  const manager = new SystemProxyManager({
    platform: 'linux',
    env: { XDG_CONFIG_HOME: configHome },
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

test('windows apply writes manual proxy, clears pac, and refreshes wininet', async () => {
  const calls = [];
  const manager = new SystemProxyManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.setWindowsProxy({ host: '127.0.0.1', httpPort: 20101, socksPort: 20100 });

  assert.equal(calls[1][8], '127.0.0.1:20101');
  assert.equal(calls[2][4], 'ProxyOverride');
  assert.match(calls[2][8], /localhost/);
  assert.match(calls[2][8], /\*\.local/);
  assert.match(calls[2][8], /192\.168\.\*/);
  assert.equal(calls[3][4], 'AutoConfigURL');
  assert.equal(calls[3][8], '');
  assert.equal(calls[4][0], 'powershell.exe');
  assert.equal(calls[4][1], '-NoProfile');
  assert.equal(calls[4][5], '-Command');
  assert.match(calls[4][6], /InternetSetOption/);
});

test('windows apply normalizes wildcard host to loopback', async () => {
  const calls = [];
  const manager = new SystemProxyManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.setWindowsProxy({ host: '0.0.0.0', httpPort: 20101, socksPort: 20100 });

  assert.equal(calls[1][8], '127.0.0.1:20101');
});

test('windows disable clears proxy values and refreshes wininet', async () => {
  const calls = [];
  const manager = new SystemProxyManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.disableWindowsProxy();

  assert.equal(calls[0][4], 'ProxyEnable');
  assert.equal(calls[0][8], '0');
  assert.equal(calls[1][4], 'ProxyServer');
  assert.equal(calls[1][8], '');
  assert.equal(calls[2][4], 'ProxyOverride');
  assert.equal(calls[2][8], '');
  assert.equal(calls[3][4], 'AutoConfigURL');
  assert.equal(calls[3][8], '');
  assert.equal(calls[4][0], 'powershell.exe');
});

test('linux apply sets http and socks endpoints together', async (t) => {
  const calls = [];
  const configHome = createTempConfigHome();
  t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: configHome };
  const manager = new SystemProxyManager({
    platform: 'linux',
    env,
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.setLinuxProxy({ host: '127.0.0.1', httpPort: 20101, socksPort: 20100 });

  const envFilePath = path.join(configHome, 'environment.d', '90-leme-hub-proxy.conf');
  const envFile = fs.readFileSync(envFilePath, 'utf8');

  assert.equal(env.HTTP_PROXY, 'http://127.0.0.1:20101');
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:20101');
  assert.equal(env.ALL_PROXY, 'socks5h://127.0.0.1:20100');
  assert.match(envFile, /HTTP_PROXY=http:\/\/127\.0\.0\.1:20101/);
  assert.match(envFile, /ALL_PROXY=socks5h:\/\/127\.0\.0\.1:20100/);
  assert.deepEqual(calls[0], ['systemctl', '--user', 'import-environment', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']);
  assert.deepEqual(calls[1], ['dbus-update-activation-environment', '--systemd', 'HTTP_PROXY=http://127.0.0.1:20101', 'HTTPS_PROXY=http://127.0.0.1:20101', 'ALL_PROXY=socks5h://127.0.0.1:20100', `NO_PROXY=localhost,127.0.0.0/8,::1,*.local,*.lan,*.home.arpa,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10`, 'http_proxy=http://127.0.0.1:20101', 'https_proxy=http://127.0.0.1:20101', 'all_proxy=socks5h://127.0.0.1:20100', `no_proxy=localhost,127.0.0.0/8,::1,*.local,*.lan,*.home.arpa,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10`]);
  assert.deepEqual(calls.slice(2), [
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

test('linux status falls back to managed environment when gsettings is unavailable', async (t) => {
  const configHome = createTempConfigHome();
  t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

  const env = { XDG_CONFIG_HOME: configHome };
  const manager = new SystemProxyManager({
    platform: 'linux',
    env,
    execFile: async (command) => {
      if (command === 'gsettings') {
        throw new Error('gsettings missing');
      }
      return { stdout: '' };
    }
  });

  await manager.setLinuxProxy({ host: '0.0.0.0', httpPort: 20101, socksPort: 20100 });
  const status = await manager.getStatus();

  assert.equal(status.enabled, true);
  assert.equal(status.mode, 'environment');
  assert.equal(status.provider, 'environment');
  assert.deepEqual(status.http, { host: '127.0.0.1', port: 20101 });
  assert.deepEqual(status.socks, { host: '127.0.0.1', port: 20100 });
  assert.equal(status.environment.managed, true);
});

test('linux disable clears environment sync and disables gsettings when available', async (t) => {
  const configHome = createTempConfigHome();
  t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

  const calls = [];
  const env = { XDG_CONFIG_HOME: configHome };
  const manager = new SystemProxyManager({
    platform: 'linux',
    env,
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: '' };
    }
  });

  await manager.setLinuxProxy({ host: '127.0.0.1', httpPort: 20101, socksPort: 20100 });
  calls.length = 0;

  await manager.disableLinuxProxy();

  const envFilePath = path.join(configHome, 'environment.d', '90-leme-hub-proxy.conf');
  assert.equal(fs.existsSync(envFilePath), false);
  assert.equal(env.HTTP_PROXY, undefined);
  assert.equal(env.ALL_PROXY, undefined);
  assert.deepEqual(calls, [
    ['systemctl', '--user', 'unset-environment', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'],
    ['dbus-update-activation-environment', '--systemd', 'HTTP_PROXY=', 'HTTPS_PROXY=', 'ALL_PROXY=', 'NO_PROXY=', 'http_proxy=', 'https_proxy=', 'all_proxy=', 'no_proxy='],
    ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'none']
  ]);
});
