const { PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const TABLE = env.tables.coupons;

async function findByCode(code) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { code: code.toUpperCase() } }));
  return result.Item || null;
}

// Coupon volume is expected to stay small for this store; Scan keeps the admin list simple.
async function listAll() {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  return (result.Items || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function create(data) {
  const existing = await findByCode(data.code);
  if (existing) {
    throw new AppError('A coupon with this code already exists.', 409, 'COUPON_EXISTS');
  }

  const now = new Date().toISOString();
  const coupon = { ...data, usageCount: 0, createdAt: now, updatedAt: now };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: coupon }));
  return coupon;
}

async function update(code, data) {
  const existing = await findByCode(code);
  if (!existing) {
    throw new AppError('Coupon not found.', 404, 'NOT_FOUND');
  }
  const updated = { ...existing, ...data, code: existing.code, updatedAt: new Date().toISOString() };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

async function remove(code) {
  const existing = await findByCode(code);
  if (!existing) {
    throw new AppError('Coupon not found.', 404, 'NOT_FOUND');
  }
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { code: existing.code } }));
}

// Atomic conditional increment — prevents redeeming past usageLimit under concurrent checkouts.
async function incrementUsage(code, usageLimit) {
  const params = {
    TableName: TABLE,
    Key: { code },
    UpdateExpression: 'ADD usageCount :one SET updatedAt = :now',
    ExpressionAttributeValues: { ':one': 1, ':now': new Date().toISOString() },
  };
  if (usageLimit) {
    params.ConditionExpression = 'attribute_not_exists(usageCount) OR usageCount < :limit';
    params.ExpressionAttributeValues[':limit'] = usageLimit;
  }

  try {
    await docClient.send(new UpdateCommand(params));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('This coupon has reached its usage limit.', 400, 'COUPON_EXHAUSTED');
    }
    throw err;
  }
}

module.exports = { findByCode, listAll, create, update, remove, incrementUsage };
