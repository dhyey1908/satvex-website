const rateLimit = require('express-rate-limit');

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message } },
  });
}

// Login/register: tight limits, brute-force protection.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again later.',
});

// Forgot/reset password: stricter, prevents email-bombing and token guessing.
const passwordResetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please try again later.',
});

const contactLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many messages sent. Please try again later.',
});

const uploadUrlLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many upload requests. Please try again later.',
});

module.exports = { authLimiter, passwordResetLimiter, contactLimiter, uploadUrlLimiter };
