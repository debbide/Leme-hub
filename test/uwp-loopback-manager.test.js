import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MICROSOFT_STORE_PACKAGE_FAMILY,
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

test('package parser accepts raw PowerShell package family output', () => {
  assert.deepEqual(
    internals.parsePackageFamilyNames('Microsoft.WindowsStore_8wekyb3d8bbwe\r\n'),
    [MICROSOFT_STORE_PACKAGE_FAMILY]
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
  assert.match(calls[0][6], /Get-AppxPackage Microsoft\.WindowsStore/u);
});

test('add and remove exemptions call CheckNetIsolation with argument arrays', async () => {
  const calls = [];
  const manager = new UwpLoopbackManager({
    platform: 'win32',
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'powershell.exe') {
        return { stdout: `${MICROSOFT_STORE_PACKAGE_FAMILY}\n` };
      }
      if (args.includes('-s')) {
        return { stdout: `Name: ${MICROSOFT_STORE_PACKAGE_FAMILY}` };
      }
      return { stdout: '' };
    }
  });

  await manager.addExemption(MICROSOFT_STORE_PACKAGE_FAMILY);
  await manager.removeExemption(MICROSOFT_STORE_PACKAGE_FAMILY);

  assert.deepEqual(calls[0], ['CheckNetIsolation.exe', 'LoopbackExempt', '-a', `-n=${MICROSOFT_STORE_PACKAGE_FAMILY}`]);
  assert.deepEqual(calls[2], ['CheckNetIsolation.exe', 'LoopbackExempt', '-d', `-n=${MICROSOFT_STORE_PACKAGE_FAMILY}`]);
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
