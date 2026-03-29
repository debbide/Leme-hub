import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
const WINDOWS_PROXY_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

const trimValue = (value) => String(value || '').trim();
const clearProxyEndpointsIfDisabled = (status) => status.enabled
  ? status
  : {
      ...status,
      http: null,
      socks: null
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

  async setWindowsProxy({ host, httpPort, socksPort }) {
    const proxyServer = `socks=${host}:${socksPort}`;
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', proxyServer, '/f']);
  }

  async disableWindowsProxy() {
    await this.exec('reg', ['add', WINDOWS_PROXY_REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
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
    await this.gsettingsSet('org.gnome.system.proxy.http', 'host', '');
    await this.gsettingsSet('org.gnome.system.proxy.http', 'port', '0');
    await this.gsettingsSet('org.gnome.system.proxy.https', 'host', '');
    await this.gsettingsSet('org.gnome.system.proxy.https', 'port', '0');
    await this.gsettingsSet('org.gnome.system.proxy.socks', 'host', host);
    await this.gsettingsSet('org.gnome.system.proxy.socks', 'port', String(socksPort));
    await this.gsettingsSet('org.gnome.system.proxy', 'mode', 'manual');
  }

  async disableLinuxProxy() {
    await this.gsettingsSet('org.gnome.system.proxy', 'mode', 'none');
  }
}
