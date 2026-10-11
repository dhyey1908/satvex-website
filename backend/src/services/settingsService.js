const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const couponService = require('./couponService');

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
  announcements: [],
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
  // onlineTestUserIds lets specific accounts exercise the real PayU test
  // flow while it's invisible to everyone else.
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
  // Off by default — see deliveryEligibilityService.js. While disabled,
  // every pincode is deliverable (current behavior, unchanged). Once an
  // admin turns it on, only states in enabledStates are deliverable; a
  // state not yet added is disabled by default.
  delivery: { enabled: false, enabledStates: [] },
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

// A coupon referenced by an announcement must actually be live right now —
// an announcement is never allowed to imply a discount exists just because
// an admin typed a code into it (see settingsValidators.js's
// announcementSchema comment). Mirrors the same fields pricingService's
// real checkout-time coupon validation looks at (isActive/expiresAt/
// usageLimit vs usageCount), but only as a display-time yes/no — the actual
// discount math still only ever happens for real at checkout.
async function isAnnouncementCouponValid(code) {
  if (!code) return true; // no coupon referenced — nothing to check
  const coupon = await couponService.findByCode(code);
  if (!coupon || !coupon.isActive) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return false;
  if (coupon.usageLimit && (coupon.usageCount || 0) >= coupon.usageLimit) return false;
  return true;
}

// Filters the admin's full announcements list down to what the public site
// should actually show: active, within its configured date schedule (if
// any), and — if it references a coupon — that coupon currently valid.
async function getActiveAnnouncements(announcements) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches schema
  const candidates = (announcements || []).filter((a) => {
    if (!a.isActive) return false;
    if (a.startDate && today < a.startDate) return false;
    if (a.endDate && today > a.endDate) return false;
    return true;
  });
  const checked = await Promise.all(
    candidates.map(async (a) => ((await isAnnouncementCouponValid(a.couponCode)) ? a : null))
  );
  return checked.filter(Boolean);
}

module.exports = { getSettings, updateSettings, getActiveAnnouncements, isAnnouncementCouponValid };
