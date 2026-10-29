const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(payload, { expiresIn } = {}) {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: expiresIn || env.jwt.accessTokenExpiresIn });
}

// A "second step" token is NOT a session: it only proves the first factor
// (password / phone code) passed and lets /auth/mfa finish the sign-in. It is
// tagged so it can never be used as an access token, and expires in 5 minutes.
function signMfaToken(payload) {
  return jwt.sign({ ...payload, typ: 'mfa' }, env.jwt.secret, { expiresIn: '5m' });
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwt.secret);
  if (payload.typ) throw new Error('Not an access token.');
  return payload;
}

function verifyMfaToken(token) {
  const payload = jwt.verify(token, env.jwt.secret);
  if (payload.typ !== 'mfa') throw new Error('Not a second-step token.');
  return payload;
}

module.exports = { signAccessToken, verifyAccessToken, signMfaToken, verifyMfaToken };
