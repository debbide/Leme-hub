import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
const WINDOWS_PROXY_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const WINDOWS_PROXY_APPLY_SCRIPT = `
$signature = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class WinInetProxyApply {
  const int INTERNET_OPTION_PER_CONNECTION_OPTION = 75;
  const int INTERNET_OPTION_SETTINGS_CHANGED = 39;
  const int INTERNET_OPTION_REFRESH = 37;
  const int INTERNET_PER_CONN_FLAGS = 1;
  const int INTERNET_PER_CONN_PROXY_SERVER = 2;
  const int INTERNET_PER_CONN_PROXY_BYPASS = 3;
  const int INTERNET_PER_CONN_AUTOCONFIG_URL = 4;
  const int PROXY_TYPE_DIRECT = 1;
  const int PROXY_TYPE_PROXY = 2;
  const int PROXY_TYPE_AUTO_PROXY_URL = 4;
  const int ERROR_BUFFER_TOO_SMALL = 603;
  const int RAS_MAX_ENTRY_NAME = 256;
  const int MAX_PATH = 260;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  struct INTERNET_PER_CONN_OPTION_LIST {
    public int dwSize;
    public IntPtr pszConnection;
    public int dwOptionCount;
    public int dwOptionError;
    public IntPtr pOptions;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct INTERNET_PER_CONN_OPTION {
    public int dwOption;
    public INTERNET_PER_CONN_OPTION_VALUE Value;
  }

  [StructLayout(LayoutKind.Explicit)]
  struct INTERNET_PER_CONN_OPTION_VALUE {
    [FieldOffset(0)] public int dwValue;
    [FieldOffset(0)] public IntPtr pszValue;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  struct RASENTRYNAME {
    public int dwSize;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = RAS_MAX_ENTRY_NAME + 1)] public string szEntryName;
    public int dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = MAX_PATH + 1)] public string szPhonebookPath;
  }

  [DllImport("wininet.dll", SetLastError = true, CharSet = CharSet.Auto)]
  [return: MarshalAs(UnmanagedType.Bool)]
  static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

  [DllImport("rasapi32.dll", CharSet = CharSet.Auto)]
  static extern uint RasEnumEntries(string reserved, string phonebook, [In, Out] RASENTRYNAME[] entries, ref int bufferSize, ref int entryCount);

  public static void Apply(string proxyServer, string exceptions, int type) {
    bool applied = SetConnectionProxy(null, proxyServer, exceptions, type);
    foreach (string connection in EnumerateRasEntries()) {
      applied = SetConnectionProxy(connection, proxyServer, exceptions, type) || applied;
    }
    if (!applied) {
      throw new InvalidOperationException("No WinINET connection accepted proxy settings");
    }
  }

  public static void Refresh() {
    InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
    InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
  }

  static bool SetConnectionProxy(string connectionName, string proxyServer, string exceptions, int type) {
    int optionCount = 3;

    int flags = PROXY_TYPE_DIRECT;
    int valueOption = INTERNET_PER_CONN_PROXY_SERVER;
    if (type == PROXY_TYPE_PROXY) {
      flags = PROXY_TYPE_DIRECT | PROXY_TYPE_PROXY;
      valueOption = INTERNET_PER_CONN_PROXY_SERVER;
    } else if (type == PROXY_TYPE_AUTO_PROXY_URL) {
      flags = PROXY_TYPE_DIRECT | PROXY_TYPE_AUTO_PROXY_URL;
      valueOption = INTERNET_PER_CONN_AUTOCONFIG_URL;
    }

    INTERNET_PER_CONN_OPTION[] options = new INTERNET_PER_CONN_OPTION[optionCount];
    options[0].dwOption = INTERNET_PER_CONN_FLAGS;
    options[0].Value.dwValue = flags;
    options[1].dwOption = valueOption;
    options[1].Value.pszValue = Marshal.StringToHGlobalAuto(proxyServer ?? String.Empty);
    options[2].dwOption = INTERNET_PER_CONN_PROXY_BYPASS;
    options[2].Value.pszValue = Marshal.StringToHGlobalAuto(exceptions ?? String.Empty);

    INTERNET_PER_CONN_OPTION_LIST list = new INTERNET_PER_CONN_OPTION_LIST();
    list.dwSize = Marshal.SizeOf(typeof(INTERNET_PER_CONN_OPTION_LIST));
    list.pszConnection = connectionName == null ? IntPtr.Zero : Marshal.StringToHGlobalAuto(connectionName);
    list.dwOptionCount = optionCount;
    list.dwOptionError = 0;

    int optionSize = Marshal.SizeOf(typeof(INTERNET_PER_CONN_OPTION));
    IntPtr optionsPtr = Marshal.AllocCoTaskMem(optionSize * optionCount);
    IntPtr listPtr = IntPtr.Zero;
    try {
      for (int i = 0; i < optionCount; i++) {
        Marshal.StructureToPtr(options[i], new IntPtr(optionsPtr.ToInt64() + (i * optionSize)), false);
      }
      list.pOptions = optionsPtr;
      listPtr = Marshal.AllocCoTaskMem(list.dwSize);
      Marshal.StructureToPtr(list, listPtr, false);
      bool success = InternetSetOption(IntPtr.Zero, INTERNET_OPTION_PER_CONNECTION_OPTION, listPtr, list.dwSize);
      if (success) {
        Refresh();
      }
      return success;
    } finally {
      if (list.pszConnection != IntPtr.Zero) Marshal.FreeHGlobal(list.pszConnection);
      if (optionCount > 1 && options[1].Value.pszValue != IntPtr.Zero) Marshal.FreeHGlobal(options[1].Value.pszValue);
      if (optionCount > 2 && options[2].Value.pszValue != IntPtr.Zero) Marshal.FreeHGlobal(options[2].Value.pszValue);
      Marshal.FreeCoTaskMem(optionsPtr);
      if (listPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(listPtr);
    }
  }

  static IEnumerable<string> EnumerateRasEntries() {
    int entries = 0;
    RASENTRYNAME[] names = new RASENTRYNAME[1];
    int bufferSize = Marshal.SizeOf(typeof(RASENTRYNAME));
    names[0].dwSize = Marshal.SizeOf(typeof(RASENTRYNAME));
    uint result = RasEnumEntries(null, null, names, ref bufferSize, ref entries);
    if (result == ERROR_BUFFER_TOO_SMALL) {
      names = new RASENTRYNAME[bufferSize / Marshal.SizeOf(typeof(RASENTRYNAME))];
      for (int i = 0; i < names.Length; i++) {
        names[i].dwSize = Marshal.SizeOf(typeof(RASENTRYNAME));
      }
      result = RasEnumEntries(null, null, names, ref bufferSize, ref entries);
    }
    if (result != 0) {
      yield break;
    }
    for (int i = 0; i < entries; i++) {
      if (!String.IsNullOrEmpty(names[i].szEntryName)) {
        yield return names[i].szEntryName;
      }
    }
  }
}
"@;
Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue | Out-Null;
try {
  [WinInetProxyApply]::Apply($proxyServer, $exceptions, $type);
} catch {
  [WinInetProxyApply]::Refresh();
  Write-Error "WinINET per-connection proxy apply failed: $($_.Exception.Message)";
  exit 1;
}
`.trim();
const WINDOWS_PROXY_OVERRIDE = [
  'localhost',
  '127.*',
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
  '192.168.*'
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
const buildPowerShellStringLiteral = (value) => JSON.stringify(String(value || ''));
const buildWindowsProxyApplyScript = ({ proxyServer, exceptions, type }) => [
  `$proxyServer = ${buildPowerShellStringLiteral(proxyServer)};`,
  `$exceptions = ${buildPowerShellStringLiteral(exceptions)};`,
  `$type = ${Number(type)};`,
  WINDOWS_PROXY_APPLY_SCRIPT
].join('\n');
const buildLinuxEnvironmentFile = (entries) => [
  '# Managed by Leme Hub',
  ...Object.entries(entries).map(([key, value]) => `${key}=${value}`)
].join('\n') + '\n';
const sameEndpoint = (left, right) => {
  if (!left || !right) return false;
  return trimValue(left.host).toLowerCase() === trimValue(right.host).toLowerCase()
    && Number(left.port) === Number(right.port);
};

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

  parseWindowsWinHttpProxy(value) {
    const text = String(value || '');
    if (/direct access|no proxy server|直接访问|没有代理服务器/iu.test(text)) {
      return { enabled: false, http: null, raw: text };
    }

    const proxyMatch = text.match(/(?:^|\r?\n)\s*(?:proxy server(?:s)?(?:\(\w+\))?|代理服务器)\s*[:：]\s*([^\r\n]+)/iu);
    const candidate = proxyMatch?.[1]?.trim() || text.trim();
    const parsed = this.parseWindowsProxyServer(candidate);
    const http = parsed.http || parseHostPort(candidate);

    return {
      enabled: Boolean(http),
      http,
      raw: text
    };
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
    await this.applyWindowsWinInetProxy({ proxyServer, exceptions: WINDOWS_PROXY_OVERRIDE, type: 2 });
  }

  async getWindowsWinHttpStatus() {
    const { stdout } = await this.exec('netsh', ['winhttp', 'show', 'proxy']);
    return this.parseWindowsWinHttpProxy(stdout);
  }

  async deleteWindowsRegistryValue(name) {
    await this.exec('reg', ['delete', WINDOWS_PROXY_REG_PATH, '/v', name, '/f']).catch(() => null);
  }

  async disableWindowsProxy() {
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'AutoConfigURL', '/t', 'REG_SZ', '/d', '', '/f']);
    await this.applyWindowsWinInetProxy({ proxyServer: '', exceptions: '', type: 1 });
  }

  async probeTcpEndpoint({ host, port, timeoutMs = 1500 }) {
    const normalizedHost = trimValue(host);
    const normalizedPort = Number(port);
    if (!normalizedHost || !Number.isInteger(normalizedPort) || normalizedPort <= 0) {
      return { ok: false, error: 'Invalid endpoint' };
    }

    return new Promise((resolve) => {
      const socket = net.createConnection({ host: normalizedHost, port: normalizedPort });
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish({ ok: true }));
      socket.once('timeout', () => finish({ ok: false, error: 'Connection timed out' }));
      socket.once('error', (error) => finish({ ok: false, error: error.message }));
    });
  }

  async diagnoseWindowsProxy({ host, httpPort }) {
    const expected = {
      host: normalizeWindowsSystemProxyHost(host),
      port: Number(httpPort)
    };
    const checks = {
      wininet: { ok: false, status: null, error: null },
      winhttp: { ok: true, skipped: true, status: null, error: null },
      localProxy: { ok: false, error: null }
    };

    try {
      checks.wininet.status = await this.getWindowsStatus();
      checks.wininet.ok = checks.wininet.status.enabled && sameEndpoint(checks.wininet.status.http, expected);
    } catch (error) {
      checks.wininet.error = error.message;
    }

    try {
      checks.winhttp.status = await this.getWindowsWinHttpStatus();
    } catch (error) {
      checks.winhttp.error = error.message;
    }

    const localProxy = await this.probeTcpEndpoint(expected);
    checks.localProxy = localProxy.ok
      ? { ok: true, error: null }
      : { ok: false, error: localProxy.error || 'Local proxy is not reachable' };

    return {
      supported: true,
      expected,
      ok: checks.wininet.ok && checks.localProxy.ok,
      checks
    };
  }

  async diagnose({ host, httpPort }) {
    if (this.platform === 'win32') {
      return this.diagnoseWindowsProxy({ host, httpPort });
    }

    return {
      supported: false,
      expected: null,
      ok: false,
      checks: {},
      lastError: `System proxy diagnosis is not supported on ${this.platform}`
    };
  }

  async applyWindowsWinInetProxy({ proxyServer, exceptions, type }) {
    await this.exec('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      buildWindowsProxyApplyScript({ proxyServer, exceptions, type })
    ]);
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
