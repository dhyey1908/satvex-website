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
  // Dynamic, Shiprocket-rate-based shipping — see pricingService.js /
  // shippingRateService.js. fallbackFlatCharge keeps pricing working even
  // before Shiprocket is connected (shiprocket.enabled stays false until
  // then, so every quote uses this flat charge).
  shipping: {
    handlingMargin: 0,
    minCharge: 0,
    maxCharge: null,
    roundTo: 1,
    fallbackFlatCharge: 59,
    freeThreshold: 700,
    rateIncludesGst: false,
    rateIncludesCodCharge: false,
    courierSelectionRule: 'lowest_rate',
  },
  cod: { enabled: true, charge: 59, prepaidDiscountType: 'none', prepaidDiscountValue: 0 },
  // Sandbox keys must never be reachable by real customers — onlineEnabled
  // stays false until the live-cutover checklist is complete.
  // onlineTestUserIds lets specific accounts exercise the real Cashfree
  // sandbox flow while it's invisible to everyone else.
  payments: { onlineEnabled: false, onlineTestUserIds: [] },
  // Stays disabled (no real Shiprocket calls — neither rate quotes nor
  // shipment booking) until pickupPincode/pickupLocation are set and
  // enabled is flipped on. Do not turn on.
  shiprocket: {
    enabled: false,
    pickupPincode: '',
    pickupLocation: '',
    defaultPackage: { lengthCm: 10, breadthCm: 10, heightCm: 5, weightKg: 0.3 },
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
