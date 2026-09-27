const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.orders;
const USER_INDEX = 'userId-createdAt-index';

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

async function createOrder({ userId, items, customer, address, subtotal, couponCode, discountAmount, shipping, total }) {
  const now = new Date().toISOString();
  const order = {
    orderId: uuid(),
    userId,
    items,
    customer,
    address,
    subtotal,
    couponCode: couponCode || null,
    discountAmount: discountAmount || 0,
    shipping,
    total,
    status: 'Pending',
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: TABLE, Item: order }));
  return order;
}

async function findById(orderId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { orderId } }));
  return result.Item || null;
}

async function listForUser(userId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: USER_INDEX,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
    })
  );
  return result.Items || [];
}

// Admin order volume is expected to stay modest for this store, so a Scan with
// in-memory filtering avoids maintaining extra GSIs for status/search.
async function listAll({ status, search } = {}) {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  let items = result.Items || [];

  if (status) {
    items = items.filter((order) => order.status === status);
  }
  if (search) {
    const term = search.trim().toLowerCase();
    items = items.filter(
      (order) =>
        order.orderId.toLowerCase().includes(term) ||
        order.customer?.name?.toLowerCase().includes(term) ||
        order.customer?.email?.toLowerCase().includes(term) ||
        order.customer?.phone?.includes(term)
    );
  }

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function updateStatus(orderId, status) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status, ':now': new Date().toISOString() },
    })
  );
}

module.exports = { ORDER_STATUSES, createOrder, findById, listForUser, listAll, updateStatus };
