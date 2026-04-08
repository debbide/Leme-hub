import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
const WINDOWS_RUN_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APP_NAME = 'Leme Hub';
const AUTOSTART_BACKGROUND_ARG = '--background';

const trimValue = (value) => String(value || '').trim();
const quoteDesktopExec = (value) => `"${String(value || '').replace(/"/g, '\\"')}"`;
const quoteCommandPath = (value) => `"${String(value || '').replace(/"/g, '')}"`;
const buildAutoStartCommand = (executable) => `${quoteCommandPath(executable)} ${AUTOSTART_BACKGROUND_ARG}`.trim();

export class AutoStartManager {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFileAsync;
    this.env = options.env || process.env;
    this.homeDir = options.homeDir || os.homedir();
    this.fs = options.fs || fs;
    this.executablePath = options.executablePath || null;
  }

  getCapabilities() {
    if (this.platform === 'win32') {
      return { supported: true, provider: 'windows-registry' };
    }
    if (this.platform === 'linux') {
      return { supported: true, provider: 'xdg-autostart' };
    }

    return { supported: false, provider: 'unsupported' };
  }

  resolveExecutablePath() {
    if (this.executablePath) {
      return this.executablePath;
    }

    return this.env.LEME_AUTOSTART_EXECUTABLE
      || this.env.PORTABLE_EXECUTABLE_FILE
      || process.execPath;
  }

  async exec(command, args) {
    return this.execFile(command, args, { windowsHide: true });
  }

  getLinuxAutostartDir() {
    return path.join(this.homeDir, '.config', 'autostart');
  }

  getLinuxDesktopFilePath() {
    return path.join(this.getLinuxAutostartDir(), 'leme-hub.desktop');
  }

  async getWindowsStatus() {
    try {
      const { stdout } = await this.exec('reg', ['query', WINDOWS_RUN_REG_PATH, '/v', APP_NAME]);
      return {
        enabled: stdout.includes(APP_NAME),
        provider: 'windows-registry',
        supported: true,
        command: trimValue(stdout)
      };
    } catch {
      return {
        enabled: false,
        provider: 'windows-registry',
        supported: true,
        command: null
      };
    }
  }

  async enableWindows() {
    const executable = this.resolveExecutablePath();
    await this.exec('reg', ['add', WINDOWS_RUN_REG_PATH, '/v', APP_NAME, '/t', 'REG_SZ', '/d', buildAutoStartCommand(executable), '/f']);
    return this.getWindowsStatus();
  }

  async disableWindows() {
    try {
      await this.exec('reg', ['delete', WINDOWS_RUN_REG_PATH, '/v', APP_NAME, '/f']);
    } catch {
      // ignore missing entry
    }
    return this.getWindowsStatus();
  }

  async getLinuxStatus() {
    const desktopFile = this.getLinuxDesktopFilePath();
    return {
      enabled: this.fs.existsSync(desktopFile),
      provider: 'xdg-autostart',
      supported: true,
      command: this.fs.existsSync(desktopFile) ? this.fs.readFileSync(desktopFile, 'utf8') : null
    };
  }

  async enableLinux() {
    const executable = this.resolveExecutablePath();
    const dir = this.getLinuxAutostartDir();
    this.fs.mkdirSync(dir, { recursive: true });
    this.fs.writeFileSync(this.getLinuxDesktopFilePath(), [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${APP_NAME}`,
      `Exec=${quoteDesktopExec(executable)} ${AUTOSTART_BACKGROUND_ARG}`,
      'X-GNOME-Autostart-enabled=true'
    ].join('\n'));
    return this.getLinuxStatus();
  }

  async disableLinux() {
    const desktopFile = this.getLinuxDesktopFilePath();
    if (this.fs.existsSync(desktopFile)) {
      this.fs.rmSync(desktopFile, { force: true });
    }
    return this.getLinuxStatus();
  }

  async getStatus() {
    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      return { enabled: false, supported: false, provider: capabilities.provider, command: null };
    }

    if (this.platform === 'win32') {
      return this.getWindowsStatus();
    }
    return this.getLinuxStatus();
  }

  async enable() {
    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      throw new Error(`Auto start is not supported on ${this.platform}`);
    }

    if (this.platform === 'win32') {
      return this.enableWindows();
    }
    return this.enableLinux();
  }

  async disable() {
    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      return this.getStatus();
    }

    if (this.platform === 'win32') {
      return this.disableWindows();
    }
    return this.disableLinux();
  }
}
