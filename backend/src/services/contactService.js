const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const { scanAll } = require('../utils/listQuery');

const TABLE = env.tables.contacts;

// Type-specific fields the frontend always includes as '' when not
// applicable to the selected enquiryType (so the schema can accept a flat
// payload for any type) — strip the blanks to undefined here so they're
// dropped by the docClient's removeUndefinedValues instead of being stored
// as empty-string noise on every record.
const BLANKABLE_FIELDS = ['orderId', 'returnReason', 'returnResolution', 'paymentMethod', 'transactionRef', 'cancelReason'];

async function createContact(data) {
  const contact = {
    contactId: uuid(),
    ...data,
    email: data.email || null,
    phone: data.phone || null,
    // Resolution tracking - the admin toggles it from the enquiry page.
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  for (const field of BLANKABLE_FIELDS) {
    if (contact[field] === '') contact[field] = undefined;
  }
  await docClient.send(new PutCommand({ TableName: TABLE, Item: contact }));
  return contact;
}

// Contact volume is expected to stay low; a Scan avoids an index for a rarely-listed admin view.
async function listContacts() {
  return scanAll(docClient, TABLE);
}

// Returns the updated record, or null when there is no such enquiry.
async function updateStatus(contactId, status) {
  const existing = await docClient.send(new GetCommand({ TableName: TABLE, Key: { contactId } }));
  if (!existing.Item) return null;
  const now = new Date().toISOString();
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { contactId },
      UpdateExpression: 'SET #status = :status, resolvedAt = :resolvedAt, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':resolvedAt': status === 'resolved' ? now : null,
        ':now': now,
      },
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes;
}

module.exports = { createContact, listContacts, updateStatus };
