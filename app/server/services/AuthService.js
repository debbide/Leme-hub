import crypto from 'crypto';

import { TotpService } from './TotpService.js';

// 面板认证服务：账号密码（scrypt）、会话 Cookie、TOTP 两步验证、
// 通行密钥（WebAuthn）注册/登录。移植自 browser-automation-panel，改为
// JSON 存储 + Node 原生 http 风格，无 Express / SQLite 依赖。

const SESSION_COOKIE = 'leme_session';
const TWO_FACTOR_TICKET_TTL_MS = 5 * 60 * 1000; // 5 分钟内完成二步验证
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const PASSKEY_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 通行密钥登录固定 30 天
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
};

export const verifyPassword = (password, stored) => {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expected] = parts;
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
};

const parseCookies = (header) => {
  const cookies = {};
  String(header || '').split(';').forEach((pair) => {
    const index = pair.indexOf('=');
    if (index === -1) {
      return;
    }
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
};

export class AuthService {
  constructor({ store, runtime, now = () => Date.now() }) {
    this.store = store;
    this.runtime = runtime;
    this.now = now;
    this.totp = new TotpService({ now });
    this.loginAttempts = new Map(); // key -> { count, resetAt }
    this.webauthnChallenges = new Map(); // challenge -> expiresAt
  }

  get enabled() {
    return this.runtime.mode === 'server';
  }

  // ---- 状态查询 ----

  getState() {
    return {
      enabled: this.enabled,
      needsSetup: this.enabled && !this.store.hasAnyUser()
    };
  }

  // ---- 登录限流 ----

  checkLoginRateLimit(key) {
    const record = this.loginAttempts.get(key);
    if (!record) {
      return { allowed: true, retryAfterSec: 0 };
    }
    if (this.now() > record.resetAt) {
      this.loginAttempts.delete(key);
      return { allowed: true, retryAfterSec: 0 };
    }
    if (record.count >= LOGIN_RATE_LIMIT_MAX) {
      return { allowed: false, retryAfterSec: Math.ceil((record.resetAt - this.now()) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  recordLoginFailure(key) {
    const record = this.loginAttempts.get(key);
    if (!record || this.now() > record.resetAt) {
      this.loginAttempts.set(key, { count: 1, resetAt: this.now() + LOGIN_RATE_LIMIT_WINDOW_MS });
      return;
    }
    record.count += 1;
  }

  clearLoginFailures(key) {
    this.loginAttempts.delete(key);
  }

  // ---- 会话 ----

  createSessionCookie(userId, { remember = false, passkey = false } = {}) {
    const token = crypto.randomBytes(32).toString('base64url');
    const ttl = passkey ? PASSKEY_SESSION_TTL_MS : (remember ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS);
    const expiresAt = this.now() + ttl;
    this.store.createSession({
      tokenHash: sha256(token),
      userId,
      expiresAt,
      createdAt: this.now()
    });
    this.store.pruneExpiredSessions(this.now());
    return {
      token,
      cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttl / 1000)}${this.runtime.publicOrigin?.startsWith('https') ? '; Secure' : ''}`
    };
  }

  resolveUserFromRequest(request) {
    if (!this.enabled) {
      return null;
    }
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      return null;
    }
    const session = this.store.getSessionByTokenHash(sha256(token));
    if (!session || session.expiresAt <= this.now()) {
      return null;
    }
    return this.store.getUserById(session.userId);
  }

  logout(request) {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (token) {
      this.store.deleteSession(sha256(token));
    }
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  // ---- 首次设置 / 登录 ----

  setup({ username, password }) {
    if (!this.enabled) {
      throw Object.assign(new Error('Authentication is only available in server mode'), { status: 400 });
    }
    if (this.store.hasAnyUser()) {
      throw Object.assign(new Error('Setup already completed'), { status: 400 });
    }
    const name = String(username || '').trim();
    if (!name || name.length > 64) {
      throw Object.assign(new Error('用户名需为 1-64 个字符'), { status: 400 });
    }
    if (String(password || '').length < 8) {
      throw Object.assign(new Error('密码至少 8 位'), { status: 400 });
    }

    const user = this.store.createUser({
      id: crypto.randomUUID(),
      username: name,
      passwordHash: hashPassword(password),
      totpSecret: null,
      totpEnabled: false,
      createdAt: this.now()
    });
    return this.createSessionCookie(user.id);
  }

  login({ username, password, remember = false }, meta = {}) {
    if (!this.enabled) {
      throw Object.assign(new Error('Authentication is only available in server mode'), { status: 400 });
    }

    const rateKey = String(meta.remoteAddress || 'unknown');
    const limit = this.checkLoginRateLimit(rateKey);
    if (!limit.allowed) {
      throw Object.assign(
        new Error(`尝试次数过多，请 ${limit.retryAfterSec} 秒后再试`),
        { status: 429, retryAfterSec: limit.retryAfterSec }
      );
    }

    const user = this.store.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      this.recordLoginFailure(rateKey);
      throw Object.assign(new Error('用户名或密码错误'), { status: 401 });
    }

    this.clearLoginFailures(rateKey);

    if (user.totpEnabled && user.totpSecret) {
      const ticket = crypto.randomBytes(24).toString('base64url');
      this.store.setPendingTotp({
        ticket,
        userId: user.id,
        remember: Boolean(remember),
        expiresAt: this.now() + TWO_FACTOR_TICKET_TTL_MS
      });
      return { twoFactorRequired: true, ticket };
    }

    return { twoFactorRequired: false, ...this.createSessionCookie(user.id, { remember }) };
  }

  verifyTotpTicket({ ticket, code }) {
    const pending = this.store.getPendingTotp();
    if (!pending || pending.ticket !== String(ticket || '')) {
      throw Object.assign(new Error('登录票据无效，请重新登录'), { status: 401 });
    }
    if (pending.expiresAt <= this.now()) {
      this.store.clearPendingTotp();
      throw Object.assign(new Error('登录票据已过期，请重新登录'), { status: 401 });
    }

    const user = this.store.getUserById(pending.userId);
    if (!user || !user.totpSecret) {
      this.store.clearPendingTotp();
      throw Object.assign(new Error('账号状态异常，请重新登录'), { status: 401 });
    }

    if (!this.totp.verify(user.totpSecret, code)) {
      throw Object.assign(new Error('动态码错误'), { status: 401 });
    }

    this.store.clearPendingTotp();
    return this.createSessionCookie(user.id, { remember: pending.remember });
  }

  // ---- TOTP 管理 ----

  beginTotpEnrollment(user) {
    const secret = this.totp.generateSecret();
    this.store.updateUser(user.id, { totpSecret: secret, totpEnabled: false });
    return {
      secret,
      uri: this.totp.buildUri(secret, user.username)
    };
  }

  confirmTotpEnrollment(user, code) {
    if (!user.totpSecret) {
      throw Object.assign(new Error('请先生成动态码密钥'), { status: 400 });
    }
    if (!this.totp.verify(user.totpSecret, code)) {
      throw Object.assign(new Error('动态码错误，请重试'), { status: 400 });
    }
    this.store.updateUser(user.id, { totpEnabled: true });
    return { ok: true };
  }

  disableTotp(user, code) {
    if (user.totpEnabled && !this.totp.verify(user.totpSecret, code)) {
      throw Object.assign(new Error('动态码错误'), { status: 400 });
    }
    this.store.updateUser(user.id, { totpSecret: null, totpEnabled: false });
    return { ok: true };
  }

  // ---- 通行密钥（WebAuthn）----

  async #webauthn() {
    const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = await import('@simplewebauthn/server');
    return { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse };
  }

  rpInfo() {
    const origin = this.runtime.publicOrigin || 'http://localhost';
    let rpName = 'Leme Hub';
    let rpId = 'localhost';
    try {
      const url = new URL(origin);
      rpId = url.hostname;
      rpName = url.hostname;
    } catch {
      // keep defaults
    }
    return { rpName, rpId, origin };
  }

  async beginPasskeyRegistration(user) {
    const { generateRegistrationOptions } = await this.#webauthn();
    const { rpName, rpId } = this.rpInfo();
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: Buffer.from(user.id).toString('base64url'),
      userName: user.username,
      attestationType: 'none',
      excludeCredentials: this.store.listPasskeys(user.id).map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports || []
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });
    this.webauthnChallenges.set(options.challenge, this.now() + 5 * 60 * 1000);
    return options;
  }

  async finishPasskeyRegistration(user, credential, name = '') {
    const { verifyRegistrationResponse } = await this.#webauthn();
    const { rpId, origin } = this.rpInfo();
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: (challenge) => {
        const expiresAt = this.webauthnChallenges.get(challenge);
        return Boolean(expiresAt && expiresAt > this.now());
      },
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw Object.assign(new Error('通行密钥注册验证失败'), { status: 400 });
    }

    const registered = verification.registrationInfo.credential;
    if (credential?.response?.challenge) {
      this.webauthnChallenges.delete(credential.response.challenge);
    }
    this.store.addPasskey({
      userId: user.id,
      credentialId: registered.id,
      publicKey: Buffer.from(registered.publicKey).toString('base64url'),
      counter: registered.counter,
      transports: registered.transports || [],
      name: String(name || '').trim() || `通行密钥 ${this.store.listPasskeys(user.id).length + 1}`,
      createdAt: this.now()
    });
    return { ok: true };
  }

  async beginPasskeyLogin() {
    const { generateAuthenticationOptions } = await this.#webauthn();
    const options = await generateAuthenticationOptions({
      rpID: this.rpInfo().rpId,
      userVerification: 'preferred'
    });
    this.webauthnChallenges.set(options.challenge, this.now() + 5 * 60 * 1000);
    return options;
  }

  async finishPasskeyLogin(credential) {
    const { verifyAuthenticationResponse } = await this.#webauthn();
    const passkey = this.store.getPasskeyByCredentialId(credential?.id);
    if (!passkey) {
      throw Object.assign(new Error('通行密钥未注册'), { status: 401 });
    }

    const { rpId, origin } = this.rpInfo();
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: (challenge) => {
        const expiresAt = this.webauthnChallenges.get(challenge);
        return Boolean(expiresAt && expiresAt > this.now());
      },
      expectedOrigin: origin,
      expectedRPID: rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: passkey.counter,
        transports: passkey.transports || []
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      throw Object.assign(new Error('通行密钥验证失败'), { status: 401 });
    }

    if (credential?.response?.challenge) {
      this.webauthnChallenges.delete(credential.response.challenge);
    }
    this.store.updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);
    return this.createSessionCookie(passkey.userId, { passkey: true });
  }

  listPasskeysForUser(user) {
    return this.store.listPasskeys(user.id).map((passkey) => ({
      credentialId: passkey.credentialId,
      name: passkey.name,
      createdAt: passkey.createdAt,
      transports: passkey.transports
    }));
  }

  removePasskey(user, credentialId) {
    const removed = this.store.deletePasskey(user.id, credentialId);
    if (!removed) {
      throw Object.assign(new Error('通行密钥不存在'), { status: 404 });
    }
    return { ok: true };
  }
}

export default AuthService;
