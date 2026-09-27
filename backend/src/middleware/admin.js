const AppError = require('../utils/AppError');

function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'));
  }
  if (req.user.role !== 'admin') {
    return next(new AppError('Admin access required.', 403, 'FORBIDDEN'));
  }
  return next();
}

module.exports = { requireAdmin };
