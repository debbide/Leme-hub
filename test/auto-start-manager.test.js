import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { AutoStartManager } from '../app/server/services/AutoStartManager.js';

test('windows auto start writes and removes run entry', async () => {
  const calls = [];
  let enabled = false;
  const manager = new AutoStartManager({
    platform: 'win32',
    env: { LEME_AUTOSTART_EXECUTABLE: 'C:\\Leme Hub\\Leme.Hub.exe' },
    execFile: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === 'add') {
        enabled = true;
        return { stdout: '' };
      }
      if (args[0] === 'delete') {
        if (args[1] === 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run') {
          return { stdout: '' };
        }
        enabled = false;
        return { stdout: '' };
      }
      if (args[0] === 'query') {
        if (args[1] === 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run') {
          throw new Error('missing');
        }
        if (!enabled) {
          throw new Error('missing');
        }
        return { stdout: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    Leme Hub    REG_SZ    "C:\\Leme Hub\\Leme.Hub.exe" --background\r\n' };
      }
      return { stdout: '' };
    }
  });

  const enabledStatus = await manager.enable();
  const disabledStatus = await manager.disable();

  assert.equal(enabledStatus.enabled, true);
  assert.equal(disabledStatus.enabled, false);
  assert.equal(calls[0][1][0], 'add');
  assert.equal(calls[0][1].includes('"C:\\Leme Hub\\Leme.Hub.exe" --background'), true);
  assert.equal(calls[1][1][0], 'delete');
  assert.equal(calls[1][1][1], 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run');
  assert.equal(calls[2][1][0], 'query');
  assert.equal(calls[3][1][0], 'query');
  assert.equal(calls[4][1][0], 'delete');
  assert.equal(enabledStatus.command, '"C:\\Leme Hub\\Leme.Hub.exe" --background');
  assert.equal(manager.matchesExpectedCommand(enabledStatus.command), true);
  assert.equal(enabledStatus.disabledBySystem, false);
});

test('windows auto start detects stale executable command', async () => {
  const manager = new AutoStartManager({
    platform: 'win32',
    env: { LEME_AUTOSTART_EXECUTABLE: 'E:\\Program Files (x86)\\lemehub\\Leme.Hub-2.2.3-win-x64.exe' }
  });

  assert.equal(
    manager.matchesExpectedCommand('"E:\\Program Files (x86)\\lemehub\\Leme.Hub-2.1.1-win-x64.exe"'),
    false
  );
  assert.equal(
    manager.matchesExpectedCommand('"E:\\Program Files (x86)\\lemehub\\Leme.Hub-2.2.3-win-x64.exe" --background'),
    true
  );
});

test('windows auto start prefers the explicit reg.exe path when SystemRoot is available', () => {
  const manager = new AutoStartManager({
    platform: 'win32',
    env: {
      LEME_AUTOSTART_EXECUTABLE: 'E:\\Program Files (x86)\\lemehub\\Leme Hub.exe',
      SystemRoot: 'C:\\Windows'
    }
  });

  assert.equal(manager.resolveWindowsCommand('reg'), 'C:\\Windows\\System32\\reg.exe');
  assert.equal(manager.resolveWindowsCommand('cmd'), 'cmd');
});

test('windows auto start reports disabled startup approval entries as not enabled', async () => {
  const manager = new AutoStartManager({
    platform: 'win32',
    env: { LEME_AUTOSTART_EXECUTABLE: 'C:\\Leme Hub\\Leme.Hub.exe' },
    execFile: async (_command, args) => {
      if (args[0] !== 'query') {
        return { stdout: '' };
      }
      if (args[1] === 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run') {
        return { stdout: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run\r\n    Leme Hub    REG_BINARY    03 00 00 00 00 00 00 00 00 00 00 00\r\n' };
      }
      return { stdout: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    Leme Hub    REG_SZ    "C:\\Leme Hub\\Leme.Hub.exe" --background\r\n' };
    }
  });

  const status = await manager.getStatus();

  assert.equal(status.enabled, false);
  assert.equal(status.disabledBySystem, true);
  assert.equal(status.startupApproved, 'disabled');
});

test('linux auto start writes xdg desktop file', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-autostart-'));
  const manager = new AutoStartManager({
    platform: 'linux',
    homeDir,
    env: { LEME_AUTOSTART_EXECUTABLE: '/opt/Leme Hub/Leme Hub' }
  });

  const enabled = await manager.enable();
  const desktopFile = path.join(homeDir, '.config', 'autostart', 'leme-hub.desktop');
  const desktopEntry = fs.readFileSync(desktopFile, 'utf8');
  assert.equal(fs.existsSync(desktopFile), true);
  const disabled = await manager.disable();

  assert.equal(enabled.enabled, true);
  assert.equal(desktopEntry.includes('Exec="/opt/Leme Hub/Leme Hub" --background'), true);
  assert.equal(fs.existsSync(desktopFile), false);
  assert.equal(disabled.enabled, false);
});
