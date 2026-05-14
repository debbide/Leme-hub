import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
export const MICROSOFT_STORE_PACKAGE_FAMILY = 'Microsoft.WindowsStore_8wekyb3d8bbwe';
export const MICROSOFT_STORE_LOOPBACK_TARGETS = [
  {
    id: 'windows-store',
    label: 'Microsoft Store',
    packageName: 'Microsoft.WindowsStore',
    fallbackFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY
  },
  {
    id: 'store-purchase',
    label: 'Store Purchase',
    packageName: 'Microsoft.StorePurchaseApp',
    fallbackFamilyName: 'Microsoft.StorePurchaseApp_8wekyb3d8bbwe'
  },
  {
    id: 'aad-broker',
    label: 'Microsoft Account Sign-in',
    packageName: 'Microsoft.AAD.BrokerPlugin',
    fallbackFamilyName: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy'
  },
  {
    id: 'accounts-control',
    label: 'Accounts Control',
    packageName: 'Microsoft.AccountsControl',
    fallbackFamilyName: 'Microsoft.AccountsControl_cw5n1h2txyewy'
  },
  {
    id: 'cloud-experience',
    label: 'Cloud Experience Host',
    packageName: 'Microsoft.Windows.CloudExperienceHost',
    fallbackFamilyName: 'Microsoft.Windows.CloudExperienceHost_cw5n1h2txyewy'
  },
  {
    id: 'xbox-identity',
    label: 'Xbox Identity Provider',
    packageName: 'Microsoft.XboxIdentityProvider',
    fallbackFamilyName: 'Microsoft.XboxIdentityProvider_8wekyb3d8bbwe'
  }
];
const PACKAGE_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*_[A-Za-z0-9]+$/u;
const PACKAGE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9.]*$/u;

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

const samePackageFamilyName = (left, right) => String(left || '').toLowerCase() === String(right || '').toLowerCase();
const hasPackageFamilyName = (packageFamilyNames, packageFamilyName) => packageFamilyNames
  .some((value) => samePackageFamilyName(value, packageFamilyName));

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
    this.loopbackTargets = options.loopbackTargets || MICROSOFT_STORE_LOOPBACK_TARGETS;
    this.packageFamilyNameCache = new Map();
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

  validatePackageName(packageName) {
    const value = String(packageName || '').trim();
    if (!PACKAGE_NAME_RE.test(value)) {
      throw new Error('Invalid package name');
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

  async resolvePackageFamilyName(packageName, fallbackFamilyName = null) {
    if (!this.supported) {
      return null;
    }
    const value = this.validatePackageName(packageName);
    if (this.packageFamilyNameCache.has(value)) {
      return this.packageFamilyNameCache.get(value);
    }

    try {
      const { stdout } = await this.exec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Get-AppxPackage -AllUsers ${value} | Select-Object -First 1 -ExpandProperty PackageFamilyName`
      ]);
      const packageFamilyName = parsePackageFamilyNames(stdout)[0] || fallbackFamilyName;
      this.packageFamilyNameCache.set(value, packageFamilyName);
      return packageFamilyName;
    } catch {
      this.packageFamilyNameCache.set(value, fallbackFamilyName);
      return fallbackFamilyName;
    }
  }

  async resolveMicrosoftStorePackageFamilyName() {
    if (!this.supported) {
      return null;
    }
    if (this.microsoftStorePackageFamilyName) {
      return this.microsoftStorePackageFamilyName;
    }

    this.microsoftStorePackageFamilyName = await this.resolvePackageFamilyName(
      'Microsoft.WindowsStore',
      MICROSOFT_STORE_PACKAGE_FAMILY
    );
    return this.microsoftStorePackageFamilyName;
  }

  async resolveMicrosoftStoreLoopbackTargets() {
    if (!this.supported) {
      return this.loopbackTargets.map((target) => ({
        ...target,
        packageFamilyName: target.fallbackFamilyName
      }));
    }

    const resolvedTargets = [];
    for (const target of this.loopbackTargets) {
      const packageFamilyName = await this.resolvePackageFamilyName(target.packageName, target.fallbackFamilyName);
      if (packageFamilyName) {
        resolvedTargets.push({ ...target, packageFamilyName });
      }
    }
    return resolvedTargets;
  }

  async addExemption(packageFamilyName) {
    if (!this.supported) {
      throw new Error('UWP loopback exemption is only supported on Windows');
    }

    const value = this.validatePackageFamilyName(packageFamilyName);
    await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-a', `-n=${value}`]);
    const status = await this.getMicrosoftStoreStatus(value);
    if (!status.exempted) {
      const error = new Error('修复命令已执行，但系统复查后仍未放行微软商店回环');
      error.status = 409;
      error.uwpLoopback = status;
      throw error;
    }
    return status;
  }

  async removeExemption(packageFamilyName) {
    if (!this.supported) {
      throw new Error('UWP loopback exemption is only supported on Windows');
    }

    const value = this.validatePackageFamilyName(packageFamilyName);
    await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-d', `-n=${value}`]);
    const status = await this.getMicrosoftStoreStatus(value);
    if (status.exempted) {
      const error = new Error('撤销命令已执行，但系统复查后微软商店仍在回环放行列表中');
      error.status = 409;
      error.uwpLoopback = status;
      throw error;
    }
    return status;
  }

  async addMicrosoftStoreExemptions() {
    if (!this.supported) {
      throw new Error('UWP loopback exemption is only supported on Windows');
    }

    const targets = await this.resolveMicrosoftStoreLoopbackTargets();
    const exemptions = await this.listExemptions();
    const missingTargets = targets.filter((target) => !hasPackageFamilyName(exemptions, target.packageFamilyName));
    for (const target of missingTargets) {
      await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-a', `-n=${target.packageFamilyName}`]);
    }

    const status = await this.getMicrosoftStoreStatus();
    if (!status.exempted) {
      const error = new Error('修复命令已执行，但系统复查后仍有微软商店登录组件未放行回环');
      error.status = 409;
      error.uwpLoopback = status;
      throw error;
    }
    return status;
  }

  async removeMicrosoftStoreExemptions() {
    if (!this.supported) {
      throw new Error('UWP loopback exemption is only supported on Windows');
    }

    const statusBefore = await this.getMicrosoftStoreStatus();
    const exemptedTargets = (statusBefore.packages || []).filter((target) => target.exempted);
    for (const target of exemptedTargets) {
      await this.exec('CheckNetIsolation.exe', ['LoopbackExempt', '-d', `-n=${target.packageFamilyName}`]);
    }

    const status = await this.getMicrosoftStoreStatus();
    if (status.hasAnyExemption) {
      const error = new Error('撤销命令已执行，但系统复查后仍有微软商店登录组件在回环放行列表中');
      error.status = 409;
      error.uwpLoopback = status;
      throw error;
    }
    return status;
  }

  async getMicrosoftStoreStatus(packageFamilyNameOverride = null) {
    const targets = packageFamilyNameOverride
      ? [{ id: 'windows-store', label: 'Microsoft Store', packageName: 'Microsoft.WindowsStore', packageFamilyName: packageFamilyNameOverride }]
      : await this.resolveMicrosoftStoreLoopbackTargets();
    const packageFamilyName = targets[0]?.packageFamilyName || MICROSOFT_STORE_PACKAGE_FAMILY;
    const exemptions = this.supported ? await this.listExemptions() : [];
    const packages = targets.map((target) => ({
      id: target.id,
      label: target.label,
      packageName: target.packageName,
      packageFamilyName: target.packageFamilyName,
      exempted: hasPackageFamilyName(exemptions, target.packageFamilyName)
    }));
    const exemptedCount = packages.filter((target) => target.exempted).length;
    const totalCount = packages.length;
    const exempted = totalCount > 0 && exemptedCount === totalCount;

    return {
      supported: this.supported,
      packageFamilyName,
      packageFamilyNames: packages.map((target) => target.packageFamilyName),
      packages,
      exempted,
      hasAnyExemption: exemptedCount > 0,
      exemptedCount,
      totalCount,
      exemptions
    };
  }
}

export const internals = {
  parseLoopbackExemptions,
  parsePackageFamilyNames,
  hasPackageFamilyName,
  samePackageFamilyName
};
