import fs from 'fs';
import { pipeline } from 'stream/promises';

import axios from 'axios';

const RULESET_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const RULESET_USER_AGENT = 'Leme-Hub/0.1';
const RULESET_SOURCES = [
  {
    id: 'geosite-cn',
    url: 'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs',
    targetPathKey: 'geositeCnPath'
  },
  {
    id: 'geoip-cn',
    url: 'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-cn.srs',
    targetPathKey: 'geoipCnPath'
  }
];

export class RulesetDatabaseService {
  constructor(paths, options = {}) {
    this.paths = paths;
    this.log = options.log || console;
    this.downloadPromise = null;
    this.state = {
      ready: false,
      pending: false,
      lastError: null,
      downloadedAt: null,
      source: null,
      files: {}
    };
  }

  async initialize() {
    this.loadLocalState();
  }

  getStatus() {
    return { ...this.state, files: { ...this.state.files } };
  }

  isStale() {
    if (!this.state.downloadedAt) return true;
    return (Date.now() - new Date(this.state.downloadedAt).getTime()) > RULESET_REFRESH_MS;
  }

  async refreshNow() {
    if (!this.downloadPromise) {
      this.downloadPromise = this.refreshDatabase().finally(() => {
        this.downloadPromise = null;
      });
    }
    return this.downloadPromise;
  }

  loadLocalState() {
    const files = Object.fromEntries(RULESET_SOURCES.map((source) => {
      const filePath = this.paths[source.targetPathKey];
      return [source.id, { exists: fs.existsSync(filePath), path: filePath }];
    }));

    this.state.files = files;
    this.state.ready = Object.values(files).every((file) => file.exists);

    try {
      const meta = JSON.parse(fs.readFileSync(this.paths.rulesetMetaPath, 'utf8'));
      this.state.downloadedAt = meta.downloadedAt || null;
      this.state.source = meta.source || null;
    } catch {
      this.state.downloadedAt = null;
      this.state.source = null;
    }
  }

  async refreshDatabase() {
    this.state.pending = true;
    this.state.lastError = null;

    try {
      fs.mkdirSync(this.paths.rulesDir, { recursive: true });

      for (const source of RULESET_SOURCES) {
        const targetPath = this.paths[source.targetPathKey];
        const tmpPath = `${targetPath}.tmp`;
        const response = await axios.get(source.url, {
          responseType: 'stream',
          headers: {
            'User-Agent': RULESET_USER_AGENT,
            Accept: 'application/octet-stream'
          },
          timeout: 30000
        });

        await pipeline(response.data, fs.createWriteStream(tmpPath));
        fs.renameSync(tmpPath, targetPath);
      }

      fs.writeFileSync(this.paths.rulesetMetaPath, JSON.stringify({
        downloadedAt: new Date().toISOString(),
        source: 'jsdelivr'
      }, null, 2));

      this.loadLocalState();
    } catch (error) {
      this.state.lastError = error.message;
      this.log.warn?.(`[RulesetDatabaseService] Ruleset refresh failed: ${error.message}`);
    } finally {
      this.state.pending = false;
      RULESET_SOURCES.forEach((source) => {
        const tmpPath = `${this.paths[source.targetPathKey]}.tmp`;
        if (fs.existsSync(tmpPath)) {
          fs.rmSync(tmpPath, { force: true });
        }
      });
      this.loadLocalState();
    }
  }
}
