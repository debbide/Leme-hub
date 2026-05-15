import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MICROSOFT_STORE_PACKAGE_FAMILY,
  MICROSOFT_STORE_LOOPBACK_TARGETS,
  UwpLoopbackManager,
  internals
} from '../app/server/services/UwpLoopbackManager.js';

test('loopback parser extracts package family names from CheckNetIsolation output', () => {
  const output = `
List Loopback Exempted AppContainers

[1] -----------------------------------------------------------------
    Name: Microsoft.WindowsStore_8wekyb3d8bbwe
    SID:  S-1-15-2-2608634532-1453880708
[2] -----------------------------------------------------------------
    Name: Contoso.App_123abc
`;

  assert.deepEqual(internals.parseLoopbackExemptions(output), [
    MICROSOFT_STORE_PACKAGE_FAMILY,
    'Contoso.App_123abc'
  ]);
});

test('loopback parser handles localized lowercase package names', () => {
  const output = `
列出环回免除的 AppContainer

[1] -----------------------------------------------------------------
    名称: microsoft.windowsstore_8wekyb3d8bbwe
    SID:  S-1-15-2-1609473798-1231923017
`;

  assert.deepEqual(internals.parseLoopbackExemptions(output), [
    'microsoft.windowsstore_8wekyb3d8bbwe'
  ]);
  assert.equal(internals.samePackageFamilyName(
    'microsoft.windowsstore_8wekyb3d8bbwe',
    MICROSOFT_STORE_PACKAGE_FAMILY
  ), true);
});

test('package parser accepts raw PowerShell package family output', () => {
  assert.deepEqual(
    internals.parsePackageFamilyNames('Microsoft.WindowsStore_8wekyb3d8bbwe\r\n'),
    [MICROSOFT_STORE_PACKAGE_FAMILY]
  );
});

test('appx package parser reads current-user package list', () => {
  const packages = internals.parseAppxPackages(`
Name              : Microsoft.WindowsStore
PackageFamilyName : Microsoft.WindowsStore_8wekyb3d8bbwe

Name              : Microsoft.StorePurchaseApp
PackageFamilyName : Microsoft.StorePurchaseApp_8wekyb3d8bbwe
`);

  assert.deepEqual(packages, [
    { name: 'Microsoft.WindowsStore', packageFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY },
    { name: 'Microsoft.StorePurchaseApp', packageFamilyName: 'Microsoft.StorePurchaseApp_8wekyb3d8bbwe' }
  ]);
});

test('package full name parser reads AppxAllUserStore application keys', () => {
  const packages = internals.parsePackageFullNames(`
Microsoft.StorePurchaseApp_22508.1401.2.0_neutral_~_8wekyb3d8bbwe
MicrosoftWindows.Client.WebExperience_525.24401.50.0_neutral_~_cw5n1h2txyewy
windows.immersivecontrolpanel_10.0.8.1000_neutral_neutral_cw5n1h2txyewy
`);

  assert.deepEqual(packages, [
    { name: 'Microsoft.StorePurchaseApp', packageFamilyName: 'Microsoft.StorePurchaseApp_8wekyb3d8bbwe' },
    { name: 'MicrosoftWindows.Client.WebExperience', packageFamilyName: 'MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy' },
    { name: 'windows.immersivecontrolpanel', packageFamilyName: 'windows.immersivecontrolpanel_cw5n1h2txyewy' }
  ]);
});

test('default Microsoft Store targets include Store account and host components', () => {
  assert.deepEqual(
    MICROSOFT_STORE_LOOPBACK_TARGETS.map((target) => target.id),
    [
      'windows-store',
      'store-experience-host',
      'microsoft-account',
      'accounts-control',
      'xbox-identity',
      'web-experience',
      'email-and-accounts',
      'shell-experience',
      'win32-webview-host',
      'start-menu-experience',
      'people-experience',
      'cloud-experience',
      'store-engagement'
    ]
  );
});

test('manager resolves Microsoft Store package family through PowerShell', async () => {
  const calls = [];
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: `${MICROSOFT_STORE_PACKAGE_FAMILY}\n` };
    }
  });

  const packageFamilyName = await manager.resolveMicrosoftStorePackageFamilyName();

  assert.equal(packageFamilyName, MICROSOFT_STORE_PACKAGE_FAMILY);
  assert.equal(calls[0][0], 'powershell.exe');
  assert.equal(calls[0][1], '-NoProfile');
  assert.equal(calls[0][5], '-Command');
  assert.match(calls[0][6], /Get-AppxPackage -AllUsers Microsoft\.WindowsStore/u);
});

test('manager resolves Microsoft Store loopback target package family names', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    loopbackTargets: MICROSOFT_STORE_LOOPBACK_TARGETS.slice(0, 10),
    execFile: async (_command, args) => {
      const script = args[args.length - 1];
      if (String(script).includes('Get-AppxPackage | Select-Object')) {
        return {
          stdout: `
Name              : Microsoft.WindowsStore
PackageFamilyName : Microsoft.WindowsStore_8wekyb3d8bbwe

Name              : Microsoft.StorePurchaseApp
PackageFamilyName : Microsoft.StorePurchaseApp_8wekyb3d8bbwe

Name              : Microsoft.AAD.BrokerPlugin
PackageFamilyName : Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy

Name              : Microsoft.AccountsControl
PackageFamilyName : Microsoft.AccountsControl_cw5n1h2txyewy

Name              : Microsoft.Windows.ShellExperienceHost
PackageFamilyName : Microsoft.Windows.ShellExperienceHost_cw5n1h2txyewy

Name              : Microsoft.Win32WebViewHost
PackageFamilyName : Microsoft.Win32WebViewHost_cw5n1h2txyewy

Name              : Microsoft.Windows.StartMenuExperienceHost
PackageFamilyName : Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy
`
        };
      }
      if (String(script).includes('AppxAllUserStore')) {
        return {
          stdout: `
Microsoft.XboxIdentityProvider_12.115.1001.0_neutral_~_8wekyb3d8bbwe
MicrosoftWindows.Client.WebExperience_525.24401.50.0_neutral_~_cw5n1h2txyewy
windows.immersivecontrolpanel_10.0.8.1000_neutral_neutral_cw5n1h2txyewy
`
        };
      }
      if (script.includes('Microsoft.StorePurchaseApp')) {
        return { stdout: 'Microsoft.StorePurchaseApp_8wekyb3d8bbwe\n' };
      }
      if (script.includes('Microsoft.AAD.BrokerPlugin')) {
        return { stdout: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy\n' };
      }
      return { stdout: `${MICROSOFT_STORE_PACKAGE_FAMILY}\n` };
    }
  });

  const targets = await manager.resolveMicrosoftStoreLoopbackTargets();

  assert.deepEqual(targets.map((target) => target.packageFamilyName), [
    MICROSOFT_STORE_PACKAGE_FAMILY,
    'Microsoft.StorePurchaseApp_8wekyb3d8bbwe',
    'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy',
    'Microsoft.AccountsControl_cw5n1h2txyewy',
    'Microsoft.XboxIdentityProvider_8wekyb3d8bbwe',
    'MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy',
    'windows.immersivecontrolpanel_cw5n1h2txyewy',
    'Microsoft.Windows.ShellExperienceHost_cw5n1h2txyewy',
    'Microsoft.Win32WebViewHost_cw5n1h2txyewy',
    'Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy'
  ]);
});

test('manager falls back for core Microsoft Store account packages when package list is unavailable', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    execFile: async (_command, args) => {
      const script = args[args.length - 1] || '';
      if (String(script).includes('Get-AppxPackage | Select-Object')) {
        throw new Error('Access is denied');
      }
      if (String(script).includes('AppxAllUserStore')) {
        return { stdout: '' };
      }
      throw new Error('Access is denied');
    }
  });

  const targets = await manager.resolveMicrosoftStoreLoopbackTargets();

  assert.deepEqual(
    targets.map((target) => target.id),
    [
      'windows-store',
      'store-experience-host',
      'microsoft-account',
      'accounts-control',
      'xbox-identity',
      'web-experience',
      'email-and-accounts',
      'shell-experience',
      'win32-webview-host',
      'start-menu-experience'
    ]
  );
  assert.equal(targets.some((target) => target.id === 'store-engagement'), false);
});

test('add and remove exemptions call CheckNetIsolation with argument arrays', async () => {
  const calls = [];
  let exempted = false;
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'powershell.exe') {
        return { stdout: `${MICROSOFT_STORE_PACKAGE_FAMILY}\n` };
      }
      if (args.includes('-a')) {
        exempted = true;
      }
      if (args.includes('-d')) {
        exempted = false;
      }
      if (args.includes('-s')) {
        return { stdout: exempted ? `Name: ${MICROSOFT_STORE_PACKAGE_FAMILY}` : '' };
      }
      return { stdout: '' };
    }
  });

  await manager.addExemption(MICROSOFT_STORE_PACKAGE_FAMILY);
  await manager.removeExemption(MICROSOFT_STORE_PACKAGE_FAMILY);

  assert.deepEqual(calls[0], ['CheckNetIsolation.exe', 'LoopbackExempt', '-a', `-n=${MICROSOFT_STORE_PACKAGE_FAMILY}`]);
  assert.deepEqual(calls[2], ['CheckNetIsolation.exe', 'LoopbackExempt', '-d', `-n=${MICROSOFT_STORE_PACKAGE_FAMILY}`]);
});

test('status treats CheckNetIsolation package names case-insensitively', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    loopbackTargets: [
      { id: 'store', label: 'Store', packageName: 'Microsoft.WindowsStore', fallbackFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY, required: true }
    ],
    microsoftStorePackageFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY,
    execFile: async (_command, args) => {
      if (args.includes('-s')) {
        return { stdout: '名称: microsoft.windowsstore_8wekyb3d8bbwe' };
      }
      return { stdout: '' };
    }
  });

  const status = await manager.getMicrosoftStoreStatus();

  assert.equal(status.exempted, true);
});

test('store login status requires all configured targets to be exempted', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    loopbackTargets: [
      { id: 'store', label: 'Store', packageName: 'Microsoft.WindowsStore', fallbackFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY },
      { id: 'aad', label: 'AAD', packageName: 'Microsoft.AAD.BrokerPlugin', fallbackFamilyName: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy' }
    ],
    execFile: async (_command, args) => {
      if (args.includes('-s')) {
        return { stdout: '名称: microsoft.windowsstore_8wekyb3d8bbwe' };
      }
      const script = args[args.length - 1] || '';
      if (script.includes('Microsoft.AAD.BrokerPlugin')) {
        return { stdout: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy\n' };
      }
      return { stdout: `${MICROSOFT_STORE_PACKAGE_FAMILY}\n` };
    }
  });

  const status = await manager.getMicrosoftStoreStatus();

  assert.equal(status.exempted, false);
  assert.equal(status.hasAnyExemption, true);
  assert.equal(status.exemptedCount, 1);
  assert.equal(status.totalCount, 2);
});

test('store login repair adds only missing target exemptions', async () => {
  const calls = [];
  let aadExempted = false;
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    loopbackTargets: [
      { id: 'store', label: 'Store', packageName: 'Microsoft.WindowsStore', fallbackFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY },
      { id: 'aad', label: 'AAD', packageName: 'Microsoft.AAD.BrokerPlugin', fallbackFamilyName: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy' }
    ],
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      if (args.includes('-a') && args.includes('-n=Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy')) {
        aadExempted = true;
      }
      if (args.includes('-s')) {
        return {
          stdout: [
            '名称: microsoft.windowsstore_8wekyb3d8bbwe',
            aadExempted ? '名称: microsoft.aad.brokerplugin_cw5n1h2txyewy' : ''
          ].join('\n')
        };
      }
      const script = args[args.length - 1] || '';
      if (script.includes('Microsoft.AAD.BrokerPlugin')) {
        return { stdout: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy\n' };
      }
      return { stdout: `${MICROSOFT_STORE_PACKAGE_FAMILY}\n` };
    }
  });

  const status = await manager.addMicrosoftStoreExemptions();

  assert.equal(status.exempted, true);
  assert.deepEqual(
    calls.filter((call) => call[0] === 'CheckNetIsolation.exe' && call.includes('-a')),
    [['CheckNetIsolation.exe', 'LoopbackExempt', '-a', '-n=Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy']]
  );
});

test('add exemption fails when post-check still reports not exempted', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    microsoftStorePackageFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY,
    execFile: async (_command, args) => {
      if (args.includes('-s')) {
        return { stdout: '' };
      }
      return { stdout: '' };
    }
  });

  await assert.rejects(
    () => manager.addExemption(MICROSOFT_STORE_PACKAGE_FAMILY),
    /复查后仍未放行/u
  );
});

test('manager rejects invalid package family names', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    execFile: async () => ({ stdout: '' })
  });

  await assert.rejects(() => manager.addExemption('Microsoft.WindowsStore & calc'), /Invalid package family name/u);
});

test('manager reports permission failures with a user-facing message', async () => {
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    microsoftStorePackageFamilyName: MICROSOFT_STORE_PACKAGE_FAMILY,
    execFile: async () => {
      throw new Error('Access is denied');
    }
  });

  await assert.rejects(
    () => manager.addExemption(MICROSOFT_STORE_PACKAGE_FAMILY),
    /管理员权限/u
  );
});
