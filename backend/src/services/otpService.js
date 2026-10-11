const { GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const { hashToken } = require('../utils/password');
const smsService = require('./smsService');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const TABLE = env.tables.otpCodes;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends to the same number
const MAX_VERIFY_ATTEMPTS = 5; // per issued code, before it's invalidated

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never starts with 0
}

async function sendOtp(phone) {
  const existing = await docClient.send(new GetCommand({ TableName: TABLE, Key: { phone } }));
  const now = Date.now();
  if (existing.Item && now - new Date(existing.Item.createdAt).getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError('Please wait a moment before requesting another code.', 429, 'OTP_COOLDOWN');
  }

  const code = generateCode();
  const nowIso = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        phone,
        codeHash: hashToken(code),
        attempts: 0,
        createdAt: nowIso,
        // DynamoDB TTL requires epoch SECONDS, not an ISO string or ms.
        expiresAt: Math.floor((now + CODE_TTL_MS) / 1000),
      },
    })
  );

  await smsService.sendSms({ phoneNumber: phone, message: `Your SATVEX verification code is ${code}. Valid for 10 minutes. Do not share this code.` });
}

// Returns nothing on success; throws AppError on any failure (wrong code,
// expired, too many attempts, no code was ever sent). Deletes the code
// item on a successful verify so it can never be reused (also prevents a
// second valid call with the same code after the first succeeds).
async function verifyOtp(phone, code) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { phone } }));
  const record = result.Item;
  if (!record) {
    throw new AppError('No verification code was requested for this number, or it has expired.', 400, 'OTP_NOT_FOUND');
  }
  if (record.expiresAt * 1000 < Date.now()) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
    throw new AppError('This code has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
    throw new AppError('Too many incorrect attempts. Please request a new code.', 429, 'OTP_TOO_MANY_ATTEMPTS');
  }

  if (hashToken(code) !== record.codeHash) {
    await docClient.send(
      new PutCommand({ TableName: TABLE, Item: { ...record, attempts: record.attempts + 1 } })
    );
    throw new AppError('Incorrect code. Please try again.', 400, 'OTP_INCORRECT');
  }

  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { phone } }));
}

module.exports = { sendOtp, verifyOtp };
