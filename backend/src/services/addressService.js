const { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const TABLE = env.tables.addresses;

async function listForUser(userId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    })
  );
  return (result.Items || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function getForUser(userId, addressId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { userId, addressId } }));
  return result.Item || null;
}

async function clearDefaultFlag(userId, exceptAddressId) {
  const addresses = await listForUser(userId);
  await Promise.all(
    addresses
      .filter((a) => a.isDefault && a.addressId !== exceptAddressId)
      .map((a) =>
        docClient.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { userId, addressId: a.addressId },
            UpdateExpression: 'SET isDefault = :false',
            ExpressionAttributeValues: { ':false': false },
          })
        )
      )
  );
}

async function create(userId, data) {
  const existing = await listForUser(userId);
  const isFirst = existing.length === 0;
  const now = new Date().toISOString();

  const address = {
    userId,
    addressId: uuid(),
    ...data,
    isDefault: isFirst ? true : Boolean(data.isDefault),
    createdAt: now,
    updatedAt: now,
  };

  if (address.isDefault) await clearDefaultFlag(userId, address.addressId);

  await docClient.send(new PutCommand({ TableName: TABLE, Item: address }));
  return address;
}

async function update(userId, addressId, data) {
  const existing = await getForUser(userId, addressId);
  if (!existing) {
    throw new AppError('Address not found.', 404, 'NOT_FOUND');
  }

  const updated = { ...existing, ...data, userId, addressId, updatedAt: new Date().toISOString() };
  if (updated.isDefault) await clearDefaultFlag(userId, addressId);

  await docClient.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

async function remove(userId, addressId) {
  const existing = await getForUser(userId, addressId);
  if (!existing) {
    throw new AppError('Address not found.', 404, 'NOT_FOUND');
  }
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { userId, addressId } }));

  if (existing.isDefault) {
    const remaining = await listForUser(userId);
    if (remaining.length > 0) {
      await update(userId, remaining[0].addressId, { isDefault: true });
    }
  }
}

module.exports = { listForUser, getForUser, create, update, remove };
