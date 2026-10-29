const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const settingsService = require('./settingsService');
const couponService = require('./couponService');
const deliveryEligibilityService = require('./deliveryEligibilityService');
const { calculateTotals, buildPrepaidOffer } = require('./pricingService');

const originalGetSettings = settingsService.getSettings;
const originalFindByCode = couponService.findByCode;
const originalAssertDeliverable = deliveryEligibilityService.assertDeliverable;

// Shiprocket disabled -> shippingRateService always returns the flat
// fallback charge (already covered in depth by shippingRateService.test.js)
// so these tests focus purely on calculateTotals' own order-of-operations,
// free-shipping threshold, and COD/prepaid-discount logic.
function stubSettings(overrides = {}) {
  settingsService.getSettings = async () => ({
    // These tests describe the GST-on-top mode; the default (flag missing) is inclusive - see the
    // "default" test at the bottom.
    tax: { enabled: true, percent: 18, pricesIncludeGst: false, ...overrides.tax },
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
  deliveryEligibilityService.assertDeliverable = originalAssertDeliverable;
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

test('a delivery pincode is checked against deliveryEligibilityService before any shipping-rate call, and blocks the whole quote on rejection', async () => {
  stubSettings();
  let checkedPincode = null;
  deliveryEligibilityService.assertDeliverable = async (pincode) => {
    checkedPincode = pincode;
    const AppError = require('../utils/AppError');
    throw new AppError("Sorry, we don't currently deliver to Kerala.", 400, 'PINCODE_NOT_SERVICEABLE');
  };
  await assert.rejects(
    () => calculateTotals({ items: comboItems(1), paymentMethod: 'COD', deliveryPincode: '682001' }),
    (err) => {
      assert.equal(err.code, 'PINCODE_NOT_SERVICEABLE');
      return true;
    }
  );
  assert.equal(checkedPincode, '682001');
  deliveryEligibilityService.assertDeliverable = originalAssertDeliverable;
});

test('no deliveryPincode (e.g. cart-page preview before an address is chosen) never triggers a delivery-eligibility check', async () => {
  stubSettings();
  let called = false;
  deliveryEligibilityService.assertDeliverable = async () => {
    called = true;
  };
  await calculateTotals({ items: comboItems(1), paymentMethod: 'COD' });
  assert.equal(called, false);
  deliveryEligibilityService.assertDeliverable = originalAssertDeliverable;
});

test('optional prepaid discount reduces the total only on Online payment, never on COD', async () => {
  stubSettings({ cod: { prepaidDiscountType: 'flat', prepaidDiscountValue: 20 } });
  const online = await calculateTotals({ items: comboItems(1), paymentMethod: 'Online' });
  assert.equal(online.prepaidDiscount, 20);
  const cod = await calculateTotals({ items: comboItems(1), paymentMethod: 'COD' });
  assert.equal(cod.prepaidDiscount, 0);
});

// ---- buildPrepaidOffer: the "pay online and save" figure the checkout shows ----

test('buildPrepaidOffer: saving is the full total difference (COD charge + prepaid discount)', () => {
  const offer = buildPrepaidOffer(
    { total: 478.64, codCharge: 59, prepaidDiscount: 0 },
    { total: 409.64, codCharge: 0, prepaidDiscount: 10 }
  );
  assert.equal(offer.savings, 69);
  assert.equal(offer.codCharge, 59);
  assert.equal(offer.prepaidDiscount, 10);
  assert.equal(offer.codTotal, 478.64);
  assert.equal(offer.onlineTotal, 409.64);
});

test('buildPrepaidOffer: never reports a negative saving when prepaid is not cheaper', () => {
  const offer = buildPrepaidOffer(
    { total: 400, codCharge: 0, prepaidDiscount: 0 },
    { total: 400, codCharge: 0, prepaidDiscount: 0 }
  );
  assert.equal(offer.savings, 0);
  const worse = buildPrepaidOffer({ total: 400, codCharge: 0 }, { total: 410, codCharge: 0, prepaidDiscount: 0 });
  assert.equal(worse.savings, 0);
});

test('buildPrepaidOffer: rounds to paise', () => {
  const offer = buildPrepaidOffer({ total: 100.3, codCharge: 0 }, { total: 100.1, codCharge: 0, prepaidDiscount: 0 });
  assert.equal(offer.savings, 0.2);
});

// ---- integer-paise maths and PRICES_INCLUDE_GST -------------------------------

test('totals are exact to the paisa (no float noise like 175.82000000000002)', async () => {
  stubSettings();
  // 2 x 87.91 = 175.82; GST 18% = 31.6476 -> 31.65 (rounded once); free shipping is not reached
  const totals = await calculateTotals({ items: [{ subtotal: 175.82 }], paymentMethod: 'Online' });
  assert.equal(totals.subtotal, 175.82);
  assert.equal(totals.gstAmount, 31.65);
  assert.equal(totals.total, 266.47); // 175.82 + 31.65 + 59
  for (const v of [totals.subtotal, totals.gstAmount, totals.shipping, totals.total]) {
    assert.equal(String(v), Number(v).toFixed(2).replace(/\.?0+$/, ''), `${v} has more than 2 decimals`);
  }
});

test('many small lines add up without drift', async () => {
  stubSettings();
  const items = Array.from({ length: 10 }, () => ({ subtotal: 19.99 }));
  const totals = await calculateTotals({ items, paymentMethod: 'Online' });
  assert.equal(totals.subtotal, 199.9);
  assert.equal(totals.gstAmount, 35.98); // 35.982
});

test('PRICES_INCLUDE_GST: GST is the part inside the price; nothing is added on top', async () => {
  stubSettings();
  settingsService.getSettings = ((orig) => async () => ({ ...(await orig()), tax: { enabled: true, percent: 18, pricesIncludeGst: true } }))(settingsService.getSettings);
  const totals = await calculateTotals({ items: [{ subtotal: 708 }], paymentMethod: 'Online' });
  assert.equal(totals.pricesIncludeGst, true);
  assert.equal(totals.gstAmount, 108); // 708 * 18 / 118
  assert.equal(totals.taxableAmount, 600);
  assert.equal(totals.qualifiesForFreeShipping, true); // 708 >= 700, the listed price is the product total
  assert.equal(totals.total, 708); // not 835.44
});

test('PRICES_INCLUDE_GST explicitly off: GST is added on top', async () => {
  stubSettings();
  const totals = await calculateTotals({ items: [{ subtotal: 600 }], paymentMethod: 'Online' });
  assert.equal(totals.pricesIncludeGst, false);
  assert.equal(totals.gstAmount, 108);
  assert.equal(totals.total, 708);
});

test('savingsAmount = MRP markdown on every pack + coupon discount, computed server-side', async () => {
  stubSettings();
  couponService.findByCode = async () => ({ code: 'SAVE10', isActive: true, discountType: 'percentage', discountValue: 10, usageCount: 0 });
  const items = [{ subtotal: 498, unitPrice: 249, compareAtPrice: 299, quantity: 2 }];
  const totals = await calculateTotals({ items, paymentMethod: 'Online', couponCode: 'SAVE10' });
  assert.equal(totals.productSavings, 100); // (299-249) x 2
  assert.equal(totals.discountAmount, 49.8);
  assert.equal(totals.savingsAmount, 149.8);
});

test('default: with no pricesIncludeGst flag stored, prices are GST-inclusive (default ON)', async () => {
  stubSettings({ tax: { pricesIncludeGst: undefined } });
  const totals = await calculateTotals({ items: [{ subtotal: 708 }], paymentMethod: 'Online' });
  assert.equal(totals.pricesIncludeGst, true);
  assert.equal(totals.gstAmount, 108);
  assert.equal(totals.total, 708);
});

test('coupon minimum order value is enforced on the server', async () => {
  stubSettings();
  couponService.findByCode = async () => ({ code: 'BIG', isActive: true, discountType: 'flat', discountValue: 50, minOrderValue: 500, usageCount: 0 });
  await assert.rejects(
    () => calculateTotals({ items: [{ subtotal: 499 }], paymentMethod: 'Online', couponCode: 'BIG' }),
    (e) => e.code === 'COUPON_MIN_ORDER' && /Add ₹1\.00 more/.test(e.message)
  );
  const ok = await calculateTotals({ items: [{ subtotal: 500 }], paymentMethod: 'Online', couponCode: 'BIG' });
  assert.equal(ok.discountAmount, 50);
});

test('a flat coupon bigger than the order can never make the total negative', async () => {
  stubSettings();
  couponService.findByCode = async () => ({ code: 'HUGE', isActive: true, discountType: 'flat', discountValue: 5000, usageCount: 0 });
  const totals = await calculateTotals({ items: [{ subtotal: 100 }], paymentMethod: 'Online', couponCode: 'HUGE' });
  assert.equal(totals.discountAmount, 100); // capped at the subtotal
  assert.equal(totals.taxableAmount, 0);
  assert.ok(totals.total >= 0, `total ${totals.total} must not be negative`);
});
