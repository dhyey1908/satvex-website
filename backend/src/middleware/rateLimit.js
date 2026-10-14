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

// Fires silently/automatically from the frontend (apiClient's 401 ->
// refresh-and-retry interceptor), not from a user click — needs a generous
// ceiling, not a tight one like authLimiter.
const refreshLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many session refresh attempts. Please log in again.',
});

// Every code sent costs real money. The per-NUMBER caps (60s between sends,
// 3 codes per 10 min, 5 wrong guesses per code) live in otpService; these two
// are the per-IP ceilings against someone cycling through many numbers.
//
// Sends and verifies deliberately have SEPARATE budgets. They used to share a
// single 10-per-15-minutes counter, so a normal customer (3 codes + a few
// wrong guesses) could lock themselves out, and customers behind the same
// mobile-carrier / office IP shared that one small budget.
const otpSendLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many code requests from this network. Please try again in a few minutes.',
});

const otpVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many verification attempts from this network. Please try again in a few minutes.',
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  contactLimiter,
  uploadUrlLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  refreshLimiter,
};
