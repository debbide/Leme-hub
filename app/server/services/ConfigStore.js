import fs from 'fs';

import {
  DEFAULT_DNS_BOOTSTRAP_SERVER,
  DEFAULT_DNS_DIRECT_SERVER,
  DEFAULT_DNS_FINAL,
  DEFAULT_DNS_REMOTE_SERVER,
  DEFAULT_DNS_STRATEGY,
  DEFAULT_PROXY_BASE_PORT,
  DEFAULT_PROXY_LISTEN_HOST,
  DEFAULT_SERVER_PROXY_LISTEN_HOST,
  DEFAULT_SYSTEM_PROXY_HTTP_PORT,
  DEFAULT_SYSTEM_PROXY_SOCKS_PORT,
  DEFAULT_UI_HOST,
  DEFAULT_UI_PORT
} from '../../shared/constants.js';
import { normalizeHost } from '../../shared/network.js';

const resolveRuntimeMode = (options = {}) => {
  if (options.mode) {
    return options.mode === 'server' ? 'server' : 'desktop';
  }

  return options.env?.LEME_MODE === 'server' ? 'server' : 'desktop';
};

const defaultSettings = (paths, options = {}) => {
  const mode = resolveRuntimeMode(options);

  return {
    uiHost: DEFAULT_UI_HOST,
    uiPort: DEFAULT_UI_PORT,
    proxyListenHost: mode === 'server' ? DEFAULT_SERVER_PROXY_LISTEN_HOST : DEFAULT_PROXY_LISTEN_HOST,
    proxyBasePort: DEFAULT_PROXY_BASE_PORT,
    tlsFragmentEnabled: true,
    systemProxyEnabled: false,
    systemProxyCaptureEnabled: false,
    autoStart: false,
    systemProxySocksPort: DEFAULT_SYSTEM_PROXY_SOCKS_PORT,
    systemProxyHttpPort: DEFAULT_SYSTEM_PROXY_HTTP_PORT,
    dnsRemoteServer: DEFAULT_DNS_REMOTE_SERVER,
    dnsDirectServer: DEFAULT_DNS_DIRECT_SERVER,
    dnsBootstrapServer: DEFAULT_DNS_BOOTSTRAP_SERVER,
    dnsFinal: DEFAULT_DNS_FINAL,
    dnsStrategy: DEFAULT_DNS_STRATEGY,
    activeNodeId: null,
    routingItems: [],
    customRules: [],
    rulesets: [],
    nodeGroups: [],
    subscriptions: [],
    groups: [],
    nodeGroupAutoTestIntervalSec: 300,
    nodeGroupLatencyCache: {
      updatedAt: null,
      results: {}
    },
    singBoxBinaryPath: process.platform === 'win32'
      ? `${paths.binDir}\\sing-box.exe`
      : `${paths.binDir}/sing-box`,
    routingMode: 'rule'
  };
};

const normalizeSettings = (paths, settings = {}, options = {}) => {
  const defaults = defaultSettings(paths, options);
  const mode = resolveRuntimeMode(options);
  const hasCapturePreference = Object.prototype.hasOwnProperty.call(settings, 'systemProxyCaptureEnabled');
  const normalized = {
    ...defaults,
    ...settings
  };

  normalized.uiHost = normalizeHost(normalized.uiHost, defaults.uiHost);
  normalized.proxyListenHost = normalizeHost(normalized.proxyListenHost, defaults.proxyListenHost);

  normalized.tlsFragmentEnabled = !!normalized.tlsFragmentEnabled;
  normalized.systemProxyEnabled = !!normalized.systemProxyEnabled;
  normalized.systemProxyCaptureEnabled = hasCapturePreference
    ? !!normalized.systemProxyCaptureEnabled
    : mode === 'desktop'
      ? normalized.systemProxyEnabled
      : false;
  if (!normalized.systemProxyEnabled) {
    normalized.systemProxyCaptureEnabled = false;
  }

  if (normalized.systemProxySocksPort === 20100 && normalized.systemProxyHttpPort === 20101) {
    normalized.systemProxySocksPort = DEFAULT_SYSTEM_PROXY_SOCKS_PORT;
    normalized.systemProxyHttpPort = DEFAULT_SYSTEM_PROXY_HTTP_PORT;
  }

  return normalized;
};

export class ConfigStore {
  constructor(paths, options = {}) {
    this.paths = paths;
    this.options = options;
    this.ensureFiles();
  }

  ensureFiles() {
    const bootstrap = [
      [this.paths.settingsPath, defaultSettings(this.paths, this.options)],
      [this.paths.nodesPath, []],
      [this.paths.logPath, ''],
      [this.paths.configPath, null]
    ];

    for (const [filePath, initialValue] of bootstrap) {
      if (!fs.existsSync(filePath)) {
        const payload = typeof initialValue === 'string'
          ? initialValue
          : JSON.stringify(initialValue, null, 2);
        fs.writeFileSync(filePath, payload);
      }
    }

    const currentSettings = this.readJson(this.paths.settingsPath, defaultSettings(this.paths, this.options));
    const normalizedSettings = normalizeSettings(this.paths, currentSettings, this.options);
    if (JSON.stringify(currentSettings) !== JSON.stringify(normalizedSettings)) {
      this.writeJson(this.paths.settingsPath, normalizedSettings);
    }
  }

  readJson(filePath, fallback) {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.appendLog(`[ConfigStore] Failed to read ${filePath}: ${error.message}`);
      }
      return fallback;
    }

    if (!raw.trim()) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      const backup = `${filePath}.corrupt`;
      try {
        fs.copyFileSync(filePath, backup);
        this.appendLog(`[ConfigStore] Corrupt JSON in ${filePath}, backed up to ${backup}`);
      } catch {
        this.appendLog(`[ConfigStore] Corrupt JSON in ${filePath} (backup failed): ${error.message}`);
      }
      return fallback;
    }
  }

  writeJson(filePath, value) {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, filePath);
    return value;
  }

  getSettings() {
    return normalizeSettings(this.paths, this.readJson(this.paths.settingsPath, defaultSettings(this.paths, this.options)), this.options);
  }

  getNodes() {
    return this.readJson(this.paths.nodesPath, []);
  }

  saveNodes(nodes) {
    return this.writeJson(this.paths.nodesPath, nodes);
  }

  saveSettings(settings) {
    return this.writeJson(this.paths.settingsPath, normalizeSettings(this.paths, settings, this.options));
  }

  rotateLogs() {
    const MAX_SIZE = 5 * 1024 * 1024;
    const MAX_FILES = 3;
    try {
      const stat = fs.statSync(this.paths.logPath);
      if (stat.size < MAX_SIZE) return;
    } catch {
      return;
    }

    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const older = `${this.paths.logPath}.${i}`;
      const newer = `${this.paths.logPath}.${i + 1}`;
      if (fs.existsSync(newer)) fs.rmSync(newer);
      if (fs.existsSync(older)) fs.renameSync(older, newer);
    }

    const rotated = `${this.paths.logPath}.1`;
    if (fs.existsSync(rotated)) fs.rmSync(rotated);
    fs.renameSync(this.paths.logPath, rotated);
  }

  appendLog(message) {
    this.rotateLogs();
    fs.appendFileSync(this.paths.logPath, `${message}\n`);
  }

  getRecentLogs(limit = 200) {
    try {
      const lines = fs.readFileSync(this.paths.logPath, 'utf8').split(/\r?\n/).filter(Boolean);
      return lines.slice(-limit);
    } catch (error) {
      return [];
    }
  }
}
