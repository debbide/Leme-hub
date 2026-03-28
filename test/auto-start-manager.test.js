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
        enabled = false;
        return { stdout: '' };
      }
      if (args[0] === 'query') {
        if (!enabled) {
          throw new Error('missing');
        }
        return { stdout: 'Leme Hub    REG_SZ    "C:\\Leme Hub\\Leme.Hub.exe"' };
      }
      return { stdout: '' };
    }
  });

  const enabledStatus = await manager.enable();
  const disabledStatus = await manager.disable();

  assert.equal(enabledStatus.enabled, true);
  assert.equal(disabledStatus.enabled, false);
  assert.equal(calls[0][1][0], 'add');
  assert.equal(calls[1][1][0], 'query');
  assert.equal(calls[2][1][0], 'delete');
});

test('linux auto start writes xdg desktop file', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-autostart-'));
  const manager = new AutoStartManager({
    platform: 'linux',
    homeDir,
    env: { LEME_AUTOSTART_EXECUTABLE: '/opt/leme-hub/Leme-Hub' }
  });

  const enabled = await manager.enable();
  const desktopFile = path.join(homeDir, '.config', 'autostart', 'leme-hub.desktop');
  assert.equal(fs.existsSync(desktopFile), true);
  const disabled = await manager.disable();

  assert.equal(enabled.enabled, true);
  assert.equal(fs.existsSync(desktopFile), false);
  assert.equal(disabled.enabled, false);
});
