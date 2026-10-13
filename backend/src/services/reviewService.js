const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const productService = require('./productService');
const AppError = require('../utils/AppError');
const { scanAll } = require('../utils/listQuery');

const TABLE = env.tables.reviews;
const PRODUCT_INDEX = 'productId-createdAt-index';

async function findById(reviewId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { reviewId } }));
  return result.Item || null;
}

async function listForProduct(productId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: PRODUCT_INDEX,
      KeyConditionExpression: 'productId = :productId',
      ExpressionAttributeValues: { ':productId': productId },
      ScanIndexForward: false,
    })
  );
  return result.Items || [];
}

async function findForUser(productId, userId) {
  return findById(`${productId}__${userId}`);
}

async function hasReviewed(productId, userId) {
  const existing = await findForUser(productId, userId);
  return Boolean(existing);
}

// Review volume is expected to stay small for this store; Scan keeps the
// admin review list simple, matching the Coupons/Orders admin pattern.
async function listAllForAdmin() {
  return scanAll(docClient, TABLE);
}

async function listForUserAcrossProducts(userId) {
  // No GSI on userId (reviews are looked up per-product elsewhere); at this
  // store's review volume a Scan is consistent with the admin list pattern.
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  return (result.Items || []).filter((r) => r.userId === userId);
}

async function recomputeProductAggregate(productId) {
  const reviews = await listForProduct(productId);
  const reviewCount = reviews.length;
  const rating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;
  await productService.updateRatingAggregate(productId, { rating, reviewCount });
}

async function create({ productId, userId, userName, rating, title, comment, images }) {
  const now = new Date().toISOString();
  const review = {
    // Deterministic key (rather than a random uuid) so the ConditionExpression
    // below gives us a real DB-level unique constraint on (productId, userId) —
    // not just an app-level check — closing the race window a plain
    // "query then put" duplicate check would leave open.
    reviewId: `${productId}__${userId}`,
    productId,
    userId,
    userName,
    rating,
    title: title || '',
    comment,
    images: images || [],
    createdAt: now,
    updatedAt: now,
  };
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: review,
        ConditionExpression: 'attribute_not_exists(reviewId)',
      })
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('You have already reviewed this product.', 409, 'ALREADY_REVIEWED');
    }
    throw err;
  }
  await recomputeProductAggregate(productId);
  return review;
}

async function update(reviewId, { rating, title, comment, images }) {
  const existing = await findById(reviewId);
  if (!existing) return null;
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { reviewId },
      // `comment` is a DynamoDB reserved keyword — it can't appear as a bare
      // attribute name in an UpdateExpression (unlike PutCommand, which
      // writes the whole item as a plain JSON map and never hits this).
      // Every real attribute name is aliased here on principle, not just
      // the one that happens to need it, so this doesn't silently break
      // again if a future field happens to collide with another reserved
      // word.
      UpdateExpression:
        'SET #rating = :rating, #title = :title, #comment = :comment, #images = :images, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#rating': 'rating',
        '#title': 'title',
        '#comment': 'comment',
        '#images': 'images',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':rating': rating,
        ':title': title || '',
        ':comment': comment,
        ':images': images || [],
        ':now': now,
      },
    })
  );
  await recomputeProductAggregate(existing.productId);
  return { ...existing, rating, title: title || '', comment, images: images || [], updatedAt: now };
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
  findForUser,
  hasReviewed,
  listAllForAdmin,
  listForUserAcrossProducts,
  recomputeProductAggregate,
  create,
  update,
  remove,
};
