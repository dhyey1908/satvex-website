const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// MiniMoth (https://minimoth.dev) generates the one-time code, delivers it
// (WhatsApp first, automatic SMS fallback for Indian numbers) and verifies it.
// SATVEX only uses it as the OTP channel: once a code verifies, the customer
// gets SATVEX's own session (access + refresh tokens, see authController /
// refreshTokenService) — MiniMoth's session tokens are not used.
//
// Docs: https://minimoth.dev/docs  (key header X-Api-Key, mm_live_ / mm_test_)
const REQUEST_TIMEOUT_MS = 8000;

function isConfigured() {
  return Boolean(env.minimoth.apiKey);
}

// The API accepts +91XXXXXXXXXX; SATVEX stores 10-digit Indian numbers.
const toE164 = (phone) => `+91${phone}`;

class ProviderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.providerCode = code;
  }
}

async function call(path, { method = 'POST', body } = {}) {
  if (!isConfigured()) {
    throw new AppError('OTP service is not configured.', 503, 'OTP_PROVIDER_UNAVAILABLE');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${env.minimoth.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.minimoth.apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    logger.error('MiniMoth request failed', { path, reason: err.name === 'AbortError' ? 'timeout' : err.message });
    throw new AppError(
      'We could not reach the verification service. Please try again in a moment.',
      503,
      'OTP_PROVIDER_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new ProviderError(res.status, data?.code || 'UNKNOWN', data?.error || `HTTP ${res.status}`);
  }
  return data || {};
}

// Operator-facing failures (bad/blocked key, no balance) are logged for the
// store owner and shown to the customer as a generic "try again" — they can
// do nothing about them and shouldn't see billing/credential details.
function unavailable(err, path) {
  logger.error('MiniMoth rejected the request', {
    path,
    status: err.status,
    code: err.providerCode,
    requestHint: 'Check MINIMOTH_API_KEY and the MiniMoth balance',
  });
  return new AppError(
    "We couldn't send your code right now. Please try again in a minute.",
    503,
    'OTP_PROVIDER_UNAVAILABLE'
  );
}

// -> { otpId, expiresAt }
async function sendOtp(phone) {
  try {
    const data = await call('/v1/otp/send', { body: { phone: toE164(phone) } });
    return { otpId: data.otp_id || null, expiresAt: data.expires_at || null };
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    switch (err.providerCode) {
      // MiniMoth's own per-number cap (3 sends / 10 min). otpService enforces
      // the same cap first, so this is only a backstop (e.g. after a verify
      // cleared our counters) — the exact wait isn't known here.
      case 'OTP_RATE_LIMITED':
        throw new AppError(
          "You've requested too many codes for this number. Please try again in a few minutes.",
          429,
          'OTP_SEND_LIMIT',
          { retryAfterSeconds: 600 }
        );
      case 'INVALID_PHONE':
        throw new AppError('Please enter a valid 10-digit mobile number.', 400, 'INVALID_PHONE');
      case 'SMS_FAILED':
        throw new AppError('We could not deliver the code. Please try again.', 502, 'OTP_DELIVERY_FAILED');
      default:
        throw unavailable(err, '/v1/otp/send');
    }
  }
}

// Resolves on a correct code (-> { accessToken }), throws AppError otherwise.
async function verifyOtp(phone, code) {
  try {
    const data = await call('/v1/otp/verify', { body: { phone: toE164(phone), code: String(code) } });
    return { accessToken: data.access_token || null };
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    switch (err.providerCode) {
      case 'INVALID_OTP':
      case 'INVALID_OTP_CODE':
        throw new AppError('Incorrect code. Please try again.', 400, 'OTP_INCORRECT');
      case 'OTP_NOT_FOUND':
        throw new AppError(
          'No verification code was requested for this number, or it has expired.',
          400,
          'OTP_NOT_FOUND'
        );
      case 'VERIFY_RATE_LIMITED':
        throw new AppError('Too many incorrect attempts. Please request a new code.', 429, 'OTP_TOO_MANY_ATTEMPTS');
      case 'INVALID_PHONE':
        throw new AppError('Please enter a valid 10-digit mobile number.', 400, 'INVALID_PHONE');
      default:
        throw unavailable(err, '/v1/otp/verify');
    }
  }
}

// MiniMoth issues its own session on a successful verify. SATVEX doesn't use
// it, so end it straight away rather than leave a live credential sitting
// there. Best-effort: never blocks or fails the login.
async function endProviderSession(accessToken) {
  if (!accessToken || !isConfigured()) return;
  try {
    await call('/v1/session/logout', { body: { access_token: accessToken } });
  } catch {
    // already logged by call() when it was a transport problem; nothing to do.
  }
}

module.exports = { isConfigured, sendOtp, verifyOtp, endProviderSession };
