const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateSecret, totp, verifyTotp, otpauthUri, base32Encode, base32Decode, hotp } = require('./totp');

// RFC 4226 Appendix D (HOTP) and RFC 6238 Appendix B (TOTP, SHA-1) test vectors, secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('HOTP matches the RFC 4226 vectors', () => {
  const key = Buffer.from('12345678901234567890');
  assert.deepEqual([0, 1, 2, 9].map((c) => hotp(key, c)), ['755224', '287082', '359152', '520489']);
});

test('TOTP matches the RFC 6238 vectors (6-digit tail of the 8-digit values)', () => {
  assert.equal(totp(RFC_SECRET, 59 * 1000), '287082');
  assert.equal(totp(RFC_SECRET, 1111111109 * 1000), '081804');
  assert.equal(totp(RFC_SECRET, 1234567890 * 1000), '005924');
});

test('base32 round-trips', () => {
  const buf = Buffer.from('satvex-2fa-secret');
  assert.equal(base32Decode(base32Encode(buf)).toString(), 'satvex-2fa-secret');
  assert.match(generateSecret(), /^[A-Z2-7]{32}$/);
});

test('verifyTotp accepts the current code and one step of clock drift, rejects the rest', () => {
  const now = 1_700_000_000_000;
  const code = totp(RFC_SECRET, now);
  assert.equal(verifyTotp(RFC_SECRET, code, now), true);
  assert.equal(verifyTotp(RFC_SECRET, code, now + 30_000), true); // one step late
  assert.equal(verifyTotp(RFC_SECRET, code, now + 90_000), false); // three steps late
  assert.equal(verifyTotp(RFC_SECRET, '000000', now), false);
  assert.equal(verifyTotp(RFC_SECRET, 'abc123', now), false);
  assert.equal(verifyTotp(RFC_SECRET, ` ${code.slice(0, 3)} ${code.slice(3)} `, now), true); // spaces tolerated
});

test('otpauth uri carries the secret and issuer', () => {
  const uri = otpauthUri({ secret: 'ABC234', account: 'admin@satvex.co.in' });
  assert.match(uri, /^otpauth:\/\/totp\/Satvex%3Aadmin%40satvex\.co\.in\?secret=ABC234&issuer=Satvex/);
});
