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
// Host -> IP / host -> country caches are persisted to disk so a restart
// does not re-resolve every node hostname (DNS for foreign hosts can take
// seconds each behind the GFW, and /api/nodes waits for all of them).
const GEOIP_HOST_CACHE_FILE = 'geoip-host-cache.json';
const GEOIP_HOST_CACHE_MAX_ENTRIES = 2000;
const GEOIP_HOST_CACHE_SAVE_DEBOUNCE_MS = 1500;
// A single poisoned/slow hostname must not hold the whole node list hostage:
// /api/nodes awaits Promise.all(enrichNodes), so bound every lookup.
const DNS_LOOKUP_TIMEOUT_MS = 5000;
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

// dns.lookup has no built-in timeout: a poisoned or blackholed hostname can
// hang for tens of seconds on the OS resolver's retries. Bound it so one bad
// node never stalls the whole node list.
const lookupWithTimeout = (lookupFn, timeoutMs) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), timeoutMs);
  timer.unref?.();
  Promise.resolve()
    .then(lookupFn)
    .then(
      (result) => {
        clearTimeout(timer);
        resolve(result?.address || null);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
});

export class GeoIpService {
  constructor(paths, options = {}) {
    this.paths = paths;
    this.log = options.log || console;
    this.reader = null;
    this.downloadPromise = null;
    this.hostCache = new Map();
    this.lookupCache = new Map();
    this._hostCacheSaveTimer = null;
    this.dnsLookupTimeoutMs = Number(options.dnsLookupTimeoutMs) > 0
      ? Number(options.dnsLookupTimeoutMs)
      : DNS_LOOKUP_TIMEOUT_MS;
    // Injectable for tests; defaults to the OS resolver.
    this._dnsLookup = options.dnsLookup || ((hostname) => dns.lookup(hostname, { family: 0 }));
    this.state = {
      ready: false,
      pending: false,
      lastError: null,
      downloadedAt: null,
      source: null
    };
    this.loadHostCache();
  }

  getHostCachePath() {
    const geoDir = this.paths?.geoDir;
    if (!geoDir) {
      return null;
    }
    return path.join(geoDir, GEOIP_HOST_CACHE_FILE);
  }

  loadHostCache() {
    const cachePath = this.getHostCachePath();
    if (!cachePath) {
      return;
    }
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch {
      return;
    }
    try {
      const hosts = raw?.hosts;
      if (hosts && typeof hosts === 'object') {
        for (const [hostname, ip] of Object.entries(hosts).slice(-GEOIP_HOST_CACHE_MAX_ENTRIES)) {
          if (typeof hostname === 'string' && typeof ip === 'string') {
            this.hostCache.set(hostname, ip);
          }
        }
      }
      const lookups = raw?.lookups;
      if (lookups && typeof lookups === 'object') {
        for (const [host, result] of Object.entries(lookups).slice(-GEOIP_HOST_CACHE_MAX_ENTRIES)) {
          if (typeof host === 'string' && result && typeof result === 'object' && typeof result.countryCode === 'string') {
            this.lookupCache.set(host, {
              countryCode: result.countryCode,
              countryName: typeof result.countryName === 'string' ? result.countryName : null,
              flagEmoji: typeof result.flagEmoji === 'string' ? result.flagEmoji : null
            });
          }
        }
      }
    } catch {
      // Corrupt cache: fall back to cold in-memory caches.
      this.hostCache.clear();
      this.lookupCache.clear();
    }
  }

  schedulePersistHostCache() {
    const cachePath = this.getHostCachePath();
    if (!cachePath) {
      return;
    }
    if (this._hostCacheSaveTimer) {
      clearTimeout(this._hostCacheSaveTimer);
    }
    this._hostCacheSaveTimer = setTimeout(() => {
      this._hostCacheSaveTimer = null;
      this.persistHostCache();
    }, GEOIP_HOST_CACHE_SAVE_DEBOUNCE_MS);
    // Never hold the process open for a cache flush (matters on app quit).
    this._hostCacheSaveTimer.unref?.();
  }

  persistHostCache() {
    const cachePath = this.getHostCachePath();
    if (!cachePath) {
      return;
    }
    try {
      const hosts = Object.fromEntries([...this.hostCache.entries()].slice(-GEOIP_HOST_CACHE_MAX_ENTRIES));
      const lookups = Object.fromEntries([...this.lookupCache.entries()].slice(-GEOIP_HOST_CACHE_MAX_ENTRIES));
      const tmpPath = `${cachePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify({ hosts, lookups }));
      fs.renameSync(tmpPath, cachePath);
    } catch (error) {
      this.log.warn?.(`[GeoIpService] Failed to persist host cache: ${error.message}`);
    }
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
      this.schedulePersistHostCache();
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
      const address = await lookupWithTimeout(() => this._dnsLookup(hostname), this.dnsLookupTimeoutMs);
      if (address) {
        this.hostCache.set(hostname, address);
        this.schedulePersistHostCache();
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
