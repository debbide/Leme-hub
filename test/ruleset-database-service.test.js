import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import axios from 'axios';

import { RulesetDatabaseService } from '../app/server/services/RulesetDatabaseService.js';

const createPaths = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-ruleset-db-'));
  const rulesDir = path.join(root, 'data', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  return {
    rulesDir,
    geositeCnPath: path.join(rulesDir, 'geosite-cn.srs'),
    geoipCnPath: path.join(rulesDir, 'geoip-cn.srs'),
    rulesetMetaPath: path.join(rulesDir, 'ruleset-meta.json')
  };
};

test.afterEach(() => {
  delete axios.get;
});

test('RulesetDatabaseService reports missing local rules gracefully', async () => {
  const service = new RulesetDatabaseService(createPaths(), { log: { warn() {} } });
  await service.initialize();

  const status = service.getStatus();
  assert.equal(status.ready, false);
  assert.equal(status.files['geosite-cn'].exists, false);
});

test('RulesetDatabaseService downloads both ruleset files', async () => {
  const paths = createPaths();
  const service = new RulesetDatabaseService(paths, { log: { warn() {} } });
  let call = 0;
  axios.get = async () => ({
    data: fs.createReadStream((() => {
      const tmp = path.join(paths.rulesDir, `source-${call++}.srs`);
      fs.writeFileSync(tmp, 'stub');
      return tmp;
    })())
  });

  await service.refreshNow();
  const status = service.getStatus();

  assert.equal(fs.existsSync(paths.geositeCnPath), true);
  assert.equal(fs.existsSync(paths.geoipCnPath), true);
  assert.equal(status.ready, true);
});
