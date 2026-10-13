const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

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
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  return (result.Items || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

module.exports = { createContact, listContacts };
