const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.contacts;

async function createContact({ name, email, phone, message }) {
  const contact = {
    contactId: uuid(),
    name,
    email,
    phone: phone || null,
    message,
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: contact }));
  return contact;
}

// Contact volume is expected to stay low; a Scan avoids an index for a rarely-listed admin view.
async function listContacts() {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  return (result.Items || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

module.exports = { createContact, listContacts };
