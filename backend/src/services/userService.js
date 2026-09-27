const { GetCommand, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.users;
const EMAIL_INDEX = 'email-index';

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
    email: normalizeEmail(email),
    phone: phone || null,
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

function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, resetTokenHash, resetTokenExpiry, ...publicUser } = user;
  return publicUser;
}

module.exports = {
  normalizeEmail,
  findByEmail,
  findById,
  createUser,
  setResetToken,
  clearResetTokenAndSetPassword,
  updateProfile,
  updatePassword,
  toPublicUser,
};
