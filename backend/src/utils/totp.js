// RFC 6238 time-based one-time passwords (what Google Authenticator, Authy,
// 1Password etc. generate), built on Node's crypto - no extra dependency.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** A fresh 160-bit secret, base32 (what the authenticator app is given). */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function totp(secret, now = Date.now(), digits = DIGITS) {
  return hotp(base32Decode(secret), Math.floor(now / 1000 / STEP_SECONDS), digits);
}

/** True if `code` is the current code, or one step either side (clock drift). */
function verifyTotp(secret, code, now = Date.now()) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  const key = base32Decode(secret);
  for (const drift of [0, -1, 1]) {
    const expected = hotp(key, counter + drift);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true;
  }
  return false;
}

/** The otpauth:// link an authenticator app understands (also what a QR encodes). */
function otpauthUri({ secret, account, issuer = 'Satvex' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = { generateSecret, totp, verifyTotp, otpauthUri, base32Encode, base32Decode, hotp };
