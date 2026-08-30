import fs from 'fs';
import path from 'path';

// 面板账号 / 会话 / 通行密钥的 JSON 文件存储。
// Leme Hub 的数据目录里其他状态都是 JSON 文件（settings.json / proxy_nodes.json），
// 这里沿用同一模式：auth.json 单文件 + 原子写 + .bak 备份，避免引入 SQLite。

const DEFAULT_AUTH_FILE = 'auth.json';
const MAX_BACKUPS = 2;

const emptyState = () => ({
  users: [],
  sessions: [],
  passkeys: [],
  pendingTotp: null
});

export class AuthStore {
  constructor(paths, options = {}) {
    this.authPath = options.authPath || path.join(paths.dataDir, DEFAULT_AUTH_FILE);
    this.state = emptyState();
    this.load();
  }

  load() {
    if (!fs.existsSync(this.authPath)) {
      this.state = emptyState();
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
      this.state = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        passkeys: Array.isArray(parsed.passkeys) ? parsed.passkeys : [],
        pendingTotp: parsed.pendingTotp && typeof parsed.pendingTotp === 'object' ? parsed.pendingTotp : null
      };
    } catch {
      // 损坏的 auth.json：尝试备份恢复，否则重置为空（首次设置流程会重建）。
      try {
        this.state = JSON.parse(fs.readFileSync(`${this.authPath}.bak.1`, 'utf8'));
      } catch {
        this.state = emptyState();
      }
    }
  }

  save() {
    const dir = path.dirname(this.authPath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this.authPath)) {
      for (let i = MAX_BACKUPS - 1; i >= 1; i -= 1) {
        const from = `${this.authPath}.bak.${i}`;
        const to = `${this.authPath}.bak.${i + 1}`;
        if (fs.existsSync(from)) {
          fs.renameSync(from, to);
        }
      }
      fs.copyFileSync(this.authPath, `${this.authPath}.bak.1`);
    }

    const tmpPath = `${this.authPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmpPath, this.authPath);
  }

  // ---- users ----

  hasAnyUser() {
    return this.state.users.length > 0;
  }

  getUserByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    return this.state.users.find((user) => user.username.toLowerCase() === normalized) || null;
  }

  getUserById(userId) {
    return this.state.users.find((user) => user.id === userId) || null;
  }

  createUser(user) {
    this.state.users.push(user);
    this.save();
    return user;
  }

  updateUser(userId, patch) {
    const user = this.getUserById(userId);
    if (!user) {
      return null;
    }
    Object.assign(user, patch);
    this.save();
    return user;
  }

  // ---- totp ----

  getPendingTotp() {
    return this.state.pendingTotp;
  }

  setPendingTotp(pending) {
    this.state.pendingTotp = pending;
    this.save();
  }

  clearPendingTotp() {
    this.state.pendingTotp = null;
    this.save();
  }

  // ---- sessions ----

  createSession(session) {
    this.state.sessions.push(session);
    this.save();
    return session;
  }

  getSessionByTokenHash(tokenHash) {
    return this.state.sessions.find((session) => session.tokenHash === tokenHash) || null;
  }

  deleteSession(tokenHash) {
    this.state.sessions = this.state.sessions.filter((session) => session.tokenHash !== tokenHash);
    this.save();
  }

  deleteSessionsForUser(userId, exceptTokenHash = null) {
    this.state.sessions = this.state.sessions.filter((session) => (
      session.userId !== userId || session.tokenHash === exceptTokenHash
    ));
    this.save();
  }

  pruneExpiredSessions(now = Date.now()) {
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((session) => session.expiresAt > now);
    if (this.state.sessions.length !== before) {
      this.save();
    }
  }

  // ---- passkeys ----

  listPasskeys(userId) {
    return this.state.passkeys.filter((passkey) => passkey.userId === userId);
  }

  getPasskeyByCredentialId(credentialId) {
    return this.state.passkeys.find((passkey) => passkey.credentialId === String(credentialId)) || null;
  }

  addPasskey(passkey) {
    this.state.passkeys.push(passkey);
    this.save();
    return passkey;
  }

  deletePasskey(userId, credentialId) {
    const before = this.state.passkeys.length;
    this.state.passkeys = this.state.passkeys.filter((passkey) => (
      !(passkey.userId === userId && passkey.credentialId === String(credentialId))
    ));
    this.save();
    return this.state.passkeys.length !== before;
  }

  updatePasskeyCounter(credentialId, counter) {
    const passkey = this.getPasskeyByCredentialId(credentialId);
    if (passkey) {
      passkey.counter = counter;
      this.save();
    }
    return passkey;
  }
}

export default AuthStore;
