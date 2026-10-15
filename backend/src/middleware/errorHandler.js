const { ZodError } = require('zod');
const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}

const BODY_ERRORS = {
  'entity.too.large': { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' },
  'entity.parse.failed': { statusCode: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON.' },
  'encoding.unsupported': { statusCode: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported request encoding.' },
  'charset.unsupported': { statusCode: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported request charset.' },
  'request.aborted': { statusCode: 400, code: 'REQUEST_ABORTED', message: 'The request was interrupted.' },
  'request.size.invalid': { statusCode: 400, code: 'BAD_REQUEST', message: 'The request size is invalid.' },
};

function clientBodyError(err) {
  if (!err || err.isAppError) return null;
  if (err.type && BODY_ERRORS[err.type]) return BODY_ERRORS[err.type];
  // A bare SyntaxError thrown by JSON.parse inside body-parser.
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) return BODY_ERRORS['entity.parse.failed'];
  return null;
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

  // body-parser (express.json) failures are the client's fault, not ours:
  // malformed JSON, a body over the limit, an unsupported charset. They used to
  // fall through to the 500 branch and page us for a bad request.
  const bodyError = clientBodyError(err);
  if (bodyError) {
    logger.warn('Request error', { code: bodyError.code, message: bodyError.message, path: req.path });
    return res.status(bodyError.statusCode).json({
      success: false,
      error: { code: bodyError.code, message: bodyError.message },
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

  const details = err.isAppError ? err.details : undefined;
  res.status(statusCode).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { notFoundHandler, errorHandler };
