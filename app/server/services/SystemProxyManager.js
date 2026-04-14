import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
const WINDOWS_PROXY_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const WINDOWS_INTERNET_OPTION_REFRESH = 37;
const WINDOWS_INTERNET_OPTION_SETTINGS_CHANGED = 39;
const WINDOWS_PROXY_REFRESH_SCRIPT = `
$signature = @"
using System;
using System.Runtime.InteropServices;
public static class WinInetProxyRefresh {
  [DllImport("wininet.dll", SetLastError=true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@;
Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue | Out-Null;
[void][WinInetProxyRefresh]::InternetSetOption([IntPtr]::Zero, ${WINDOWS_INTERNET_OPTION_SETTINGS_CHANGED}, [IntPtr]::Zero, 0);
[void][WinInetProxyRefresh]::InternetSetOption([IntPtr]::Zero, ${WINDOWS_INTERNET_OPTION_REFRESH}, [IntPtr]::Zero, 0);
`.trim();
const WINDOWS_PROXY_OVERRIDE = [
  'localhost',
  '127.*',
  '::1',
  '[::1]',
  '<local>',
  '*.local',
  '*.lan',
  '*.home.arpa',
  '10.*',
  '172.16.*',
  '172.17.*',
  '172.18.*',
  '172.19.*',
  '172.20.*',
  '172.21.*',
  '172.22.*',
  '172.23.*',
  '172.24.*',
  '172.25.*',
  '172.26.*',
  '172.27.*',
  '172.28.*',
  '172.29.*',
  '172.30.*',
  '172.31.*',
  '192.168.*',
  '169.254.*',
  'fc*',
  'fd*',
  'fe80:*'
].join(';');
const LINUX_PROXY_IGNORE_HOSTS = [
  'localhost',
  '127.0.0.0/8',
  '::1',
  '*.local',
  '*.lan',
  '*.home.arpa',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  'fc00::/7',
  'fe80::/10'
];

const trimValue = (value) => String(value || '').trim();
const formatGsettingsStringArray = (values) => `[${values.map((value) => `'${String(value).replace(/'/g, "\\'")}'`).join(', ')}]`;
const clearProxyEndpointsIfDisabled = (status) => status.enabled
  ? status
  : {
      ...status,
      http: null,
      socks: null
    };
const normalizeWindowsSystemProxyHost = (value) => {
  const normalized = trimValue(value).replace(/^\[(.*)\]$/, '$1');
  if (!normalized || normalized === '0.0.0.0' || normalized === '::') {
    return '127.0.0.1';
  }
  return normalized;
};
const formatWindowsProxyServer = (host, port) => {
  const normalizedHost = normalizeWindowsSystemProxyHost(host);
  const displayHost = normalizedHost.includes(':') ? `[${normalizedHost}]` : normalizedHost;
  return `${displayHost}:${port}`;
};

export class SystemProxyManager {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFileAsync;
  }

  getCapabilities() {
    if (this.platform === 'win32') {
      return {
        supported: true,
        provider: 'windows-registry'
      };
    }

    if (this.platform === 'linux') {
      return {
        supported: true,
        provider: 'gsettings'
      };
    }

    return {
      supported: false,
      provider: 'unsupported'
    };
  }

  async getStatus() {
    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      return {
        enabled: false,
        mode: 'unsupported',
        provider: capabilities.provider,
        http: null,
        socks: null,
        lastError: null,
        supported: false
      };
    }

    if (this.platform === 'win32') {
      return this.getWindowsStatus();
    }

    if (this.platform === 'linux') {
      return this.getLinuxStatus();
    }

    return {
      enabled: false,
      mode: 'unsupported',
      provider: capabilities.provider,
      http: null,
      socks: null,
      lastError: null,
      supported: false
    };
  }

  async apply({ host, httpPort, socksPort }) {
    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      throw new Error(`System proxy is not supported on ${this.platform}`);
    }

    if (this.platform === 'win32') {
      await this.setWindowsProxy({ host, httpPort, socksPort });
      return this.getWindowsStatus();
    }

    if (this.platform === 'linux') {
      await this.setLinuxProxy({ host, httpPort, socksPort });
      return this.getLinuxStatus();
    }

    throw new Error(`System proxy is not supported on ${this.platform}`);
  }

  async disable() {
    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      return this.getStatus();
    }

    if (this.platform === 'win32') {
      await this.disableWindowsProxy();
      return this.getWindowsStatus();
    }

    if (this.platform === 'linux') {
      await this.disableLinuxProxy();
      return this.getLinuxStatus();
    }

    return this.getStatus();
  }

  async exec(command, args) {
    return this.execFile(command, args, { windowsHide: true });
  }

  parseWindowsProxyServer(value) {
    const segments = trimValue(value).split(';').filter(Boolean);
    const parsed = {
      http: null,
      socks: null
    };

    for (const segment of segments) {
      const [scheme, target] = segment.includes('=') ? segment.split('=') : ['http', segment];
      const [host, port] = String(target || '').split(':');
      const normalized = {
        host: trimValue(host),
        port: Number.parseInt(port, 10)
      };

      if (scheme === 'socks') {
        parsed.socks = normalized;
      } else if (scheme === 'http' || scheme === 'https') {
        parsed.http = normalized;
      }
    }

    return parsed;
  }

  async getWindowsRegistryValue(name) {
    const { stdout } = await this.exec('reg', ['query', WINDOWS_PROXY_REG_PATH, '/v', name]);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const target = lines.find((line) => line.startsWith(name));
    if (!target) {
      return null;
    }

    const parts = target.split(/\s{2,}/).filter(Boolean);
    return parts[2] || null;
  }

  async getWindowsStatus() {
    const [enabledValue, proxyServer] = await Promise.all([
      this.getWindowsRegistryValue('ProxyEnable').catch(() => '0x0'),
      this.getWindowsRegistryValue('ProxyServer').catch(() => '')
    ]);

    const enabled = trimValue(enabledValue).toLowerCase() === '0x1';
    const parsed = this.parseWindowsProxyServer(proxyServer);

    return clearProxyEndpointsIfDisabled({
      enabled,
      mode: enabled ? 'manual' : 'off',
      provider: 'windows-registry',
      http: parsed.http,
      socks: parsed.socks,
      lastError: null,
      supported: true
    });
  }

  async setWindowsProxy({ host, httpPort }) {
    const proxyServer = formatWindowsProxyServer(host, httpPort);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', proxyServer, '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', WINDOWS_PROXY_OVERRIDE, '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'AutoConfigURL', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.notifyWindowsProxyChanged();
  }

  async disableWindowsProxy() {
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'AutoConfigURL', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.notifyWindowsProxyChanged();
  }

  async notifyWindowsProxyChanged() {
    await this.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_PROXY_REFRESH_SCRIPT]);
  }

  async gsettingsGet(schema, key) {
    const { stdout } = await this.exec('gsettings', ['get', schema, key]);
    return trimValue(stdout).replace(/^'+|'+$/g, '');
  }

  async gsettingsSet(schema, key, value) {
    await this.exec('gsettings', ['set', schema, key, value]);
  }

  async getLinuxStatus() {
    const mode = await this.gsettingsGet('org.gnome.system.proxy', 'mode').catch(() => 'unsupported');
    if (mode === 'unsupported') {
      return {
        enabled: false,
        mode: 'unsupported',
        provider: 'gsettings',
        http: null,
        socks: null,
        lastError: 'gsettings unavailable',
        supported: false
      };
    }

    const [httpHost, httpPort, socksHost, socksPort] = await Promise.all([
      this.gsettingsGet('org.gnome.system.proxy.http', 'host').catch(() => ''),
      this.gsettingsGet('org.gnome.system.proxy.http', 'port').catch(() => '0'),
      this.gsettingsGet('org.gnome.system.proxy.socks', 'host').catch(() => ''),
      this.gsettingsGet('org.gnome.system.proxy.socks', 'port').catch(() => '0')
    ]);

    return clearProxyEndpointsIfDisabled({
      enabled: mode === 'manual',
      mode,
      provider: 'gsettings',
      http: trimValue(httpHost) ? { host: trimValue(httpHost), port: Number.parseInt(httpPort, 10) } : null,
      socks: trimValue(socksHost) ? { host: trimValue(socksHost), port: Number.parseInt(socksPort, 10) } : null,
      lastError: null,
      supported: true
    });
  }

  async setLinuxProxy({ host, httpPort, socksPort }) {
    await this.gsettingsSet('org.gnome.system.proxy.http', 'host', host);
    await this.gsettingsSet('org.gnome.system.proxy.http', 'port', String(httpPort));
    await this.gsettingsSet('org.gnome.system.proxy.https', 'host', host);
    await this.gsettingsSet('org.gnome.system.proxy.https', 'port', String(httpPort));
    await this.gsettingsSet('org.gnome.system.proxy.socks', 'host', host);
    await this.gsettingsSet('org.gnome.system.proxy.socks', 'port', String(socksPort));
    await this.gsettingsSet('org.gnome.system.proxy', 'ignore-hosts', formatGsettingsStringArray(LINUX_PROXY_IGNORE_HOSTS));
    await this.gsettingsSet('org.gnome.system.proxy', 'mode', 'manual');
  }

  async disableLinuxProxy() {
    await this.gsettingsSet('org.gnome.system.proxy', 'mode', 'none');
  }
}
