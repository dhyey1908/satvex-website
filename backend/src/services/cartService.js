const { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const TABLE = env.tables.carts;

function withSubtotal(item) {
  return { ...item, subtotal: Number((item.unitPrice * item.quantity).toFixed(2)) };
}

async function getCartForUser(userId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    })
  );
  return (result.Items || []).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

async function getCartItem(userId, cartItemId) {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE, Key: { userId, cartItemId } })
  );
  return result.Item || null;
}

async function addItem(userId, lineItem, quantity) {
  const now = new Date().toISOString();
  const item = withSubtotal({
    userId,
    cartItemId: uuid(),
    productId: lineItem.productId,
    productName: lineItem.productName,
    productSlug: lineItem.productSlug,
    productImage: lineItem.productImage,
    sellingOptionId: lineItem.sellingOptionId,
    sellingOptionName: lineItem.sellingOptionName,
    selectedColors: lineItem.selectedColors,
    selectedColorDetails: lineItem.selectedColorDetails,
    unitPrice: lineItem.unitPrice,
    quantity,
    savedForLater: false,
    createdAt: now,
    updatedAt: now,
  });

  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

async function updateItem(userId, cartItemId, lineItem, quantity) {
  const existing = await getCartItem(userId, cartItemId);
  if (!existing) {
    throw new AppError('Cart item not found.', 404, 'NOT_FOUND');
  }

  const updated = withSubtotal({
    ...existing,
    sellingOptionId: lineItem.sellingOptionId,
    sellingOptionName: lineItem.sellingOptionName,
    selectedColors: lineItem.selectedColors,
    selectedColorDetails: lineItem.selectedColorDetails,
    unitPrice: lineItem.unitPrice,
    quantity: quantity ?? existing.quantity,
    productImage: lineItem.productImage,
    updatedAt: new Date().toISOString(),
  });

  await docClient.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

async function removeItem(userId, cartItemId) {
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { userId, cartItemId } }));
}

async function setSavedForLater(userId, cartItemId, savedForLater) {
  const existing = await getCartItem(userId, cartItemId);
  if (!existing) {
    throw new AppError('Cart item not found.', 404, 'NOT_FOUND');
  }
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId, cartItemId },
      UpdateExpression: 'SET savedForLater = :saved, updatedAt = :now',
      ExpressionAttributeValues: { ':saved': savedForLater, ':now': new Date().toISOString() },
    })
  );
}

// Only clears active (not saved-for-later) items — used after a successful
// checkout, which must never silently delete items a user saved for later.
async function clearCart(userId) {
  const items = await getCartForUser(userId);
  await Promise.all(items.filter((item) => !item.savedForLater).map((item) => removeItem(userId, item.cartItemId)));
}

module.exports = { getCartForUser, getCartItem, addItem, updateItem, removeItem, setSavedForLater, clearCart };
