const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.settings;
const SETTINGS_ID = 'global';

const DEFAULT_SETTINGS = {
  settingsId: SETTINGS_ID,
  contactPhone: '',
  contactEmail: '',
  instagramUrl: '',
  brandName: 'Satvex',
  logoUrl: '',
  heroBanners: [],
  authImage: '',
  aboutImage: '',
  tax: { enabled: true, percent: 18 },
  shipping: { enabled: true, charge: 50, freeThreshold: 999 },
  cod: { enabled: true, charge: 40 },
  // Sandbox keys must never be reachable by real customers — onlineEnabled
  // stays false until the live-cutover checklist is complete.
  // onlineTestUserIds lets specific accounts exercise the real Cashfree
  // sandbox flow while it's invisible to everyone else.
  // gokwikEnabled/gokwikTestUserIds mirror the same pattern for the GoKwik
  // sandbox integration — stays false until GoKwik confirms the open
  // questions in gokwik_integration_notes.md.
  payments: { onlineEnabled: false, onlineTestUserIds: [], gokwikEnabled: false, gokwikTestUserIds: [] },
  whyPillars: [
    { title: 'Flexible', description: 'Moves comfortably with your everyday needs.' },
    { title: 'Comfortable', description: 'Lightweight designs created for effortless everyday use.' },
    { title: 'Durable', description: 'Made to deliver dependable performance and lasting usability.' },
    { title: 'Stylish', description: 'Modern aesthetics designed for today’s women.' },
  ],
};

async function getSettings() {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { settingsId: SETTINGS_ID } }));
  return result.Item ? { ...DEFAULT_SETTINGS, ...result.Item } : DEFAULT_SETTINGS;
}

async function updateSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial, settingsId: SETTINGS_ID, updatedAt: new Date().toISOString() };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

module.exports = { getSettings, updateSettings };
