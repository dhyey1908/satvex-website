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
  pinterestUrl: '',
  brandName: 'Satvex',
  logoUrl: '',
  heroBanners: [],
  announcements: [],
  authImage: '',
  aboutImage: '',
  // pricesIncludeGst (the PRICES_INCLUDE_GST flag): false = GST is added on top of
  // the listed price (current behaviour); true = listed prices already include it.
  // "Prices include GST" (default ON): listed prices already contain GST, so the
  // storefront/cart show them as inclusive and GST is a breakup INSIDE the price,
  // not added on top. Turn off to add GST on top of listed prices.
  tax: { enabled: true, percent: 18, pricesIncludeGst: true },
  // Guardrails when saving a product's prices (admin asks "Are you sure?").
  pricing: { minSellingPrice: 50, maxDiscountPercent: 90 },
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
  // Where the "a shipment sync job exhausted all retries" alert (see
  // shipmentSweep.js) is sent. Admin-editable in Settings; defaults to the
  // team inbox so the alert has somewhere to go even before anyone sets it
  // explicitly.
  notifications: { shipmentAlertEmail: 'satvexproducts.team@gmail.com' },
  // Admin-only assumptions behind the Financial Analytics profit figures —
  // stripped from the public settings endpoint (see settingsRoutes.js).
  // paymentGatewayFeePercent: PayU's effective fee as a % of the order
  // total. null = not set, so fees show as "unavailable" rather than an
  // invented number.
  finance: { paymentGatewayFeePercent: null },
  // Storefront review display. showUnverified=false (default) shows ONLY
  // reviews stamped verifiedPurchase (written after a real delivered order);
  // anything else in the table (imported/seeded rows) stays hidden and out of
  // the average. Flip to true only if every stored review is genuine.
  reviews: { showUnverified: false },
  whyPillars: [
    { title: 'Flexible', description: 'Moves comfortably with your everyday needs.' },
    { title: 'Comfortable', description: 'Lightweight designs created for effortless everyday use.' },
    { title: 'Durable', description: 'Made to deliver dependable performance and lasting usability.' },
    { title: 'Stylish', description: 'Modern aesthetics designed for today’s women.' },
  ],
};

// An older settings record has no flag at all: that means ON (the default), only an
// explicit false turns it off.
function pricesIncludeGst(settings) {
  return settings?.tax?.pricesIncludeGst !== false;
}

// The ONLY settings a visitor's browser receives. A whitelist (not "everything
// except a few secrets"), so a field added later - shipment alert email,
// Shiprocket pickup details, payment test users, finance assumptions - can never
// leak to the public by default.
// Today's date in India (YYYY-MM-DD). Schedules are entered as IST calendar days, so
// "ends 21 Oct" must stop showing at midnight IST, not at 5:30am the next day (UTC).
const istToday = (now = Date.now()) => new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const inSchedule = (item, today) => !(item.startDate && today < item.startDate) && !(item.endDate && today > item.endDate);

// Banners the public site should show: switched on and inside their schedule.
function activeBanners(banners, now) {
  const today = istToday(now);
  return (banners || []).filter((b) => b.isActive !== false && inSchedule(b, today));
}

function toPublicSettings(settings) {
  const s = settings || {};
  return {
    brandName: s.brandName,
    logoUrl: s.logoUrl,
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    instagramUrl: s.instagramUrl,
    pinterestUrl: s.pinterestUrl,
    heroBanners: activeBanners(s.heroBanners),
    authImage: s.authImage,
    aboutImage: s.aboutImage,
    whyPillars: s.whyPillars,
    cod: { enabled: Boolean(s.cod?.enabled), charge: s.cod?.charge },
    tax: { enabled: Boolean(s.tax?.enabled), percent: s.tax?.percent, pricesIncludeGst: pricesIncludeGst(s) },
    shipping: { freeThreshold: s.shipping?.freeThreshold },
  };
}

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
  const today = istToday(); // YYYY-MM-DD, matches schema
  const candidates = (announcements || []).filter((a) => a.isActive && inSchedule(a, today));
  const checked = await Promise.all(
    candidates.map(async (a) => ((await isAnnouncementCouponValid(a.couponCode)) ? a : null))
  );
  return checked.filter(Boolean);
}

module.exports = { istToday, activeBanners, pricesIncludeGst, toPublicSettings, getSettings, updateSettings, getActiveAnnouncements, isAnnouncementCouponValid };
