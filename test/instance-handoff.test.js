import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSecondInstanceRelaunchArgs,
  resolveSecondInstanceExecutablePath,
  shouldHandoffToNewExecutable
} from '../desktop/instance-handoff.js';

test('prefers second-instance additionalData exec path when available', () => {
  const target = 'E:\\apps\\Leme Hub\\Leme Hub.exe';
  const result = resolveSecondInstanceExecutablePath({
    argv: ['C:\\old\\Leme Hub.exe'],
    additionalData: { execPath: target },
    fsImpl: { existsSync: (candidate) => candidate === target }
  });

  assert.equal(result, target);
});

test('falls back to argv[0] when additionalData is unavailable', () => {
  const target = 'E:\\apps\\Leme Hub\\Leme Hub.exe';
  const result = resolveSecondInstanceExecutablePath({
    argv: [target],
    additionalData: null,
    fsImpl: { existsSync: (candidate) => candidate === target }
  });

  assert.equal(result, target);
});

test('detects different executables on windows case-insensitively', () => {
  assert.equal(
    shouldHandoffToNewExecutable('E:\\Old\\Leme Hub.exe', 'E:\\New\\Leme Hub.exe', 'win32'),
    true
  );
  assert.equal(
    shouldHandoffToNewExecutable('E:\\Apps\\Leme Hub.exe', 'e:\\apps\\leme hub.exe', 'win32'),
    false
  );
});

test('only preserves the background launch arg for relaunch', () => {
  assert.deepEqual(buildSecondInstanceRelaunchArgs(['Leme Hub.exe', '--background', '--original-process-start-time=1']), ['--background']);
  assert.deepEqual(buildSecondInstanceRelaunchArgs(['Leme Hub.exe']), []);
});
