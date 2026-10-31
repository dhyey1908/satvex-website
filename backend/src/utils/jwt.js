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

// A "Buy Now" checkout session: the ONE item the customer chose (product, pack, colours, quantity), signed so it
// cannot be edited, bound to the customer and valid for 2 hours. It is not an access token and it never touches
// the bag. Prices are never stored in it: they are worked out again from the live product every time.
function signDirectCheckoutToken(userId, item) {
  return jwt.sign({ typ: 'direct', uid: userId, item }, env.jwt.secret, { expiresIn: '2h' });
}

function verifyDirectCheckoutToken(token) {
  const payload = jwt.verify(token, env.jwt.secret);
  if (payload.typ !== 'direct') throw new Error('Not a direct-checkout token.');
  return payload;
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

module.exports = { signAccessToken, verifyAccessToken, signMfaToken, verifyMfaToken, signDirectCheckoutToken, verifyDirectCheckoutToken };
