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

// OTP sends/verifies are throttled per IP in middleware/ipThrottle.js (a
// DynamoDB counter shared by every Lambda container) - an in-memory limiter
// here would be per-container and reset on cold start.

// Browser-side error reports: plenty for real use, too few to flood the logs.
const clientErrorLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many reports.',
});

// The public "can you deliver to my pincode?" check (it can reach Shiprocket on a cache miss).
const deliveryCheckLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 40,
  message: 'Too many pincode checks. Please wait a moment.',
});

module.exports = {
  deliveryCheckLimiter,
  clientErrorLimiter,
  authLimiter,
  passwordResetLimiter,
  contactLimiter,
  uploadUrlLimiter,
  refreshLimiter,
};
