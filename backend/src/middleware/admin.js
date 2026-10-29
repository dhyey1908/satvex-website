const AppError = require('../utils/AppError');
const userService = require('../services/userService');
const { ADMIN_RENEW_AFTER_MS, ADMIN_SESSION_MS, cookieOptions, accessTokenFor } = require('../utils/session');

// Every admin API route sits behind this (adminRoutes.js, productRoutes.js).
// The role in a signed token is only a hint: the account is read again here, so
// a demoted/deleted admin, a locked account or a "Log out all devices" takes
// effect on the very next request instead of when the token happens to expire.
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
    if (req.user.role !== 'admin') throw new AppError('Admin access required.', 403, 'FORBIDDEN');

    const user = await userService.findById(req.user.id);
    if (!user || user.role !== 'admin') throw new AppError('Admin access required.', 403, 'FORBIDDEN');
    if ((user.tokenVersion || 0) !== (req.user.v || 0)) {
      throw new AppError('This session was ended. Please sign in again.', 401, 'UNAUTHENTICATED');
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new AppError('This account is temporarily locked.', 403, 'ACCOUNT_LOCKED');
    }

    // Sliding 30-minute session: active admins get a fresh token now and then
    // (header for the app, cookie for the browser); idle ones expire.
    const issuedAt = (req.user.iat || 0) * 1000;
    if (issuedAt && Date.now() - issuedAt > ADMIN_RENEW_AFTER_MS) {
      const { token } = accessTokenFor(user);
      res.cookie('accessToken', token, { ...cookieOptions(), maxAge: ADMIN_SESSION_MS });
      res.setHeader('X-Access-Token', token);
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin };
