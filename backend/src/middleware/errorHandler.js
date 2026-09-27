const { ZodError } = require('zod');
const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data.',
        details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
  }

  const statusCode = err.isAppError ? err.statusCode : 500;
  const code = err.isAppError ? err.code : 'INTERNAL_ERROR';
  const message = err.isAppError ? err.message : 'Something went wrong. Please try again.';

  if (statusCode >= 500) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path });
  } else {
    logger.warn('Request error', { code, message, path: req.path });
  }

  res.status(statusCode).json({ success: false, error: { code, message } });
}

module.exports = { notFoundHandler, errorHandler };
