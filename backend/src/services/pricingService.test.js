const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const settingsService = require('./settingsService');
const couponService = require('./couponService');
const { calculateTotals } = require('./pricingService');

const originalGetSettings = settingsService.getSettings;
const originalFindByCode = couponService.findByCode;

// Shiprocket disabled -> shippingRateService always returns the flat
// fallback charge (already covered in depth by shippingRateService.test.js)
// so these tests focus purely on calculateTotals' own order-of-operations,
// free-shipping threshold, and COD/prepaid-discount logic.
function stubSettings(overrides = {}) {
  settingsService.getSettings = async () => ({
    tax: { enabled: true, percent: 18 },
    shipping: {
      fallbackFlatCharge: 59,
      freeThreshold: 700,
      rateIncludesCodCharge: false,
      ...overrides.shipping,
    },
    cod: { enabled: true, charge: 59, prepaidDiscountType: 'none', prepaidDiscountValue: 0, ...overrides.cod },
    shiprocket: { enabled: false, pickupPincode: '', ...overrides.shiprocket },
  });
}

after(() => {
  settingsService.getSettings = originalGetSettings;
  couponService.findByCode = originalFindByCode;
});

// One combo's subtotal, chosen so subtotal * 1.18 (default GST) matches the
// spec's own worked examples exactly (3 combos = Rs 708, 2 combos = Rs 472).
const COMBO_SUBTOTAL = 200;
function comboItems(count) {
  return Array.from({ length: count }, () => ({ subtotal: COMBO_SUBTOTAL }));
}

test('1 combo, COD: below threshold, pays fallback shipping + COD fee', async () => {
  stubSettings();
  const totals = await calculateTotals({ items: comboItems(1), paymentMethod: 'COD' });
  assert.equal(totals.taxableAmount, 200);
  assert.equal(totals.gstAmount, 36);
  assert.equal(totals.qualifiesForFreeShipping, false);
  assert.equal(totals.shipping, 59);
  assert.equal(totals.codCharge, 59);
  assert.equal(totals.total, 200 + 36 + 59 + 59);
});

test('2 combos (Rs 472), COD: still below Rs 700 threshold, pays shipping', async () => {
  stubSettings();
  const totals = await calculateTotals({ items: comboItems(2), paymentMethod: 'COD' });
  assert.equal(totals.taxableAmount + totals.gstAmount, 472);
  assert.equal(totals.qualifiesForFreeShipping, false);
  assert.equal(totals.shipping, 59);
});

test('3 combos (Rs 708), COD: at/above Rs 700 threshold, free shipping, COD fee still applies', async () => {
  stubSettings();
  const totals = await calculateTotals({ items: comboItems(3), paymentMethod: 'COD' });
  assert.equal(totals.taxableAmount + totals.gstAmount, 708);
  assert.equal(totals.qualifiesForFreeShipping, true);
  assert.equal(totals.shipping, 0);
  assert.equal(totals.codCharge, 59, 'COD fee applies even when shipping is free');
});

test('exact Rs 700 boundary: 699.99 pays, 700 is free, 700.01 is free', async () => {
  // GST off so taxableAmount + gstAmount === subtotal exactly — isolates
  // the boundary comparison from any GST rounding.
  settingsService.getSettings = async () => ({
    tax: { enabled: false, percent: 0 },
    shipping: { fallbackFlatCharge: 59, freeThreshold: 700, rateIncludesCodCharge: false },
    cod: { enabled: true, charge: 59, prepaidDiscountType: 'none', prepaidDiscountValue: 0 },
    shiprocket: { enabled: false, pickupPincode: '' },
  });
  const just_below = await calculateTotals({ items: [{ subtotal: 699.99 }], paymentMethod: 'Online' });
  assert.equal(just_below.qualifiesForFreeShipping, false);
  assert.equal(just_below.shipping, 59);

  const exact = await calculateTotals({ items: [{ subtotal: 700 }], paymentMethod: 'Online' });
  assert.equal(exact.qualifiesForFreeShipping, true);
  assert.equal(exact.shipping, 0);

  const just_above = await calculateTotals({ items: [{ subtotal: 700.01 }], paymentMethod: 'Online' });
  assert.equal(just_above.qualifiesForFreeShipping, true);
  assert.equal(just_above.shipping, 0);
});

test('COD fee is 0 on Online/prepaid orders', async () => {
  stubSettings();
  const totals = await calculateTotals({ items: comboItems(1), paymentMethod: 'Online' });
  assert.equal(totals.codCharge, 0);
});

test('COD fee is never added twice when rateIncludesCodCharge is true but the quote came from the fallback (not Shiprocket)', async () => {
  // Shiprocket disabled -> shippingSource is 'fallback', never 'shiprocket',
  // so the rateIncludesCodCharge skip must NOT kick in here — the flat COD
  // fee must still apply exactly once.
  stubSettings({ shipping: { rateIncludesCodCharge: true } });
  const totals = await calculateTotals({ items: comboItems(1), paymentMethod: 'COD' });
  assert.equal(totals.shippingSource, 'fallback');
  assert.equal(totals.codCharge, 59);
});

test('coupon discount is applied before the free-shipping threshold check (an edge case: discount drops order below the threshold)', async () => {
  stubSettings();
  couponService.findByCode = async () => ({
    code: 'DROP100',
    isActive: true,
    discountType: 'flat',
    discountValue: 100,
    expiresAt: null,
    usageLimit: null,
    usageCount: 0,
    oneUsePerCustomer: false,
  });
  // 3 combos = Rs 708 after GST (normally free) minus a flat Rs 100 coupon
  // brings it to Rs 608 after GST -> below threshold -> shipping charged.
  const totals = await calculateTotals({ items: comboItems(3), couponCode: 'DROP100', paymentMethod: 'COD' });
  assert.equal(totals.discountAmount, 100);
  assert.equal(totals.taxableAmount, 500); // 600 - 100
  assert.equal(totals.qualifiesForFreeShipping, false);
  assert.equal(totals.shipping, 59);
});

test('rounding mode is honored when a real Shiprocket quote is used (nearest 5)', async () => {
  const shiprocketService = require('./shiprocketService');
  const original = shiprocketService.getServiceability;
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 57 }];
  stubSettings({
    shiprocket: { enabled: true, pickupPincode: '360001' },
    shipping: { rateIncludesGst: true, roundTo: 5, freeThreshold: 0 },
  });
  const totals = await calculateTotals({ items: comboItems(1), paymentMethod: 'COD', deliveryPincode: '400001' });
  assert.equal(totals.shipping, 55);
  assert.equal(totals.shippingSource, 'shiprocket');
  shiprocketService.getServiceability = original;
});

test('optional prepaid discount reduces the total only on Online payment, never on COD', async () => {
  stubSettings({ cod: { prepaidDiscountType: 'flat', prepaidDiscountValue: 20 } });
  const online = await calculateTotals({ items: comboItems(1), paymentMethod: 'Online' });
  assert.equal(online.prepaidDiscount, 20);
  const cod = await calculateTotals({ items: comboItems(1), paymentMethod: 'COD' });
  assert.equal(cod.prepaidDiscount, 0);
});
