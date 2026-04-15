import fs from 'fs';
import path from 'path';

const normalizeCandidatePath = (value, workingDirectory = '') => {
  const trimmed = String(value || '').trim().replace(/^"(.*)"$/u, '$1');
  if (!trimmed) {
    return null;
  }

  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }

  if (workingDirectory) {
    return path.resolve(workingDirectory, trimmed);
  }

  return path.resolve(trimmed);
};

export function resolveSecondInstanceExecutablePath({
  argv = [],
  workingDirectory = '',
  additionalData = null,
  fsImpl = fs
} = {}) {
  const preferred = additionalData && typeof additionalData === 'object'
    ? additionalData.execPath
    : '';
  const candidates = [preferred, Array.isArray(argv) ? argv[0] : ''];

  for (const candidate of candidates) {
    const resolved = normalizeCandidatePath(candidate, workingDirectory);
    if (!resolved) {
      continue;
    }

    try {
      if (fsImpl.existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // Ignore fs lookup failures and continue to the next candidate.
    }
  }

  return null;
}

export function shouldHandoffToNewExecutable(currentExecPath, nextExecPath, platform = process.platform) {
  const current = normalizeCandidatePath(currentExecPath);
  const next = normalizeCandidatePath(nextExecPath);
  if (!current || !next) {
    return false;
  }

  if (platform === 'win32') {
    return current.toLowerCase() !== next.toLowerCase();
  }

  return current !== next;
}

export function buildSecondInstanceRelaunchArgs(argv = []) {
  return Array.isArray(argv) && argv.includes('--background')
    ? ['--background']
    : [];
}
