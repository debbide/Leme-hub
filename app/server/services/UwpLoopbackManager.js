import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
export const MICROSOFT_STORE_PACKAGE_FAMILY = 'Microsoft.WindowsStore_8wekyb3d8bbwe';
const PACKAGE_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*_[A-Za-z0-9]+$/u;

const parsePackageFamilyNames = (stdout) => String(stdout || '')
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    const match = line.match(/PackageFamilyName\s*:?\s*(\S+)/iu);
    const candidate = match ? match[1] : line;
    return PACKAGE_FAMILY_RE.test(candidate) ? [candidate] : [];
  });

const parseLoopbackExemptions = (stdout) => {
  const result = new Set();
  const tokens = String(stdout || '').match(/[A-Za-z0-9][A-Za-z0-9._-]*_[A-Za-z0-9]+/gu) || [];
  for (const token of tokens) {
    if (PACKAGE_FAMILY_RE.test(token)) {
      result.add(token);
    }
  }
  return [...result];
};

const normalizeCommandError = (command, error) => {
  const detail = [error?.message, error?.stderr, error?.stdout].filter(Boolean).join('\n');
  if (/access is denied|elevat|administrator|拒绝访问|管理员/iu.test(detail)) {
    return new Error('需要管理员权限，请以管理员身份运行 Leme Hub 后重试');
  }
  if (/not recognized|not found|ENOENT|找不到/iu.test(detail)) {
    return command === 'powershell.exe'
      ? new Error('无法查询微软商店包名，已无法确认 UWP 回环状态')
      : new Error('系统缺少 CheckNetIsolation，无法修改 UWP 回环限制');
  }
  return error;
};

export class UwpLoopbackManager {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFileAsync;
    this.microsoftStorePackageFamilyName = options.microsoftStorePackageFamilyName || null;
  }

  get supported() {
    return this.platform === 'win32';
  }

  async exec(command, args) {
    try {
      return await this.execFile(command, args, { windowsHide: true });
    } catch (error) {
      throw normalizeCommandError(command, error);
    }
  }

  validatePackageFamilyName(packageFamilyName) {
    const value = String(packageFamilyName || '').trim();
    if (!PACKAGE_FAMILY_RE.test(value)) {
      throw new Error('Invalid package family name');
    }
    return value;
  }

  async listExemptions() {
    if (!this.supported) {
      return [];
    }

    const { stdout } = await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-s']);
    return parseLoopbackExemptions(stdout);
  }

  async resolveMicrosoftStorePackageFamilyName() {
    if (!this.supported) {
      return null;
    }
    if (this.microsoftStorePackageFamilyName) {
      return this.microsoftStorePackageFamilyName;
    }

    try {
      const { stdout } = await this.exec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-AppxPackage Microsoft.WindowsStore | Select-Object -ExpandProperty PackageFamilyName'
      ]);
      this.microsoftStorePackageFamilyName = parsePackageFamilyNames(stdout)[0] || MICROSOFT_STORE_PACKAGE_FAMILY;
      return this.microsoftStorePackageFamilyName;
    } catch {
      this.microsoftStorePackageFamilyName = MICROSOFT_STORE_PACKAGE_FAMILY;
      return this.microsoftStorePackageFamilyName;
    }
  }

  async addExemption(packageFamilyName) {
    if (!this.supported) {
      throw new Error('UWP loopback exemption is only supported on Windows');
    }

    const value = this.validatePackageFamilyName(packageFamilyName);
    await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-a', `-n=${value}`]);
    return this.getMicrosoftStoreStatus(value);
  }

  async removeExemption(packageFamilyName) {
    if (!this.supported) {
      throw new Error('UWP loopback exemption is only supported on Windows');
    }

    const value = this.validatePackageFamilyName(packageFamilyName);
    await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-d', `-n=${value}`]);
    return this.getMicrosoftStoreStatus(value);
  }

  async getMicrosoftStoreStatus(packageFamilyNameOverride = null) {
    const packageFamilyName = this.supported
      ? (packageFamilyNameOverride || await this.resolveMicrosoftStorePackageFamilyName())
      : MICROSOFT_STORE_PACKAGE_FAMILY;
    const exemptions = this.supported ? await this.listExemptions() : [];
    const exempted = packageFamilyName ? exemptions.includes(packageFamilyName) : false;

    return {
      supported: this.supported,
      packageFamilyName,
      exempted,
      exemptions
    };
  }
}

export const internals = {
  parseLoopbackExemptions,
  parsePackageFamilyNames
};
