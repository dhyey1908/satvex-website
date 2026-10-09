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
  // Store-wide subtotal tiers — see settingsValidators.js's shippingTierSchema
  // for how a tier is matched. Approved values: <₹400 = ₹59, ₹400-599 = ₹39,
  // ₹600+ = free.
  shipping: {
    enabled: true,
    tiers: [
      { minSubtotal: 0, maxSubtotal: 399.99, charge: 59 },
      { minSubtotal: 400, maxSubtotal: 599.99, charge: 39 },
      { minSubtotal: 600, maxSubtotal: null, charge: 0 },
    ],
  },
  cod: { enabled: true, charge: 59 },
  // Sandbox keys must never be reachable by real customers — onlineEnabled
  // stays false until the live-cutover checklist is complete.
  // onlineTestUserIds lets specific accounts exercise the real Cashfree
  // sandbox flow while it's invisible to everyone else.
  // gokwikEnabled/gokwikTestUserIds mirror the same pattern for the GoKwik
  // sandbox integration — stays false until GoKwik confirms the open
  // questions in gokwik_integration_notes.md.
  payments: { onlineEnabled: false, onlineTestUserIds: [], gokwikEnabled: false, gokwikTestUserIds: [] },
  // Real Shiprocket account (no sandbox) — stays disabled until pickupLocation
  // is set to a real pickup address nickname and verified end-to-end.
  shiprocket: {
    enabled: false,
    pickupLocation: '',
    defaultPackage: { lengthCm: 10, breadthCm: 10, heightCm: 5, weightKg: 0.2 },
  },
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
