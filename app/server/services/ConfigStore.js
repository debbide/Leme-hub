import fs from 'fs';

import {
  DEFAULT_PROXY_BASE_PORT,
  DEFAULT_PROXY_LISTEN_HOST,
  DEFAULT_SYSTEM_PROXY_HTTP_PORT,
  DEFAULT_SYSTEM_PROXY_SOCKS_PORT,
  DEFAULT_UI_HOST,
  DEFAULT_UI_PORT
} from '../../shared/constants.js';

const defaultSettings = (paths) => ({
  uiHost: DEFAULT_UI_HOST,
  uiPort: DEFAULT_UI_PORT,
  proxyListenHost: DEFAULT_PROXY_LISTEN_HOST,
  proxyBasePort: DEFAULT_PROXY_BASE_PORT,
  systemProxyEnabled: false,
  systemProxySocksPort: DEFAULT_SYSTEM_PROXY_SOCKS_PORT,
  systemProxyHttpPort: DEFAULT_SYSTEM_PROXY_HTTP_PORT,
  activeNodeId: null,
  customRules: [],
  subscriptions: [],
  singBoxBinaryPath: process.platform === 'win32'
    ? `${paths.binDir}\\sing-box.exe`
    : `${paths.binDir}/sing-box`,
  routingMode: 'rule'
});

const normalizeSettings = (paths, settings = {}) => {
  const defaults = defaultSettings(paths);
  return {
    ...defaults,
    ...settings
  };
};

export class ConfigStore {
  constructor(paths) {
    this.paths = paths;
    this.ensureFiles();
  }

  ensureFiles() {
    const bootstrap = [
      [this.paths.settingsPath, defaultSettings(this.paths)],
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

    const currentSettings = this.readJson(this.paths.settingsPath, defaultSettings(this.paths));
    const normalizedSettings = normalizeSettings(this.paths, currentSettings);
    if (JSON.stringify(currentSettings) !== JSON.stringify(normalizedSettings)) {
      this.writeJson(this.paths.settingsPath, normalizedSettings);
    }
  }

  readJson(filePath, fallback) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return raw.trim() ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    return value;
  }

  getSettings() {
    return normalizeSettings(this.paths, this.readJson(this.paths.settingsPath, defaultSettings(this.paths)));
  }

  getNodes() {
    return this.readJson(this.paths.nodesPath, []);
  }

  saveNodes(nodes) {
    return this.writeJson(this.paths.nodesPath, nodes);
  }

  saveSettings(settings) {
    return this.writeJson(this.paths.settingsPath, normalizeSettings(this.paths, settings));
  }

  appendLog(message) {
    fs.appendFileSync(this.paths.logPath, `${message}\n`);
  }

  getRecentLogs(limit = 50) {
    try {
      const lines = fs.readFileSync(this.paths.logPath, 'utf8').split(/\r?\n/).filter(Boolean);
      return lines.slice(-limit);
    } catch (error) {
      return [];
    }
  }
}
