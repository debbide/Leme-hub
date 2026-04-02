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
  autoStart: false,
  systemProxySocksPort: DEFAULT_SYSTEM_PROXY_SOCKS_PORT,
  systemProxyHttpPort: DEFAULT_SYSTEM_PROXY_HTTP_PORT,
  activeNodeId: null,
  customRules: [],
  rulesets: [],
  subscriptions: [],
  groups: [],
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
