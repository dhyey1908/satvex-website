const { GetCommand, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.users;
const EMAIL_INDEX = 'email-index';
const VERIFIED_PHONE_INDEX = 'verifiedPhone-index';

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function findByEmail(email) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: EMAIL_INDEX,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalizeEmail(email) },
      Limit: 1,
    })
  );
  return result.Items?.[0] || null;
}

// Looked up by VERIFIED phone only (see template.yaml's verifiedPhone-index
// comment) — an unverified phone must never resolve to an account, whether
// for login or for uniqueness checks at registration.
async function findByVerifiedPhone(phone) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: VERIFIED_PHONE_INDEX,
      KeyConditionExpression: 'verifiedPhone = :phone',
      ExpressionAttributeValues: { ':phone': phone },
      Limit: 1,
    })
  );
  return result.Items?.[0] || null;
}

async function findById(userId) {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE, Key: { userId } })
  );
  return result.Item || null;
}

async function createUser({ name, email, phone, passwordHash, role = 'customer' }) {
  const now = new Date().toISOString();
  const user = {
    userId: uuid(),
    name,
    // email/phone are both optional at the data layer now (registerSchema
    // enforces that at least one is given) — email stored only if present,
    // since DynamoDB's email-index GSI is sparse and a stored null/empty
    // string would behave unpredictably in a key attribute.
    ...(email ? { email: normalizeEmail(email) } : {}),
    phone: phone || null,
    // Deliberately NOT set here (left undefined -> omitted by
    // removeUndefinedValues) rather than null: verifiedPhone is a GSI key
    // attribute, and a present-but-null value is invalid for a GSI key.
    // Only markPhoneVerified sets it, once OTP-verified.
    passwordHash,
    role,
    resetTokenHash: null,
    resetTokenExpiry: null,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: user,
      ConditionExpression: 'attribute_not_exists(userId)',
    })
  );

  return user;
}

async function setResetToken(userId, resetTokenHash, resetTokenExpiry) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId },
      UpdateExpression: 'SET resetTokenHash = :hash, resetTokenExpiry = :expiry, updatedAt = :now',
      ExpressionAttributeValues: {
        ':hash': resetTokenHash,
        ':expiry': resetTokenExpiry,
        ':now': new Date().toISOString(),
      },
    })
  );
}

async function clearResetTokenAndSetPassword(userId, passwordHash) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId },
      UpdateExpression: 'SET passwordHash = :passwordHash, updatedAt = :now REMOVE resetTokenHash, resetTokenExpiry',
      ExpressionAttributeValues: {
        ':passwordHash': passwordHash,
        ':now': new Date().toISOString(),
      },
    })
  );
}

async function updateProfile(userId, { name, phone }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId },
      UpdateExpression: 'SET #name = :name, phone = :phone, updatedAt = :now',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: { ':name': name, ':phone': phone || null, ':now': new Date().toISOString() },
    })
  );
}

// Called only after otpService.verifyOtp succeeds for this exact phone —
// never set any other way. verifiedPhone (not phone) is what every
// verification check (checkout gating, phone-login lookup) reads, so a
// user changing their phone via updateProfile above does NOT silently
// re-trust the new number; it simply won't match verifiedPhone until
// OTP-verified again.
async function markPhoneVerified(userId, phone) {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId },
      UpdateExpression: 'SET verifiedPhone = :phone, phoneVerifiedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: { ':phone': phone, ':now': now },
    })
  );
}

async function updatePassword(userId, passwordHash) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId },
      UpdateExpression: 'SET passwordHash = :passwordHash, updatedAt = :now',
      ExpressionAttributeValues: { ':passwordHash': passwordHash, ':now': new Date().toISOString() },
    })
  );
}

const PHONE_VERIFICATION_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// True only if `phone` is EXACTLY the number this user last OTP-verified,
// and that verification hasn't expired. A changed/different phone always
// returns false, by design (re-verification required — see
// markPhoneVerified's comment).
function isPhoneVerified(user, phone) {
  if (!user?.verifiedPhone || !user?.phoneVerifiedAt || !phone) return false;
  if (user.verifiedPhone !== phone) return false;
  return Date.now() - new Date(user.phoneVerifiedAt).getTime() < PHONE_VERIFICATION_VALIDITY_MS;
}

function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, resetTokenHash, resetTokenExpiry, ...publicUser } = user;
  return publicUser;
}

module.exports = {
  normalizeEmail,
  findByEmail,
  findByVerifiedPhone,
  findById,
  createUser,
  setResetToken,
  clearResetTokenAndSetPassword,
  updateProfile,
  updatePassword,
  markPhoneVerified,
  isPhoneVerified,
  toPublicUser,
};
