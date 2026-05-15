import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);
export const MICROSOFT_STORE_PACKAGE_FAMILY = 'Microsoft.WindowsStore_8wekyb3d8bbwe';
export const MICROSOFT_STORE_LOOPBACK_TARGETS = [
  {
    id: 'windows-store',
    label: 'Microsoft Store',
    packageName: 'Microsoft.WindowsStore',
    fallbackFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY,
    fallbackWhenUnresolved: true,
    required: true
  },
  {
    id: 'store-experience-host',
    label: 'Store Experience Host',
    packageName: 'Microsoft.StorePurchaseApp',
    fallbackFamilyName: 'Microsoft.StorePurchaseApp_8wekyb3d8bbwe',
    fallbackWhenUnresolved: true,
    required: true
  },
  {
    id: 'microsoft-account',
    label: 'Work or School Account',
    packageName: 'Microsoft.AAD.BrokerPlugin',
    fallbackFamilyName: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'accounts-control',
    label: 'Your Account',
    packageName: 'Microsoft.AccountsControl',
    fallbackFamilyName: 'Microsoft.AccountsControl_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'xbox-identity',
    label: 'Xbox Identity Provider',
    packageName: 'Microsoft.XboxIdentityProvider',
    fallbackFamilyName: 'Microsoft.XboxIdentityProvider_8wekyb3d8bbwe',
    fallbackWhenUnresolved: true
  },
  {
    id: 'web-experience',
    label: 'Windows Web Experience Pack',
    packageName: 'MicrosoftWindows.Client.WebExperience',
    fallbackFamilyName: 'MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'email-and-accounts',
    label: 'Email and Accounts',
    packageName: 'windows.immersivecontrolpanel',
    fallbackFamilyName: 'windows.immersivecontrolpanel_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'shell-experience',
    label: 'Shell Experience Host',
    packageName: 'Microsoft.Windows.ShellExperienceHost',
    fallbackFamilyName: 'Microsoft.Windows.ShellExperienceHost_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'win32-webview-host',
    label: 'Win32 WebView Host',
    packageName: 'Microsoft.Win32WebViewHost',
    fallbackFamilyName: 'Microsoft.Win32WebViewHost_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'start-menu-experience',
    label: 'Start Menu Experience Host',
    packageName: 'Microsoft.Windows.StartMenuExperienceHost',
    fallbackFamilyName: 'Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy',
    fallbackWhenUnresolved: true
  },
  {
    id: 'people-experience',
    label: 'People Experience Host',
    packageName: 'Microsoft.Windows.PeopleExperienceHost',
    fallbackFamilyName: 'Microsoft.Windows.PeopleExperienceHost_cw5n1h2txyewy'
  },
  {
    id: 'cloud-experience',
    label: 'Cloud Experience Host',
    packageName: 'Microsoft.Windows.CloudExperienceHost',
    fallbackFamilyName: 'Microsoft.Windows.CloudExperienceHost_cw5n1h2txyewy'
  },
  {
    id: 'store-engagement',
    label: 'Microsoft Store Engagement',
    packageName: 'Microsoft.Services.Store.Engagement',
    fallbackFamilyName: 'Microsoft.Services.Store.Engagement_8wekyb3d8bbwe'
  },
  {
    id: 'windows-client-cbs',
    label: 'Windows Shell Experience',
    packageName: 'MicrosoftWindows.Client.CBS',
    fallbackFamilyName: 'MicrosoftWindows.Client.CBS_cw5n1h2txyewy'
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

const parseAppxPackages = (stdout) => {
  const packages = [];
  let current = {};
  const pushCurrent = () => {
    if (current.name && current.packageFamilyName) {
      packages.push(current);
    }
    current = {};
  };

  for (const rawLine of String(stdout || '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      pushCurrent();
      continue;
    }

    const separator = line.indexOf(':');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'name') {
      current.name = value;
    } else if (key === 'packagefamilyname') {
      current.packageFamilyName = value;
    }
  }

  pushCurrent();
  return packages.filter((item) => PACKAGE_NAME_RE.test(item.name) && PACKAGE_FAMILY_RE.test(item.packageFamilyName));
};

const parsePackageFullNames = (stdout) => String(stdout || '')
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    const firstSeparator = line.indexOf('_');
    const lastSeparator = line.lastIndexOf('_');
    if (firstSeparator <= 0 || lastSeparator <= firstSeparator) {
      return [];
    }

    const name = line.slice(0, firstSeparator);
    const publisherId = line.slice(lastSeparator + 1);
    const packageFamilyName = `${name}_${publisherId}`;
    if (!PACKAGE_NAME_RE.test(name) || !PACKAGE_FAMILY_RE.test(packageFamilyName)) {
      return [];
    }

    return [{ name, packageFamilyName }];
  });

const uniqueInstalledPackages = (packages) => {
  const result = [];
  const seen = new Set();
  for (const item of packages) {
    const key = `${String(item.name || '').toLowerCase()}\n${String(item.packageFamilyName || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

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
const samePackageName = (left, right) => String(left || '').toLowerCase() === String(right || '').toLowerCase();

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
    this.installedPackageCache = null;
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

  async listInstalledPackages() {
    if (!this.supported) {
      return [];
    }
    if (this.installedPackageCache) {
      return this.installedPackageCache;
    }

    const packages = [];
    try {
      const { stdout } = await this.exec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-AppxPackage | Select-Object Name,PackageFamilyName | Format-List'
      ]);
      packages.push(...parseAppxPackages(stdout));
    } catch {
    }

    try {
      const { stdout } = await this.exec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-ChildItem -Path "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Appx\\AppxAllUserStore\\Applications" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PSChildName'
      ]);
      packages.push(...parsePackageFullNames(stdout));
    } catch {
    }

    this.installedPackageCache = uniqueInstalledPackages(packages);
    return this.installedPackageCache;
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
    const installedPackages = await this.listInstalledPackages();
    for (const target of this.loopbackTargets) {
      const installedPackage = installedPackages.find((item) => samePackageName(item.name, target.packageName));
      const fallbackFamilyName = target.required || target.fallbackWhenUnresolved ? target.fallbackFamilyName : null;
      const packageFamilyName = installedPackage?.packageFamilyName
        || await this.resolvePackageFamilyName(target.packageName, fallbackFamilyName);
      if (packageFamilyName) {
        resolvedTargets.push({
          ...target,
          packageFamilyName,
          installed: Boolean(installedPackage),
          required: Boolean(target.required)
        });
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
      installed: target.installed !== false,
      required: Boolean(target.required),
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
  parseAppxPackages,
  parsePackageFullNames,
  parsePackageFamilyNames,
  hasPackageFamilyName,
  samePackageName,
  samePackageFamilyName
};
