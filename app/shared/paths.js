import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_LOG_FILE,
  DEFAULT_NODES_FILE,
  DEFAULT_SETTINGS_FILE
} from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, '..', '..');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export function resolveProjectPaths(projectRoot = defaultProjectRoot) {
  const root = path.resolve(projectRoot);
  const appRoot = path.join(root, 'app');
  const publicDir = path.join(root, 'public');
  const dataDir = path.join(root, 'data');
  const logsDir = path.join(root, 'logs');
  const binDir = path.join(root, 'bin');

  [appRoot, publicDir, dataDir, logsDir, binDir].forEach(ensureDir);

  return {
    root,
    appRoot,
    publicDir,
    dataDir,
    logsDir,
    binDir,
    configPath: path.join(dataDir, DEFAULT_CONFIG_FILE),
    nodesPath: path.join(dataDir, DEFAULT_NODES_FILE),
    settingsPath: path.join(dataDir, DEFAULT_SETTINGS_FILE),
    logPath: path.join(logsDir, DEFAULT_LOG_FILE)
  };
}

export function ensureRuntimeDirs(paths) {
  [paths.dataDir, paths.logsDir, paths.publicDir, paths.binDir].forEach(ensureDir);
}
