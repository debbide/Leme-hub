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
