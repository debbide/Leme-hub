import test from 'node:test';
import assert from 'node:assert/strict';

import { isForbiddenCrossOrigin } from '../app/server/createServer.js';

const req = (method, headers = {}) => ({ method, headers });
const desktop = { mode: 'desktop' };
const server = { mode: 'server' };

test('allows safe methods regardless of origin (desktop)', () => {
  assert.equal(isForbiddenCrossOrigin(req('GET', { origin: 'https://evil.example' }), desktop), false);
  assert.equal(isForbiddenCrossOrigin(req('HEAD', { origin: 'https://evil.example' }), desktop), false);
  assert.equal(isForbiddenCrossOrigin(req('OPTIONS', { origin: 'https://evil.example' }), desktop), false);
});

test('allows write requests without an Origin header (non-browser callers)', () => {
  assert.equal(isForbiddenCrossOrigin(req('POST', {}), desktop), false);
  assert.equal(isForbiddenCrossOrigin(req('PUT', {}), desktop), false);
});

test('allows write requests from loopback origins', () => {
  for (const origin of ['http://127.0.0.1:8787', 'http://localhost:1234', 'http://[::1]:9', 'http://127.0.0.5']) {
    assert.equal(isForbiddenCrossOrigin(req('POST', { origin }), desktop), false, origin);
  }
});

test('rejects write requests from non-loopback origins (desktop)', () => {
  for (const origin of ['https://evil.example', 'http://192.168.1.5', 'http://attacker.test:1234']) {
    assert.equal(isForbiddenCrossOrigin(req('POST', { origin }), desktop), true, origin);
  }
});

test('rejects write requests with an unparseable Origin (desktop)', () => {
  assert.equal(isForbiddenCrossOrigin(req('POST', { origin: 'not-a-url' }), desktop), true);
});

test('server mode is exempt from the cross-origin guard', () => {
  assert.equal(isForbiddenCrossOrigin(req('POST', { origin: 'https://evil.example' }), server), false);
  assert.equal(isForbiddenCrossOrigin(req('DELETE', { origin: 'https://evil.example' }), server), false);
});
