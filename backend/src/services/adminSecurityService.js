// Admin two-step sign-in: an authenticator-app code (TOTP) as the second factor,
// plus one-time recovery codes so losing the phone never means losing the store.
// Also the failed-attempt lock shared by every admin sign-in step.
const crypto = require('crypto');
const userService = require('./userService');
const { generateSecret, verifyTotp, otpauthUri } = require('../utils/totp');
const { verifyPassword, hashToken } = require('../utils/password');
const { MAX_FAILED_AUTH, LOCK_MINUTES } = require('../utils/session');
const AppError = require('../utils/AppError');

const RECOVERY_CODE_COUNT = 8;
const LOCK_MS = LOCK_MINUTES * 60 * 1000;

const minutesLeft = (iso) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));

/** Throws 429 while the account is locked after too many wrong attempts. */
function assertNotLocked(user) {
  if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    throw new AppError(
      `Too many wrong attempts. This account is locked — try again in ${minutesLeft(user.lockedUntil)} minute(s).`,
      429,
      'ACCOUNT_LOCKED',
      { retryAfterMinutes: minutesLeft(user.lockedUntil) }
    );
  }
}

/** Counts a wrong attempt; throws the right error (with attempts left, or the lock). */
async function failAttempt(user, message, code) {
  const { locked, attemptsLeft } = await userService.recordFailedAuth(user.userId, { max: MAX_FAILED_AUTH, lockMs: LOCK_MS });
  if (locked) {
    throw new AppError(`Too many wrong attempts. This account is locked for ${LOCK_MINUTES} minutes.`, 429, 'ACCOUNT_LOCKED', {
      retryAfterMinutes: LOCK_MINUTES,
    });
  }
  throw new AppError(`${message} ${attemptsLeft} attempt(s) left.`, 401, code, { attemptsLeft });
}

// "ab12c-34def" style: easy to read out, 40 bits each.
function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const hex = crypto.randomBytes(5).toString('hex');
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}
const normalizeRecovery = (code) => String(code || '').toLowerCase().replace(/[^a-f0-9]/g, '');
const hashRecovery = (code) => hashToken(normalizeRecovery(code));

async function beginTotpSetup(user) {
  const secret = generateSecret();
  await userService.setTotpPending(user.userId, secret);
  return { secret, otpauthUri: otpauthUri({ secret, account: user.email || user.phone || user.userId }) };
}

async function enableTotp(userId, code) {
  const user = await userService.findById(userId);
  if (!user?.totpPendingSecret) throw new AppError('Start the setup first.', 400, 'TOTP_NOT_STARTED');
  if (!verifyTotp(user.totpPendingSecret, code)) {
    throw new AppError('That code is not correct. Check the 6 digits in your authenticator app.', 400, 'INVALID_TOTP');
  }
  const codes = newRecoveryCodes();
  await userService.enableTotp(userId, user.totpPendingSecret, codes.map(hashRecovery));
  return codes; // shown to the admin exactly once
}

/**
 * Checks ONE second-step proof: an authenticator code, a recovery code, or (when
 * allowed) the account password. Returns the method used, or null.
 */
async function checkSecondFactor(user, { code, recoveryCode, password }, { allowPassword = false } = {}) {
  if (code && user.totpEnabled && user.totpSecret && verifyTotp(user.totpSecret, code)) return 'totp';
  if (recoveryCode && user.totpEnabled && (await userService.consumeRecoveryCode(user, hashRecovery(recoveryCode)))) return 'recovery';
  if (password && allowPassword && user.passwordHash && (await verifyPassword(password, user.passwordHash))) return 'password';
  return null;
}

/** Turning two-step off needs a valid code - possession of the app, not just a stolen session. */
async function disableTotp(userId, proof) {
  const user = await userService.findById(userId);
  if (!user?.totpEnabled) throw new AppError('Two-step sign-in is not turned on.', 400, 'TOTP_NOT_ENABLED');
  assertNotLocked(user);
  if (!(await checkSecondFactor(user, proof))) await failAttempt(user, 'That code is not correct.', 'INVALID_TOTP');
  await userService.disableTotp(userId);
  await userService.clearFailedAuth(userId);
}

module.exports = {
  assertNotLocked,
  failAttempt,
  beginTotpSetup,
  enableTotp,
  checkSecondFactor,
  disableTotp,
  newRecoveryCodes,
  hashRecovery,
};
