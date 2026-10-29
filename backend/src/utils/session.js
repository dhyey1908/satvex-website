// Session cookie settings and the admin session rules, shared by the auth
// controller (login) and the admin middleware (sliding renewal).
const { signAccessToken } = require('./jwt');
const env = require('../config/env');

// Admins are signed out after this long without using the admin: their access
// token only lives this long, and every admin request that is more than
// ADMIN_RENEW_AFTER_MS into the token's life quietly hands back a fresh one.
// (Admins get no long-lived refresh token, so there is no way around it.)
const ADMIN_SESSION_MINUTES = 30;
const ADMIN_SESSION_MS = ADMIN_SESSION_MINUTES * 60 * 1000;
const ADMIN_RENEW_AFTER_MS = 5 * 60 * 1000;

// Wrong passwords / second-factor codes allowed before the account is locked.
const MAX_FAILED_AUTH = 5;
const LOCK_MINUTES = 15;

const CUSTOMER_COOKIE_MAX_AGE_MS = 60 * 60 * 1000; // matches the default 1h access token

// The deployed frontend (CloudFront) and API (API Gateway) are on different
// domains, so cookies must be SameSite=None; Secure there. Locally Lax works.
const isCrossSiteDeployment = env.nodeEnv === 'production';

function cookieOptions() {
  return { httpOnly: true, secure: isCrossSiteDeployment, sameSite: isCrossSiteDeployment ? 'none' : 'lax' };
}

// The access token for a user: 30 minutes for an admin, the normal lifetime for
// everyone else. `v` is the user's tokenVersion - "Log out all devices" bumps it,
// which instantly invalidates every admin token issued before.
function accessTokenFor(user) {
  const payload = { sub: user.userId, role: user.role, v: user.tokenVersion || 0 };
  return user.role === 'admin'
    ? { token: signAccessToken(payload, { expiresIn: `${ADMIN_SESSION_MINUTES}m` }), maxAgeMs: ADMIN_SESSION_MS }
    : { token: signAccessToken(payload), maxAgeMs: CUSTOMER_COOKIE_MAX_AGE_MS };
}

module.exports = {
  ADMIN_SESSION_MINUTES,
  ADMIN_SESSION_MS,
  ADMIN_RENEW_AFTER_MS,
  MAX_FAILED_AUTH,
  LOCK_MINUTES,
  cookieOptions,
  accessTokenFor,
};
