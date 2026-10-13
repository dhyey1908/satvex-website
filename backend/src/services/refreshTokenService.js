const { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const { generateRawToken, hashToken } = require('../utils/password');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const TABLE = env.tables.refreshTokens;
const MAX_AGE_MS = env.auth.refreshTokenMaxAgeDays * 24 * 60 * 60 * 1000;
// How long a rotated-away (revoked) record is kept around after rotation —
// just long enough to recognize a replay of it as theft (see rotate()
// below); not the live session window, which is MAX_AGE_MS above.
const REVOKED_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const SESSION_EXPIRED_ERROR = () => new AppError('Session expired. Please log in again.', 401, 'REFRESH_INVALID');

async function putToken({ userId, familyId, familyCreatedAt, expiresAt, userAgent }) {
  const rawToken = generateRawToken();
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        tokenHash: hashToken(rawToken),
        userId,
        familyId,
        familyCreatedAt,
        userAgent: userAgent || null,
        revoked: false,
        createdAt: new Date().toISOString(),
        // DynamoDB TTL requires epoch seconds.
        expiresAt: Math.floor(expiresAt / 1000),
      },
    })
  );
  return rawToken;
}

// New login (or signup) — starts a brand new rotation family. expiresAt is
// fixed here, at family creation, and carried forward unchanged by every
// later rotation — this is what makes RefreshTokenMaxAgeDays an ABSOLUTE
// cap from first login rather than a rolling window that could be extended
// forever by continued use.
async function createFamily(userId, userAgent) {
  const familyId = uuid();
  const familyCreatedAt = new Date().toISOString();
  const expiresAt = Date.now() + MAX_AGE_MS;
  return putToken({ userId, familyId, familyCreatedAt, expiresAt, userAgent });
}

// Single-use rotation: the presented token is immediately retired (not
// deleted — kept with revoked:true for a grace period) and a new one is
// issued in the same family with the same absolute expiresAt. Returns the
// new raw token + userId on success; throws on any failure.
async function rotate(rawToken, userAgent) {
  const tokenHash = hashToken(rawToken);
  const { Item: record } = await docClient.send(new GetCommand({ TableName: TABLE, Key: { tokenHash } }));

  if (!record) throw SESSION_EXPIRED_ERROR();

  if (record.revoked) {
    // This exact token was already rotated away once before — presenting
    // it again means it was copied/stolen somewhere along the way (a
    // legitimate client only ever has the LATEST token in a family). Don't
    // try to guess which caller is legitimate: revoke every session this
    // user has, anywhere, and force a real re-login everywhere.
    await revokeAllForUser(record.userId);
    throw new AppError('Session expired. Please log in again.', 401, 'REFRESH_REUSE_DETECTED');
  }

  if (record.expiresAt * 1000 < Date.now()) {
    throw SESSION_EXPIRED_ERROR();
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { tokenHash },
      UpdateExpression: 'SET revoked = :t, expiresAt = :grace',
      ExpressionAttributeValues: {
        ':t': true,
        ':grace': Math.floor((Date.now() + REVOKED_GRACE_MS) / 1000),
      },
    })
  );

  const newRawToken = await putToken({
    userId: record.userId,
    familyId: record.familyId,
    familyCreatedAt: record.familyCreatedAt,
    expiresAt: record.expiresAt * 1000,
    userAgent: userAgent || record.userAgent,
  });

  return { rawToken: newRawToken, userId: record.userId };
}

// Logout — revoke just this one device's token (not the whole user; other
// devices stay signed in, same as any normal multi-device logout).
async function revoke(rawToken) {
  const tokenHash = hashToken(rawToken);
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { tokenHash } })).catch(() => {});
}

// Used both by reuse-detection above and available for a future "log out
// of all devices" action.
async function revokeAllForUser(userId) {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    })
  );
  for (const item of Items || []) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { tokenHash: item.tokenHash } }));
  }
}

module.exports = { createFamily, rotate, revoke, revokeAllForUser };
