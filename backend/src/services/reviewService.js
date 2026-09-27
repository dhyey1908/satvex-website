const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const productService = require('./productService');

const TABLE = env.tables.reviews;
const PRODUCT_INDEX = 'productId-createdAt-index';

async function findById(reviewId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { reviewId } }));
  return result.Item || null;
}

async function listForProduct(productId, { onlyApproved = true } = {}) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: PRODUCT_INDEX,
      KeyConditionExpression: 'productId = :productId',
      ExpressionAttributeValues: { ':productId': productId },
      ScanIndexForward: false,
    })
  );
  const items = result.Items || [];
  return onlyApproved ? items.filter((r) => r.status === 'approved') : items;
}

async function hasReviewed(productId, userId) {
  const reviews = await listForProduct(productId, { onlyApproved: false });
  return reviews.some((r) => r.userId === userId);
}

// Review volume is expected to stay small for this store; Scan keeps the
// admin moderation list simple, matching the Coupons/Orders admin pattern.
async function listAllForAdmin({ status } = {}) {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  let items = result.Items || [];
  if (status) items = items.filter((r) => r.status === status);
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function recomputeProductAggregate(productId) {
  const approved = await listForProduct(productId, { onlyApproved: true });
  const reviewCount = approved.length;
  const rating = reviewCount > 0 ? approved.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;
  await productService.updateRatingAggregate(productId, { rating, reviewCount });
}

async function create({ productId, userId, userName, rating, title, comment }) {
  const now = new Date().toISOString();
  const review = {
    reviewId: uuid(),
    productId,
    userId,
    userName,
    rating,
    title: title || '',
    comment,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: review }));
  return review;
}

async function setStatus(reviewId, status) {
  const existing = await findById(reviewId);
  if (!existing) return null;
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { reviewId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status, ':now': new Date().toISOString() },
    })
  );
  await recomputeProductAggregate(existing.productId);
  return { ...existing, status };
}

async function remove(reviewId) {
  const existing = await findById(reviewId);
  if (!existing) return;
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { reviewId } }));
  await recomputeProductAggregate(existing.productId);
}

module.exports = {
  findById,
  listForProduct,
  hasReviewed,
  listAllForAdmin,
  create,
  setStatus,
  remove,
};
