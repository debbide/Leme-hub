import fs from 'fs';
import os from 'os';
import path from 'path';
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
const LINUX_PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy'
];
const LINUX_PROXY_ENV_FILE_NAME = '90-leme-hub-proxy.conf';

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
const normalizeLinuxSystemProxyHost = (value) => {
  const normalized = trimValue(value).replace(/^\[(.*)\]$/, '$1');
  if (!normalized || normalized === '0.0.0.0') {
    return '127.0.0.1';
  }
  if (normalized === '::') {
    return '::1';
  }
  return normalized;
};
const formatHostForUrl = (value) => {
  const normalized = trimValue(value).replace(/^\[(.*)\]$/, '$1');
  return normalized.includes(':') ? `[${normalized}]` : normalized;
};
const formatProxyUrl = (protocol, host, port) => `${protocol}://${formatHostForUrl(host)}:${port}`;
const parseHostPort = (value) => {
  const trimmed = trimValue(value);
  if (!trimmed) return null;

  const bracketMatch = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketMatch) {
    return {
      host: trimValue(bracketMatch[1]),
      port: Number.parseInt(bracketMatch[2], 10)
    };
  }

  const separator = trimmed.lastIndexOf(':');
  if (separator <= 0 || separator === trimmed.length - 1) {
    return null;
  }

  return {
    host: trimValue(trimmed.slice(0, separator)),
    port: Number.parseInt(trimmed.slice(separator + 1), 10)
  };
};
const parseProxyUrl = (value) => {
  const trimmed = trimValue(value);
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return {
      host: trimValue(parsed.hostname),
      port: Number.parseInt(parsed.port, 10)
    };
  } catch {
    return null;
  }
};
const parseSimpleEnv = (raw) => raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .reduce((result, line) => {
    const separator = line.indexOf('=');
    if (separator <= 0) return result;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) {
      result[key] = value;
    }
    return result;
  }, {});
const buildLinuxEnvironmentFile = (entries) => [
  '# Managed by Leme Hub',
  ...Object.entries(entries).map(([key, value]) => `${key}=${value}`)
].join('\n') + '\n';

export class SystemProxyManager {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFileAsync;
    this.fs = options.fs || fs;
    this.path = options.pathModule || path;
    this.env = options.env || process.env;
    this.homedir = options.homedir || os.homedir;
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
        provider: 'gsettings+environment'
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
      const normalized = parseHostPort(target);
      if (!normalized) continue;

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

  getLinuxEnvironmentDir() {
    const xdgConfigHome = trimValue(this.env.XDG_CONFIG_HOME);
    const homeDir = trimValue(this.homedir());
    if (xdgConfigHome) {
      return this.path.join(xdgConfigHome, 'environment.d');
    }
    if (!homeDir) {
      return null;
    }
    return this.path.join(homeDir, '.config', 'environment.d');
  }

  getLinuxEnvironmentFilePath() {
    const dir = this.getLinuxEnvironmentDir();
    return dir ? this.path.join(dir, LINUX_PROXY_ENV_FILE_NAME) : null;
  }

  buildLinuxProxyEnvironment({ host, httpPort, socksPort }) {
    const normalizedHost = normalizeLinuxSystemProxyHost(host);
    const httpProxyUrl = formatProxyUrl('http', normalizedHost, httpPort);
    const allProxyUrl = formatProxyUrl('socks5h', normalizedHost, socksPort);
    const noProxy = LINUX_PROXY_IGNORE_HOSTS.join(',');

    return {
      HTTP_PROXY: httpProxyUrl,
      HTTPS_PROXY: httpProxyUrl,
      ALL_PROXY: allProxyUrl,
      NO_PROXY: noProxy,
      http_proxy: httpProxyUrl,
      https_proxy: httpProxyUrl,
      all_proxy: allProxyUrl,
      no_proxy: noProxy
    };
  }

  readLinuxEnvironmentEntries() {
    const filePath = this.getLinuxEnvironmentFilePath();
    if (filePath && this.fs.existsSync(filePath)) {
      try {
        return parseSimpleEnv(this.fs.readFileSync(filePath, 'utf8'));
      } catch {
        return {};
      }
    }

    return LINUX_PROXY_ENV_KEYS.reduce((result, key) => {
      if (trimValue(this.env[key])) {
        result[key] = trimValue(this.env[key]);
      }
      return result;
    }, {});
  }

  getLinuxEnvironmentStatus() {
    const entries = this.readLinuxEnvironmentEntries();
    const http = parseProxyUrl(entries.HTTP_PROXY || entries.http_proxy || '');
    const socks = parseProxyUrl(entries.ALL_PROXY || entries.all_proxy || '');
    const filePath = this.getLinuxEnvironmentFilePath();

    return {
      enabled: Boolean(http || socks),
      managed: Boolean(filePath && this.fs.existsSync(filePath)),
      filePath,
      http,
      socks,
      noProxy: trimValue(entries.NO_PROXY || entries.no_proxy)
    };
  }

  applyLinuxProcessEnvironment(entries) {
    for (const key of LINUX_PROXY_ENV_KEYS) {
      if (Object.prototype.hasOwnProperty.call(entries, key)) {
        this.env[key] = entries[key];
      }
    }
  }

  clearLinuxProcessEnvironment() {
    for (const key of LINUX_PROXY_ENV_KEYS) {
      delete this.env[key];
    }
  }

  writeLinuxEnvironmentFile(entries) {
    const filePath = this.getLinuxEnvironmentFilePath();
    if (!filePath) {
      throw new Error('Unable to resolve Linux environment.d path');
    }

    this.fs.mkdirSync(this.path.dirname(filePath), { recursive: true });
    this.fs.writeFileSync(filePath, buildLinuxEnvironmentFile(entries), 'utf8');
  }

  removeLinuxEnvironmentFile() {
    const filePath = this.getLinuxEnvironmentFilePath();
    if (filePath && this.fs.existsSync(filePath)) {
      this.fs.rmSync(filePath, { force: true });
    }
  }

  async syncLinuxSessionEnvironment(entries = null) {
    const keyArgs = LINUX_PROXY_ENV_KEYS;
    const valueArgs = entries
      ? keyArgs.map((key) => `${key}=${entries[key] || ''}`)
      : keyArgs.map((key) => `${key}=`);

    const commands = entries
      ? [
          ['systemctl', ['--user', 'import-environment', ...keyArgs]],
          ['dbus-update-activation-environment', ['--systemd', ...valueArgs]]
        ]
      : [
          ['systemctl', ['--user', 'unset-environment', ...keyArgs]],
          ['dbus-update-activation-environment', ['--systemd', ...valueArgs]]
        ];

    for (const [command, args] of commands) {
      try {
        await this.exec(command, args);
      } catch {
        // Ignore missing desktop session helpers and keep the file/env sync result.
      }
    }
  }

  async getLinuxStatus() {
    const environment = this.getLinuxEnvironmentStatus();
    const mode = await this.gsettingsGet('org.gnome.system.proxy', 'mode').catch(() => null);

    let gsettingsHttp = null;
    let gsettingsSocks = null;
    if (mode) {
      const [httpHost, httpPort, socksHost, socksPort] = await Promise.all([
        this.gsettingsGet('org.gnome.system.proxy.http', 'host').catch(() => ''),
        this.gsettingsGet('org.gnome.system.proxy.http', 'port').catch(() => '0'),
        this.gsettingsGet('org.gnome.system.proxy.socks', 'host').catch(() => ''),
        this.gsettingsGet('org.gnome.system.proxy.socks', 'port').catch(() => '0')
      ]);

      gsettingsHttp = trimValue(httpHost) ? { host: trimValue(httpHost), port: Number.parseInt(httpPort, 10) } : null;
      gsettingsSocks = trimValue(socksHost) ? { host: trimValue(socksHost), port: Number.parseInt(socksPort, 10) } : null;
    }

    const gsettingsEnabled = mode === 'manual';
    const enabled = gsettingsEnabled || environment.enabled;
    const provider = mode ? 'gsettings+environment' : 'environment';
    const resolvedMode = enabled
      ? (gsettingsEnabled ? (environment.enabled ? 'manual+environment' : 'manual') : 'environment')
      : 'off';

    return clearProxyEndpointsIfDisabled({
      enabled,
      mode: resolvedMode,
      provider,
      http: gsettingsHttp || environment.http,
      socks: gsettingsSocks || environment.socks,
      lastError: null,
      supported: true,
      environment
    });
  }

  async setLinuxProxy({ host, httpPort, socksPort }) {
    const normalizedHost = normalizeLinuxSystemProxyHost(host);
    const entries = this.buildLinuxProxyEnvironment({ host: normalizedHost, httpPort, socksPort });

    this.applyLinuxProcessEnvironment(entries);
    this.writeLinuxEnvironmentFile(entries);
    await this.syncLinuxSessionEnvironment(entries);

    try {
      await this.gsettingsSet('org.gnome.system.proxy.http', 'host', normalizedHost);
      await this.gsettingsSet('org.gnome.system.proxy.http', 'port', String(httpPort));
      await this.gsettingsSet('org.gnome.system.proxy.https', 'host', normalizedHost);
      await this.gsettingsSet('org.gnome.system.proxy.https', 'port', String(httpPort));
      await this.gsettingsSet('org.gnome.system.proxy.socks', 'host', normalizedHost);
      await this.gsettingsSet('org.gnome.system.proxy.socks', 'port', String(socksPort));
      await this.gsettingsSet('org.gnome.system.proxy', 'ignore-hosts', formatGsettingsStringArray(LINUX_PROXY_IGNORE_HOSTS));
      await this.gsettingsSet('org.gnome.system.proxy', 'mode', 'manual');
    } catch {
      // Environment sync remains the fallback when gsettings is unavailable.
    }
  }

  async disableLinuxProxy() {
    this.clearLinuxProcessEnvironment();
    this.removeLinuxEnvironmentFile();
    await this.syncLinuxSessionEnvironment(null);

    try {
      await this.gsettingsSet('org.gnome.system.proxy', 'mode', 'none');
    } catch {
      // Environment sync already cleared local/session proxy variables.
    }
  }
}
