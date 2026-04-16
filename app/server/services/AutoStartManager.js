import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
const WINDOWS_RUN_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WINDOWS_STARTUP_APPROVED_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const APP_NAME = 'Leme Hub';
const AUTOSTART_BACKGROUND_ARG = '--background';

const trimValue = (value) => String(value || '').trim();
const quoteDesktopExec = (value) => `"${String(value || '').replace(/"/g, '\\"')}"`;
const quoteCommandPath = (value) => `"${String(value || '').replace(/"/g, '')}"`;
const buildAutoStartCommand = (executable) => `${quoteCommandPath(executable)} ${AUTOSTART_BACKGROUND_ARG}`.trim();
const normalizeCommand = (value) => trimValue(value).replace(/\s+/g, ' ').toLowerCase();
const parseWindowsRunCommand = (stdout) => {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const record = [...lines].reverse().find((line) => line.includes('REG_SZ'));
  if (!record) {
    return null;
  }

  const match = record.match(/\bREG_SZ\b\s+(.*)$/i);
  return trimValue(match?.[1] || '');
};

const parseWindowsStartupApprovedState = (stdout) => {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const record = [...lines].reverse().find((line) => line.includes('REG_BINARY'));
  if (!record) {
    return null;
  }

  const match = record.match(/\bREG_BINARY\b\s+(.*)$/i);
  const firstByte = String(match?.[1] || '').trim().split(/\s+/u).find(Boolean);
  if (!firstByte) {
    return null;
  }

  const value = Number.parseInt(firstByte, 16);
  if (!Number.isInteger(value)) {
    return null;
  }

  if (value === 0x03) {
    return 'disabled';
  }
  if (value === 0x02) {
    return 'enabled';
  }

  return 'unknown';
};

export class AutoStartManager {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFileAsync;
    this.env = options.env || process.env;
    this.homeDir = options.homeDir || os.homedir();
    this.fs = options.fs || fs;
    this.executablePath = options.executablePath || null;
  }

  resolveWindowsCommand(command) {
    if (this.platform !== 'win32' || command !== 'reg') {
      return command;
    }

    const systemRoot = trimValue(
      this.env.SystemRoot
      || this.env.SYSTEMROOT
      || this.env.windir
      || this.env.WINDIR
    );

    return systemRoot
      ? path.join(systemRoot, 'System32', 'reg.exe')
      : command;
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

  getExpectedCommand() {
    return buildAutoStartCommand(this.resolveExecutablePath());
  }

  matchesExpectedCommand(command) {
    return normalizeCommand(command) === normalizeCommand(this.getExpectedCommand());
  }

  async exec(command, args) {
    return this.execFile(this.resolveWindowsCommand(command), args, { windowsHide: true });
  }

  getLinuxAutostartDir() {
    return path.join(this.homeDir, '.config', 'autostart');
  }

  getLinuxDesktopFilePath() {
    return path.join(this.getLinuxAutostartDir(), 'leme-hub.desktop');
  }

  async getWindowsStatus() {
    try {
      const [{ stdout }, startupApprovedResult] = await Promise.all([
        this.exec('reg', ['query', WINDOWS_RUN_REG_PATH, '/v', APP_NAME]),
        this.exec('reg', ['query', WINDOWS_STARTUP_APPROVED_REG_PATH, '/v', APP_NAME]).catch(() => null)
      ]);
      const command = parseWindowsRunCommand(stdout);
      const startupApproved = parseWindowsStartupApprovedState(startupApprovedResult?.stdout || '');
      const disabledBySystem = startupApproved === 'disabled';
      return {
        enabled: stdout.includes(APP_NAME) && !disabledBySystem,
        provider: 'windows-registry',
        supported: true,
        command,
        startupApproved,
        disabledBySystem
      };
    } catch {
      return {
        enabled: false,
        provider: 'windows-registry',
        supported: true,
        command: null,
        startupApproved: null,
        disabledBySystem: false
      };
    }
  }

  async enableWindows() {
    const executable = this.resolveExecutablePath();
    await this.exec('reg', ['add', WINDOWS_RUN_REG_PATH, '/v', APP_NAME, '/t', 'REG_SZ', '/d', buildAutoStartCommand(executable), '/f']);
    try {
      await this.exec('reg', ['delete', WINDOWS_STARTUP_APPROVED_REG_PATH, '/v', APP_NAME, '/f']);
    } catch {
      // ignore missing or unsupported StartupApproved entries
    }
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
