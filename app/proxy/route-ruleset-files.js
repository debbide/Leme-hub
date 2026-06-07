import fs from 'fs';
import path from 'path';

import { REMOTE_RULESET_CATALOG } from '../shared/constants.js';

export const resolveExistingFilePath = (candidatePath) => {
  const resolved = path.resolve(candidatePath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  if (process.platform !== 'win32') {
    return null;
  }

  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    return null;
  }

  const targetName = path.basename(resolved).toLowerCase();
  try {
    const match = fs.readdirSync(parentDir).find((entry) => String(entry || '').toLowerCase() === targetName);
    return match ? path.join(parentDir, match) : null;
  } catch {
    return null;
  }
};

export const buildLocalDatabaseRuleSets = (rulesDir, catalog = REMOTE_RULESET_CATALOG) => (
  Object.fromEntries(catalog.map((ruleset) => {
    const expectedPath = path.join(rulesDir, `${ruleset.tag}.${ruleset.format === 'source' ? 'json' : 'srs'}`);
    return [ruleset.tag, resolveExistingFilePath(expectedPath) || expectedPath];
  }))
);

export const buildLocalRuleSetConfig = (localDatabaseRuleSets, catalog = REMOTE_RULESET_CATALOG) => (
  Object.entries(localDatabaseRuleSets)
    .map(([tag, filePath]) => [tag, resolveExistingFilePath(filePath)])
    .filter(([, filePath]) => Boolean(filePath))
    .map(([tag, filePath]) => ({
      type: 'local',
      tag,
      format: catalog.find((ruleset) => ruleset.tag === tag)?.format || 'binary',
      path: filePath
    }))
);
