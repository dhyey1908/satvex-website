const {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const { scanAll } = require('../utils/listQuery');
const AppError = require('../utils/AppError');

const TABLE = env.tables.products;

// Catalog is small by design (a handful of products/variants), so a Scan here is
// negligible in cost and avoids maintaining a GSI purely for slug lookups.
async function listProducts({ onlyActive = false } = {}) {
  let items = await scanAll(docClient, TABLE);
  if (onlyActive) {
    items = items.filter((item) => item.isActive);
  }
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function findById(productId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { productId } }));
  return result.Item || null;
}

async function findBySlug(slug) {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  return (result.Items || []).find((item) => item.slug === slug) || null;
}

async function assertSlugAvailable(slug, excludeProductId) {
  const existing = await findBySlug(slug);
  if (existing && existing.productId !== excludeProductId) {
    throw new AppError('A product with this slug already exists.', 409, 'SLUG_IN_USE');
  }
}

async function createProduct(data) {
  await assertSlugAvailable(data.slug);

  const now = new Date().toISOString();
  const product = {
    productId: uuid(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: product,
      ConditionExpression: 'attribute_not_exists(productId)',
    })
  );

  return product;
}

async function updateProduct(productId, data) {
  const existing = await findById(productId);
  if (!existing) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }

  if (data.slug) {
    await assertSlugAvailable(data.slug, productId);
  }

  const updated = {
    ...existing,
    ...data,
    productId,
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

async function deleteProduct(productId) {
  const existing = await findById(productId);
  if (!existing) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { productId } }));
}

async function setActive(productId, isActive) {
  const existing = await findById(productId);
  if (!existing) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { productId },
      UpdateExpression: 'SET isActive = :isActive, updatedAt = :now',
      ExpressionAttributeValues: { ':isActive': isActive, ':now': new Date().toISOString() },
    })
  );
}

async function updateRatingAggregate(productId, { rating, reviewCount }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { productId },
      UpdateExpression: 'SET rating = :rating, reviewCount = :reviewCount, updatedAt = :now',
      ExpressionAttributeValues: { ':rating': rating, ':reviewCount': reviewCount, ':now': new Date().toISOString() },
    })
  );
}

module.exports = {
  listProducts,
  findById,
  findBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  setActive,
  updateRatingAggregate,
};
