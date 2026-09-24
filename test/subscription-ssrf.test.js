import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import axios from 'axios';

import {
  assertPublicSubscriptionUrl,
  fetchSubscriptionWithSafeRedirects,
  isPublicIpAddress
} from '../app/proxy/subscriptions.js';

// Mirrors dns.promises.lookup(host, {all:true}): IP literals resolve to
// themselves, names resolve to a public address in tests.
const publicLookup = async (hostname) => {
  const family = net.isIP(hostname);
  if (family) {
    return [{ address: hostname, family }];
  }
  return [{ address: '93.184.216.34', family: 4 }];
};
const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];

test('isPublicIpAddress allows public addresses', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
    assert.equal(isPublicIpAddress(ip), true, ip);
  }
});

test('isPublicIpAddress blocks private, special and obfuscated addresses', () => {
  const blocked = [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '169.254.169.254', // cloud metadata
    '0.0.0.0', '100.64.0.1', '192.0.2.1', '198.51.100.2', '203.0.113.3',
    '224.0.0.1', '240.0.0.1', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', // IPv4-mapped bypass attempt
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1', // NAT64 embedding 10.0.0.1
    'not-an-ip', '', '999.1.1.1'
  ];
  for (const ip of blocked) {
    assert.equal(isPublicIpAddress(ip), false, ip);
  }
});

test('assertPublicSubscriptionUrl rejects non-http(s) protocols', async () => {
  await assert.rejects(
    () => assertPublicSubscriptionUrl('ftp://example.com/sub', { lookup: publicLookup }),
    /must use http or https/
  );
});

test('assertPublicSubscriptionUrl rejects hosts resolving to private addresses', async () => {
  await assert.rejects(
    () => assertPublicSubscriptionUrl('https://example.com/sub', { lookup: privateLookup }),
    /private\/local address/
  );
});

test('assertPublicSubscriptionUrl rejects private IP literals without DNS', async () => {
  for (const url of [
    'http://127.0.0.1/sub',
    'http://169.254.169.254/',
    'http://[::ffff:10.0.0.1]/sub',
    'http://localhost/sub'
  ]) {
    await assert.rejects(() => assertPublicSubscriptionUrl(url, { lookup: publicLookup }), /private\/local address/, url);
  }
});

test('assertPublicSubscriptionUrl accepts public hosts', async () => {
  const result = await assertPublicSubscriptionUrl('https://example.com/sub', { lookup: publicLookup });
  assert.equal(result.hostname, 'example.com');
  assert.deepEqual(result.addresses, [{ address: '93.184.216.34', family: 4 }]);
});

test('fetchSubscriptionWithSafeRedirects follows redirects to public targets', async () => {
  const seen = [];
  const originalGet = axios.get;
  axios.get = async (url) => {
    seen.push(url);
    if (url === 'https://example.com/sub') {
      return { status: 302, headers: { location: '/final' }, data: '' };
    }
    return { status: 200, headers: {}, data: 'ss://x' };
  };
  try {
    const response = await fetchSubscriptionWithSafeRedirects('https://example.com/sub', {}, { lookup: publicLookup });
    assert.equal(response.status, 200);
    assert.deepEqual(seen, ['https://example.com/sub', 'https://example.com/final']);
  } finally {
    axios.get = originalGet;
  }
});

test('fetchSubscriptionWithSafeRedirects blocks redirects into private targets', async () => {
  const originalGet = axios.get;
  axios.get = async (url) => {
    if (url === 'https://example.com/sub') {
      return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, data: '' };
    }
    throw new Error('should not fetch the redirect target');
  };
  try {
    await assert.rejects(
      () => fetchSubscriptionWithSafeRedirects('https://example.com/sub', {}, { lookup: publicLookup }),
      /169\.254\.169\.254/
    );
  } finally {
    axios.get = originalGet;
  }
});

test('fetchSubscriptionWithSafeRedirects stops redirect loops', async () => {
  const originalGet = axios.get;
  axios.get = async () => ({ status: 302, headers: { location: 'https://example.com/sub' }, data: '' });
  try {
    await assert.rejects(
      () => fetchSubscriptionWithSafeRedirects('https://example.com/sub', {}, { lookup: publicLookup }),
      /Too many redirects/
    );
  } finally {
    axios.get = originalGet;
  }
});

test('fetchSubscriptionWithSafeRedirects throws axios-style errors on final non-2xx', async () => {
  const originalGet = axios.get;
  axios.get = async () => ({ status: 403, headers: {}, data: 'blocked' });
  try {
    const error = await fetchSubscriptionWithSafeRedirects('https://example.com/sub', {}, { lookup: publicLookup })
      .then(() => null, (err) => err);
    assert.ok(error);
    assert.equal(error.response.status, 403);
  } finally {
    axios.get = originalGet;
  }
});

test('fetchSubscriptionWithSafeRedirects pins DNS only for true direct transports', async () => {
  const originalGet = axios.get;
  const captured = [];
  axios.get = async (_url, config) => {
    captured.push(config);
    return { status: 200, headers: {}, data: 'ss://x' };
  };
  try {
    await fetchSubscriptionWithSafeRedirects('https://example.com/sub', {}, { lookup: publicLookup });
    assert.ok(captured[0].httpAgent, 'direct transport should install a pinned http agent');
    assert.ok(captured[0].httpsAgent, 'direct transport should install a pinned https agent');

    captured.length = 0;
    await fetchSubscriptionWithSafeRedirects('https://example.com/sub', {}, { lookup: publicLookup, viaSystemProxy: true });
    assert.equal(captured[0].httpAgent, undefined, 'proxied transport must not pin the proxy host lookup');
    assert.equal(captured[0].httpsAgent, undefined, 'proxied transport must not pin the proxy host lookup');
  } finally {
    axios.get = originalGet;
  }
});
