const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    return next(new AppError('Invalid or expired session.', 401, 'UNAUTHENTICATED'));
  }
}

function attachUserIfPresent(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch (err) {
    // ignore invalid token for optional-auth routes
  }
  return next();
}

module.exports = { requireAuth, attachUserIfPresent };
