const { PutCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const TABLE = env.tables.wishlists;

async function listForUser(userId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    })
  );
  return (result.Items || []).sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

async function addProduct(userId, productId) {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: { userId, productId, addedAt: new Date().toISOString() },
        ConditionExpression: 'attribute_not_exists(productId)',
      })
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('This product is already in your wishlist.', 409, 'ALREADY_IN_WISHLIST');
    }
    throw err;
  }
}

async function removeProduct(userId, productId) {
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { userId, productId } }));
}

module.exports = { listForUser, addProduct, removeProduct };
