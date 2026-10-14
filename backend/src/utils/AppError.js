class AppError extends Error {
  // `details` is optional structured data the client may act on (e.g. a
  // retry-after countdown for a rate-limited OTP) — never secrets.
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isAppError = true;
  }
}

module.exports = AppError;
