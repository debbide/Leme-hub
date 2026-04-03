import fs from 'fs';
import path from 'path';

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_LOG_FILE,
  DEFAULT_NODES_FILE,
  DEFAULT_SETTINGS_FILE,
  REMOTE_RULESET_CATALOG
} from './constants.js';

const defaultProjectRoot = path.resolve(process.cwd());
const isPackagedBinary = Boolean(process.pkg);

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export function resolveProjectPaths(projectRoot = defaultProjectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const runtimeRoot = path.resolve(options.runtimeRoot || root);
  const appRoot = path.join(root, 'app');
  const publicDir = isPackagedBinary
    ? path.join(__dirname, 'public')
    : path.join(root, 'public');
  const dataDir = path.join(runtimeRoot, 'data');
  const logsDir = path.join(runtimeRoot, 'logs');
  const binDir = path.join(runtimeRoot, 'bin');
  const geoDir = path.join(runtimeRoot, 'geo');

  [dataDir, logsDir, binDir, geoDir].forEach(ensureDir);

  const rulesDir = path.join(dataDir, 'rules');
  const remoteRulesetPaths = Object.fromEntries(REMOTE_RULESET_CATALOG.map((ruleset) => [
    ruleset.id,
    path.join(rulesDir, `${ruleset.tag}.${ruleset.format === 'source' ? 'json' : 'srs'}`)
  ]));

  return {
    root,
    runtimeRoot,
    appRoot,
    publicDir,
    dataDir,
    logsDir,
    binDir,
    geoDir,
    configPath: path.join(dataDir, DEFAULT_CONFIG_FILE),
    nodesPath: path.join(dataDir, DEFAULT_NODES_FILE),
    settingsPath: path.join(dataDir, DEFAULT_SETTINGS_FILE),
    logPath: path.join(logsDir, DEFAULT_LOG_FILE),
    geoIpDbPath: path.join(geoDir, 'GeoLite2-Country.mmdb'),
    geoIpArchivePath: path.join(geoDir, 'GeoLite2-Country.mmdb.gz'),
    geoIpMetaPath: path.join(geoDir, 'geoip-meta.json'),
    rulesDir,
    geositeCnPath: remoteRulesetPaths['geosite-cn'],
    geoipCnPath: remoteRulesetPaths['geoip-cn'],
    rulesetMetaPath: path.join(rulesDir, 'ruleset-meta.json'),
    remoteRulesetPaths
  };
}

export function resolveDefaultRuntimeRoot(projectRoot = defaultProjectRoot, env = process.env) {
  if (env.LEME_RUNTIME_ROOT) {
    return path.resolve(env.LEME_RUNTIME_ROOT);
  }

  if (isPackagedBinary) {
    return path.dirname(process.execPath);
  }

  return path.resolve(projectRoot);
}

export function ensureRuntimeDirs(paths) {
  [paths.dataDir, paths.logsDir, paths.binDir, paths.geoDir].forEach(ensureDir);
}
