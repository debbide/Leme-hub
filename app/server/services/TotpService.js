import crypto from 'crypto';

// RFC 6238 TOTP（基于 RFC 4226 HOTP），Node 原生 crypto 实现，无第三方依赖。
// 与主流验证器（Google Authenticator / 1Password / Aegis 等）兼容：
//   - SHA1 / 6 位 / 30 秒周期
//   - 允许 ±1 个时间窗的时钟偏差

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const SKEW_WINDOWS = 1;

export const generateTotpSecret = (bytes = 20) => {
  const raw = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of raw) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

export const base32Decode = (secret) => {
  const normalized = String(secret || '').toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  if (!normalized || /[^A-Z2-7]/u.test(normalized)) {
    throw new Error('Invalid base32 secret');
  }

  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const hotp = (keyBuffer, counter) => {
  const digest = crypto.createHmac('sha1', keyBuffer).update(Buffer.from(counter.toString(16).padStart(16, '0'), 'hex')).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** DIGITS)).padStart(DIGITS, '0');
};

export const totpCode = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 1000 / PERIOD_SECONDS);
  return hotp(base32Decode(secret), counter);
};

export const verifyTotp = (secret, code, timestamp = Date.now()) => {
  const normalized = String(code || '').replace(/\D+/gu, '');
  if (normalized.length !== DIGITS) {
    return false;
  }

  const counter = Math.floor(timestamp / 1000 / PERIOD_SECONDS);
  for (let window = -SKEW_WINDOWS; window <= SKEW_WINDOWS; window += 1) {
    const expected = hotp(base32Decode(secret), counter + window);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
};

export const buildTotpUri = (secret, account, issuer = 'Leme Hub') => {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

export class TotpService {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
  }

  generateSecret() {
    return generateTotpSecret();
  }

  buildUri(secret, account, issuer) {
    return buildTotpUri(secret, account, issuer);
  }

  verify(secret, code) {
    return verifyTotp(secret, code, this.now());
  }
}

export default TotpService;