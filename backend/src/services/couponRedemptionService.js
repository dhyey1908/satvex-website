const { PutCommand, QueryCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const TABLE = env.tables.couponRedemptions;
const CODE_INDEX = 'code-createdAt-index';

function redemptionKey(code, userId) {
  return `${code.toUpperCase()}__${userId}`;
}

async function hasRedeemed(code, userId) {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE, Key: { redemptionId: redemptionKey(code, userId) } })
  );
  return Boolean(result.Item);
}

// Records a redemption atomically — the deterministic key + ConditionExpression
// gives a real DB-level unique constraint on (code, userId), closing the race
// window a plain "check then write" one-use-per-customer check would leave
// open (two simultaneous checkouts with the same coupon+customer).
async function record({ code, userId, orderId, customerName, customerEmail, discountAmount }) {
  const item = {
    redemptionId: redemptionKey(code, userId),
    code: code.toUpperCase(),
    userId,
    orderId,
    customerName: customerName || '',
    customerEmail: customerEmail || '',
    discountAmount,
    createdAt: new Date().toISOString(),
  };
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(redemptionId)',
      })
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('You have already used this coupon.', 409, 'COUPON_ALREADY_USED');
    }
    throw err;
  }
  return item;
}

// Admin-facing usage history for a coupon, newest first.
async function listForCoupon(code) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: CODE_INDEX,
      KeyConditionExpression: 'code = :code',
      ExpressionAttributeValues: { ':code': code.toUpperCase() },
      ScanIndexForward: false,
    })
  );
  return result.Items || [];
}

// Rollback for the narrow race where the per-customer redemption was
// recorded but the coupon's global usage limit then rejected the order —
// without this, that customer's one-time slot would be burned for an order
// that was never actually created.
async function remove(code, userId) {
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { redemptionId: redemptionKey(code, userId) } }));
}

module.exports = { hasRedeemed, record, remove, listForCoupon };
