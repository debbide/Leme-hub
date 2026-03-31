import dns from 'dns/promises';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';

import axios from 'axios';
import { Reader } from '@maxmind/geoip2-node';

const GEOIP_DOWNLOAD_URL = 'https://cdn.jsdelivr.net/npm/geolite2-country/GeoLite2-Country.mmdb.gz';
const GEOIP_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const GEOIP_USER_AGENT = 'Leme-Hub/0.1';
const PRIVATE_PATTERNS = [
  /^10\./u,
  /^127\./u,
  /^192\.168\./u,
  /^172\.(1[6-9]|2\d|3[0-1])\./u,
  /^169\.254\./u,
  /^::1$/u,
  /^fc/u,
  /^fd/u,
  /^fe80:/u
];

const isIpAddress = (value) => Boolean(value) && (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value) || value.includes(':'));

const isPrivateAddress = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost') return true;
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const toFlagEmoji = (countryCode) => {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) {
    return null;
  }

  return String.fromCodePoint(...[...normalized].map((char) => 0x1F1E6 + char.charCodeAt(0) - 65));
};

export class GeoIpService {
  constructor(paths, options = {}) {
    this.paths = paths;
    this.log = options.log || console;
    this.reader = null;
    this.downloadPromise = null;
    this.hostCache = new Map();
    this.lookupCache = new Map();
    this.state = {
      ready: false,
      pending: false,
      lastError: null,
      downloadedAt: null,
      source: null
    };
  }

  async initialize() {
    await this.loadLocalDatabase();
    if (!this.state.ready || this.isDatabaseStale()) {
      this.scheduleRefresh();
    }
  }

  getStatus() {
    return { ...this.state };
  }

  async enrichNodes(nodes) {
    return Promise.all(nodes.map((node) => this.enrichNode(node)));
  }

  async enrichNode(node) {
    const host = String(node?.server || '').trim();
    if (!host || isPrivateAddress(host)) {
      return {
        ...node,
        countryCode: null,
        countryName: null,
        flagEmoji: null
      };
    }

    const lookup = await this.lookupHost(host);
    return {
      ...node,
      countryCode: lookup?.countryCode || null,
      countryName: lookup?.countryName || null,
      flagEmoji: lookup?.flagEmoji || null
    };
  }

  async lookupHost(host) {
    const cacheKey = String(host || '').trim().toLowerCase();
    if (!cacheKey || isPrivateAddress(cacheKey)) {
      return null;
    }

    if (this.lookupCache.has(cacheKey)) {
      return this.lookupCache.get(cacheKey);
    }

    if (!this.reader) {
      return null;
    }

    let ipAddress = cacheKey;
    if (!isIpAddress(cacheKey)) {
      ipAddress = await this.resolveHostname(cacheKey);
      if (!ipAddress) {
        return null;
      }
    }

    const result = this.lookupIp(ipAddress);
    if (result) {
      this.lookupCache.set(cacheKey, result);
    }
    return result;
  }

  lookupIp(ipAddress) {
    if (!this.reader || !ipAddress || isPrivateAddress(ipAddress)) {
      return null;
    }

    try {
      const response = this.reader.country(ipAddress);
      const countryCode = response.country?.isoCode || response.registeredCountry?.isoCode || null;
      const countryName = response.country?.names?.en || response.registeredCountry?.names?.en || null;
      if (!countryCode) {
        return null;
      }

      return {
        countryCode,
        countryName,
        flagEmoji: toFlagEmoji(countryCode)
      };
    } catch (error) {
      this.log.warn?.(`[GeoIpService] Lookup failed for ${ipAddress}: ${error.message}`);
      return null;
    }
  }

  async resolveHostname(hostname) {
    if (this.hostCache.has(hostname)) {
      return this.hostCache.get(hostname);
    }

    try {
      const result = await dns.lookup(hostname, { family: 0 });
      const address = result?.address || null;
      if (address) {
        this.hostCache.set(hostname, address);
      }
      return address;
    } catch {
      return null;
    }
  }

  isDatabaseStale() {
    if (!this.state.downloadedAt) {
      return true;
    }

    return (Date.now() - new Date(this.state.downloadedAt).getTime()) > GEOIP_REFRESH_MS;
  }

  scheduleRefresh() {
    if (!this.downloadPromise) {
      this.downloadPromise = this.refreshDatabase().finally(() => {
        this.downloadPromise = null;
      });
    }
    return this.downloadPromise;
  }

  async refreshNow() {
    return this.scheduleRefresh();
  }

  async refreshDatabase() {
    this.state.pending = true;
    this.state.lastError = null;

    const tmpArchivePath = `${this.paths.geoIpArchivePath}.tmp`;
    const tmpDbPath = `${this.paths.geoIpDbPath}.tmp`;

    try {
      const response = await axios.get(GEOIP_DOWNLOAD_URL, {
        responseType: 'stream',
        headers: {
          'User-Agent': GEOIP_USER_AGENT,
          Accept: 'application/octet-stream'
        },
        timeout: 30000
      });
      await pipeline(response.data, fs.createWriteStream(tmpArchivePath));

      await pipeline(
        fs.createReadStream(tmpArchivePath),
        zlib.createGunzip(),
        fs.createWriteStream(tmpDbPath)
      );

      fs.renameSync(tmpDbPath, this.paths.geoIpDbPath);
      this.writeMeta({ downloadedAt: new Date().toISOString(), source: GEOIP_DOWNLOAD_URL });
      await this.loadLocalDatabase();
    } catch (error) {
      this.state.lastError = error.message;
      this.log.warn?.(`[GeoIpService] GeoIP refresh failed: ${error.message}`);
    } finally {
      this.state.pending = false;
      [tmpArchivePath, tmpDbPath].forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
      });
    }
  }

  async loadLocalDatabase() {
    if (!fs.existsSync(this.paths.geoIpDbPath)) {
      this.reader = null;
      this.state.ready = false;
      return;
    }

    try {
      this.reader = await Reader.open(this.paths.geoIpDbPath);
      const meta = this.readMeta();
      this.state.ready = true;
      this.state.downloadedAt = meta.downloadedAt || new Date(fs.statSync(this.paths.geoIpDbPath).mtimeMs).toISOString();
      this.state.source = meta.source || 'local-cache';
      this.state.lastError = null;
      this.lookupCache.clear();
    } catch (error) {
      this.reader = null;
      this.state.ready = false;
      this.state.lastError = error.message;
      this.log.warn?.(`[GeoIpService] Failed to load GeoIP database: ${error.message}`);
    }
  }

  readMeta() {
    try {
      return JSON.parse(fs.readFileSync(this.paths.geoIpMetaPath, 'utf8'));
    } catch {
      return {};
    }
  }

  writeMeta(meta) {
    fs.writeFileSync(this.paths.geoIpMetaPath, JSON.stringify(meta, null, 2));
  }
}

export const geoFlagFromCountryCode = toFlagEmoji;
