import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { GeoIpService, geoFlagFromCountryCode } from '../app/server/services/GeoIpService.js';

const createPaths = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-geoip-'));
  const geoDir = path.join(root, 'geo');
  fs.mkdirSync(geoDir, { recursive: true });
  return {
    root,
    geoDir,
    geoIpDbPath: path.join(geoDir, 'GeoLite2-Country.mmdb'),
    geoIpArchivePath: path.join(geoDir, 'GeoLite2-Country.mmdb.gz'),
    geoIpMetaPath: path.join(geoDir, 'geoip-meta.json')
  };
};

test('geoFlagFromCountryCode converts ISO code to emoji', () => {
  assert.equal(geoFlagFromCountryCode('us'), '🇺🇸');
  assert.equal(geoFlagFromCountryCode('JP'), '🇯🇵');
  assert.equal(geoFlagFromCountryCode(''), null);
});

test('GeoIpService degrades gracefully without local database', async () => {
  const service = new GeoIpService(createPaths(), { log: { warn() {} } });
  service.scheduleRefresh = () => Promise.resolve();

  await service.initialize();
  const enriched = await service.enrichNode({ id: 'n1', server: '8.8.8.8' });

  assert.equal(service.getStatus().ready, false);
  assert.equal(enriched.countryCode, null);
  assert.equal(enriched.flagEmoji, null);
});

test('GeoIpService returns cached country data for resolvable hosts', async () => {
  const service = new GeoIpService(createPaths(), { log: { warn() {} } });
  service.reader = {
    country: () => ({
      country: {
        isoCode: 'US',
        names: { en: 'United States' }
      }
    })
  };
  service.state.ready = true;
  service.resolveHostname = async () => '8.8.8.8';

  const enriched = await service.enrichNode({ id: 'n1', server: 'dns.google' });

  assert.equal(enriched.countryCode, 'US');
  assert.equal(enriched.countryName, 'United States');
  assert.equal(enriched.flagEmoji, '🇺🇸');
});

test('GeoIpService loads persisted host/country caches on startup', async () => {
  const paths = createPaths();
  fs.writeFileSync(
    path.join(paths.geoDir, 'geoip-host-cache.json'),
    JSON.stringify({
      hosts: { 'cached.example': '9.9.9.9' },
      lookups: { 'cached.example': { countryCode: 'DE', countryName: 'Germany', flagEmoji: '🇩🇪' } }
    })
  );
  const service = new GeoIpService(paths, { log: { warn() {} } });

  assert.equal(service.hostCache.get('cached.example'), '9.9.9.9');
  // Enrichment is served from the persisted cache even without a DB reader.
  assert.equal(service.reader, null);
  const enriched = await service.enrichNode({ id: 'n1', server: 'cached.example' });
  assert.equal(enriched.countryCode, 'DE');
  assert.equal(enriched.flagEmoji, '🇩🇪');
});

test('GeoIpService persists newly resolved hosts to disk', async () => {
  const paths = createPaths();
  const service = new GeoIpService(paths, { log: { warn() {} } });
  service.reader = {
    country: () => ({ country: { isoCode: 'JP', names: { en: 'Japan' } } })
  };
  service.resolveHostname = async (hostname) => {
    service.hostCache.set(hostname, '1.1.1.1');
    return '1.1.1.1';
  };

  await service.enrichNode({ id: 'n1', server: 'fresh.example' });
  service.persistHostCache();

  const persisted = JSON.parse(
    fs.readFileSync(path.join(paths.geoDir, 'geoip-host-cache.json'), 'utf8')
  );
  assert.equal(persisted.hosts['fresh.example'], '1.1.1.1');
  assert.equal(persisted.lookups['fresh.example'].countryCode, 'JP');
});

test('GeoIpService survives a corrupt host cache file', () => {
  const paths = createPaths();
  fs.writeFileSync(path.join(paths.geoDir, 'geoip-host-cache.json'), 'not-json{{{');
  const service = new GeoIpService(paths, { log: { warn() {} } });
  assert.equal(service.hostCache.size, 0);
  assert.equal(service.lookupCache.size, 0);
});

test('GeoIpService bounds a hanging DNS lookup with a timeout', async () => {
  const service = new GeoIpService(createPaths(), {
    log: { warn() {} },
    dnsLookupTimeoutMs: 50,
    // Simulate a blackholed hostname: the OS resolver never answers.
    dnsLookup: () => new Promise(() => {})
  });
  const started = Date.now();
  const address = await service.resolveHostname('blackhole.example');
  assert.equal(address, null);
  assert.ok(Date.now() - started < 5000, 'DNS lookup was not bounded by the timeout');
  assert.ok(!service.hostCache.has('blackhole.example'), 'failed lookup must not be cached');
});
