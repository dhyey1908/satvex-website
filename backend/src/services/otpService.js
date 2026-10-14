const { GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const { hashToken } = require('../utils/password');
const smsService = require('./smsService');
const minimothService = require('./minimothService');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../utils/logger');

const TABLE = env.tables.otpCodes;
const CODE_TTL_MS = 10 * 60 * 1000; // a code is valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // wait between two sends to the same number
const MAX_SENDS_PER_WINDOW = 3; // codes per number per window (mirrors MiniMoth's own cap)
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5; // wrong guesses per issued code

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const secondsUntil = (ms) => Math.max(1, Math.ceil(ms / 1000));

// Two independent bypasses, both resulting in the fixed code 123456:
//  - env.otp.testMode: belt-and-suspenders local-only switch (also requires
//    nodeEnv !== 'production'). template.yaml never sets OTP_TEST_MODE for
//    the deployed Lambda (and hardcodes NODE_ENV: production there), so
//    this can only ever be true running the backend locally — it applies
//    to every phone number.
//  - env.otp.testPhones: DOES reach the deployed Lambda (wired into
//    template.yaml), but only ever bypasses for the specific numbers in
//    that list — every other number still goes through a real random code
//    + real SMS send, in production exactly as today. Safe to deploy.
function isTestMode(phone) {
  if (env.otp.testPhones.includes(phone)) return true;
  return env.otp.testMode && env.nodeEnv !== 'production';
}

// MiniMoth owns the code (generation, delivery, verification, attempt
// limits) when it's the configured provider. Fixed-code test numbers always
// stay on the local path below — they must never trigger a billed send.
function useMinimoth(phone) {
  return env.otp.provider === 'minimoth' && minimothService.isConfigured() && !isTestMode(phone);
}

function generateCode(phone) {
  if (isTestMode(phone)) return '123456';
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never starts with 0
}

// Is the last code we sent still usable (not expired, not locked)? Used to
// tell a rate-limited customer they can carry on with the code they have.
function latestCodeStillUsable(record, now) {
  return Boolean(record) && !record.locked && record.expiresAt * 1000 > now;
}

// Decides whether a new code may be sent right now and what the send counters
// become. Throws a 429 AppError carrying `details.retryAfterSeconds` (shown
// as a countdown by the UI) when it may not. A refused send never touches the
// stored record, so the customer's latest code keeps working.
function planSend(record, phone, now) {
  if (!record) return { sendCount: 1, windowStartedAt: now };

  const sinceLastSend = now - new Date(record.createdAt).getTime();
  if (sinceLastSend < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = secondsUntil(RESEND_COOLDOWN_MS - sinceLastSend);
    throw new AppError(
      `Please wait ${plural(retryAfterSeconds, 'second')} before requesting another code.`,
      429,
      'OTP_COOLDOWN',
      { retryAfterSeconds, canUseLatestCode: latestCodeStillUsable(record, now) }
    );
  }

  const windowOpen = record.windowStartedAt && now - record.windowStartedAt < SEND_WINDOW_MS;
  if (!windowOpen) return { sendCount: 1, windowStartedAt: now };

  const sendCount = record.sendCount || 1;
  // Fixed-code QA numbers send nothing, so the per-window cap doesn't apply.
  if (sendCount >= MAX_SENDS_PER_WINDOW && !isTestMode(phone)) {
    const retryAfterSeconds = secondsUntil(record.windowStartedAt + SEND_WINDOW_MS - now);
    const canUseLatestCode = latestCodeStillUsable(record, now);
    throw new AppError(
      `You've requested the maximum of ${MAX_SENDS_PER_WINDOW} codes. Please try again in ${plural(
        Math.ceil(retryAfterSeconds / 60),
        'minute'
      )}.${canUseLatestCode ? ' You can still use the latest code we sent.' : ''}`,
      429,
      'OTP_SEND_LIMIT',
      { retryAfterSeconds, canUseLatestCode }
    );
  }
  return { sendCount: sendCount + 1, windowStartedAt: record.windowStartedAt };
}

// Resolves to { resendAfterSeconds, sendsRemaining } so the UI can show a
// resend countdown and how many codes are left in this window.
async function sendOtp(phone) {
  const existing = await docClient.send(new GetCommand({ TableName: TABLE, Key: { phone } }));
  const now = Date.now();
  const { sendCount, windowStartedAt } = planSend(existing.Item, phone, now);

  const base = {
    phone,
    attempts: 0,
    locked: false,
    sendCount,
    windowStartedAt,
    createdAt: new Date(now).toISOString(),
    // DynamoDB TTL requires epoch SECONDS, not an ISO string or ms.
    expiresAt: Math.floor((now + CODE_TTL_MS) / 1000),
  };
  const result = {
    resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    sendsRemaining: Math.max(0, MAX_SENDS_PER_WINDOW - sendCount),
  };

  if (useMinimoth(phone)) {
    // Send first, store after: if delivery fails the customer can retry
    // immediately instead of being stuck behind our own cooldown.
    const { otpId } = await minimothService.sendOtp(phone);
    await docClient.send(new PutCommand({ TableName: TABLE, Item: { ...base, provider: 'minimoth', otpId } }));
    return result;
  }

  const code = generateCode(phone);
  await docClient.send(new PutCommand({ TableName: TABLE, Item: { ...base, codeHash: hashToken(code) } }));

  if (isTestMode(phone)) {
    logger.warn('OTP test mode active for this number — skipping real SMS send', { phoneSuffix: phone.slice(-4) });
    return result;
  }

  await smsService.sendSms({
    phoneNumber: phone,
    message: `Your SATVEX verification code is ${code}. Valid for 10 minutes. Do not share this code.`,
  });
  return result;
}

// A wrong guess: count it, tell the customer how many tries remain, and lock
// the code (without forgetting the send counters) once they run out.
async function rejectWrongCode(record) {
  const attempts = (record.attempts || 0) + 1;
  const attemptsRemaining = Math.max(0, MAX_VERIFY_ATTEMPTS - attempts);
  const locked = attemptsRemaining === 0;
  await docClient.send(new PutCommand({ TableName: TABLE, Item: { ...record, attempts, locked } }));

  if (locked) {
    throw new AppError(
      "That code isn't correct and is now locked. Please request a new code.",
      429,
      'OTP_TOO_MANY_ATTEMPTS',
      { attemptsRemaining: 0 }
    );
  }
  throw new AppError(
    `That code isn't correct. ${plural(attemptsRemaining, 'attempt')} left.`,
    400,
    'OTP_INCORRECT',
    { attemptsRemaining }
  );
}

const lockedError = () =>
  new AppError(
    'This code is locked after too many wrong attempts. Please request a new code.',
    429,
    'OTP_TOO_MANY_ATTEMPTS',
    { attemptsRemaining: 0 }
  );

// Returns nothing on success; throws AppError on any failure (wrong code,
// expired, too many attempts, no code was ever sent). Deletes the code
// item on a successful verify so it can never be reused (also prevents a
// second valid call with the same code after the first succeeds).
async function verifyOtp(phone, code) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { phone } }));
  const record = result.Item;
  if (!record) {
    throw new AppError(
      'No verification code was requested for this number, or it has expired. Please request a new code.',
      400,
      'OTP_NOT_FOUND'
    );
  }
  if (record.expiresAt * 1000 < Date.now()) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
    throw new AppError('This code has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }
  if (record.locked || (record.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    // Not deleted: the send counters must outlive a locked code.
    throw lockedError();
  }

  if (record.provider === 'minimoth') {
    try {
      const { accessToken } = await minimothService.verifyOtp(phone, code);
      await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
      // We issue our own session; don't leave MiniMoth's one live.
      await minimothService.endProviderSession(accessToken);
      return;
    } catch (err) {
      if (err.code === 'OTP_INCORRECT') return rejectWrongCode(record);
      if (err.code === 'OTP_TOO_MANY_ATTEMPTS') {
        await docClient.send(new PutCommand({ TableName: TABLE, Item: { ...record, locked: true } }));
        throw lockedError();
      }
      if (err.code === 'OTP_NOT_FOUND') {
        // Expired / already used on MiniMoth's side.
        await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
        throw new AppError('This code has expired. Please request a new one.', 400, 'OTP_EXPIRED');
      }
      throw err;
    }
  }

  if (hashToken(code) !== record.codeHash) {
    return rejectWrongCode(record);
  }

  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
}

module.exports = {
  sendOtp,
  verifyOtp,
  MAX_SENDS_PER_WINDOW,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  SEND_WINDOW_MS,
};
