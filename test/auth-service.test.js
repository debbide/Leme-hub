import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { AuthStore } from '../app/server/services/AuthStore.js';
import { AuthService, hashPassword, verifyPassword } from '../app/server/services/AuthService.js';
import { TotpService, verifyTotp, totpCode } from '../app/server/services/TotpService.js';

const createPaths = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-auth-'));
  return { root, dataDir: root };
};

const serverRuntime = { mode: 'server', publicOrigin: 'http://localhost:18997' };
const desktopRuntime = { mode: 'desktop', publicOrigin: 'http://127.0.0.1:18997' };

const createService = (runtime = serverRuntime) => {
  const paths = createPaths();
  const store = new AuthStore(paths);
  const service = new AuthService({ store, runtime });
  return { paths, store, service };
};

// ---- 密码哈希 ----

test('hashPassword / verifyPassword roundtrip', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.match(stored, /^scrypt\$/);
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
  assert.equal(verifyPassword('wrong password', stored), false);
  assert.equal(verifyPassword('x', 'garbage'), false);
});

// ---- 首次设置 ----

test('setup creates admin and issues session cookie', () => {
  const { service } = createService();
  const result = service.setup({ username: 'admin', password: 'password123' });
  assert.match(result.cookie, /^leme_session=/);
  assert.match(result.cookie, /HttpOnly/);
  assert.equal(service.getState().needsSetup, false);
});

test('setup rejects weak password and duplicate setup', () => {
  const { service } = createService();
  assert.throws(() => service.setup({ username: 'admin', password: 'short' }), /至少 8 位/);
  service.setup({ username: 'admin', password: 'password123' });
  assert.throws(() => service.setup({ username: 'other', password: 'password123' }), /already completed/);
});

test('auth is disabled in desktop mode', () => {
  const { service } = createService(desktopRuntime);
  assert.equal(service.enabled, false);
  assert.equal(service.getState().enabled, false);
  assert.equal(service.getState().needsSetup, false);
  assert.throws(() => service.setup({ username: 'a', password: 'password123' }), /server mode/);
});

// ---- 登录 / 会话 ----

test('login issues session; wrong password rejected and rate limited', () => {
  const { service } = createService();
  service.setup({ username: 'admin', password: 'password123' });

  const ok = service.login({ username: 'admin', password: 'password123' });
  assert.equal(ok.twoFactorRequired, false);
  assert.match(ok.cookie, /^leme_session=/);

  assert.throws(() => service.login({ username: 'admin', password: 'nope' }), /用户名或密码错误/);

  for (let i = 0; i < 9; i += 1) {
    assert.throws(() => service.login({ username: 'admin', password: 'nope' }));
  }
  assert.throws(() => service.login({ username: 'admin', password: 'password123' }), /尝试次数过多/);
});

test('resolveUserFromRequest validates session cookie', () => {
  const { service } = createService();
  service.setup({ username: 'admin', password: 'password123' });
  const { token } = service.login({ username: 'admin', password: 'password123' });

  const user = service.resolveUserFromRequest({ headers: { cookie: `leme_session=${token}` } });
  assert.equal(user.username, 'admin');

  assert.equal(service.resolveUserFromRequest({ headers: { cookie: 'leme_session=bad' } }), null);
  assert.equal(service.resolveUserFromRequest({ headers: {} }), null);
});

test('logout deletes session', () => {
  const { service } = createService();
  service.setup({ username: 'admin', password: 'password123' });
  const { token } = service.login({ username: 'admin', password: 'password123' });
  service.logout({ headers: { cookie: `leme_session=${token}` } });
  assert.equal(service.resolveUserFromRequest({ headers: { cookie: `leme_session=${token}` } }), null);
});

// ---- TOTP ----

test('TOTP enrollment and two-step login flow', () => {
  const { service } = createService();
  service.setup({ username: 'admin', password: 'password123' });

  const user = service.store.getUserByUsername('admin');
  const { secret, uri } = service.beginTotpEnrollment(user);
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.throws(() => service.confirmTotpEnrollment(service.store.getUserByUsername('admin'), '000000'), /动态码错误/);
  service.confirmTotpEnrollment(service.store.getUserByUsername('admin'), totpCode(secret));

  const login = service.login({ username: 'admin', password: 'password123' });
  assert.equal(login.twoFactorRequired, true);
  assert.ok(login.ticket);

  assert.throws(() => service.verifyTotpTicket({ ticket: login.ticket, code: '000000' }), /动态码错误/);
  const verified = service.verifyTotpTicket({ ticket: login.ticket, code: totpCode(secret) });
  assert.match(verified.cookie, /^leme_session=/);
});

test('TotpService generates valid secrets and URIs', () => {
  const totp = new TotpService();
  const secret = totp.generateSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(totp.verify(secret, totpCode(secret)), true);
  assert.equal(totp.verify(secret, '000000'), false);
});

// ---- AuthStore 持久化 ----

test('AuthStore persists users, sessions and passkeys to disk', () => {
  const paths = createPaths();
  const store = new AuthStore(paths);
  store.createUser({
    id: 'u1',
    username: 'admin',
    passwordHash: hashPassword('password123'),
    totpSecret: null,
    totpEnabled: false,
    createdAt: 1
  });
  store.createSession({ tokenHash: 'h1', userId: 'u1', expiresAt: 9999999999999, createdAt: 1 });
  store.addPasskey({ userId: 'u1', credentialId: 'cred1', publicKey: 'pk', counter: 0, transports: [], name: 'k1', createdAt: 1 });

  // 重新加载：数据应从磁盘恢复
  const reloaded = new AuthStore(paths);
  assert.equal(reloaded.getUserByUsername('admin').id, 'u1');
  assert.equal(reloaded.getSessionByTokenHash('h1').userId, 'u1');
  assert.equal(reloaded.listPasskeys('u1').length, 1);
  assert.equal(reloaded.getPasskeyByCredentialId('cred1').name, 'k1');

  reloaded.deletePasskey('u1', 'cred1');
  assert.equal(new AuthStore(paths).listPasskeys('u1').length, 0);
});

test('AuthStore prunes expired sessions', () => {
  const paths = createPaths();
  const store = new AuthStore(paths);
  store.createUser({ id: 'u1', username: 'a', passwordHash: 'x', totpSecret: null, totpEnabled: false, createdAt: 1 });
  store.createSession({ tokenHash: 'expired', userId: 'u1', expiresAt: 1000, createdAt: 1 });
  store.createSession({ tokenHash: 'fresh', userId: 'u1', expiresAt: 9999999999999, createdAt: 1 });

  store.pruneExpiredSessions(2000);
  assert.equal(store.getSessionByTokenHash('expired'), null);
  assert.equal(store.getSessionByTokenHash('fresh').userId, 'u1');
});