const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkPrices } = require('./priceGuardService');
const { toPublicSettings } = require('./settingsService');
const { couponSchema } = require('../validators/couponValidators');

const limits = { minSellingPrice: 50, maxDiscountPercent: 90 };

test('a price below the minimum is flagged', () => {
  const w = checkPrices([{ id: 'a', name: 'Combo of 2', price: 2, compareAtPrice: 249 }], [], limits);
  assert.deepEqual(w.map((x) => x.reason), ['below_minimum', 'discount_too_deep']);
  assert.match(w[0].message, /₹2.*below the minimum of ₹50/);
});

test('more than 90% under the MRP is flagged even when above the minimum', () => {
  const w = checkPrices([{ id: 'a', name: 'Single', price: 60, compareAtPrice: 999 }], [], limits);
  assert.deepEqual(w.map((x) => x.reason), ['discount_too_deep']);
});

test('normal prices pass; exactly 90% off is allowed', () => {
  assert.deepEqual(checkPrices([{ id: 'a', name: 'x', price: 199, compareAtPrice: 349 }], [], limits), []);
  assert.deepEqual(checkPrices([{ id: 'a', name: 'x', price: 100, compareAtPrice: 1000 }], [], limits), []);
});

test('an unchanged price is not asked about again, a changed one is', () => {
  const stored = [{ id: 'a', name: 'Combo', price: 2, compareAtPrice: 249 }];
  assert.deepEqual(checkPrices([{ id: 'a', name: 'Combo', price: 2, compareAtPrice: 249 }], stored, limits), []);
  assert.equal(checkPrices([{ id: 'a', name: 'Combo', price: 3, compareAtPrice: 249 }], stored, limits).length > 0, true);
});

test('inactive options are not checked; limits are configurable', () => {
  assert.deepEqual(checkPrices([{ id: 'a', name: 'x', price: 1, isActive: false }], [], limits), []);
  assert.equal(checkPrices([{ id: 'a', name: 'x', price: 20 }], [], { minSellingPrice: 10 }).length, 0);
});

test('public settings are a whitelist: nothing internal can reach the browser', () => {
  const pub = toPublicSettings({
    brandName: 'Satvex', contactEmail: 'a@b.com', cod: { enabled: true, charge: 59, prepaidDiscountType: 'percentage' },
    tax: { enabled: true, percent: 18 }, shipping: { freeThreshold: 700, fallbackFlatCharge: 59, handlingMargin: 5 },
    notifications: { shipmentAlertEmail: 'owner@x.com' }, shiprocket: { pickupPincode: '360001', pickupLocation: 'Home' },
    payments: { onlineTestUserIds: ['u1'] }, finance: { paymentGatewayFeePercent: 2 }, reviews: { showUnverified: true },
    delivery: { enabledStates: ['Gujarat'] }, pricing: { minSellingPrice: 50 },
  });
  const flat = JSON.stringify(pub);
  for (const secret of ['owner@x.com', '360001', 'u1', 'paymentGatewayFeePercent', 'showUnverified', 'Gujarat', 'minSellingPrice', 'fallbackFlatCharge', 'prepaidDiscountType']) {
    assert.ok(!flat.includes(secret), `${secret} must not be public`);
  }
  assert.equal(pub.tax.pricesIncludeGst, true, 'default ON when missing');
  assert.equal(pub.shipping.freeThreshold, 700);
});

test('coupon: minimum order value is accepted; a flat discount must stay below it', () => {
  const base = { code: 'SAVE', discountType: 'flat', discountValue: 100, isActive: true, oneUsePerCustomer: false };
  assert.equal(couponSchema.safeParse({ ...base, minOrderValue: 500 }).success, true);
  assert.equal(couponSchema.safeParse({ ...base, minOrderValue: 100 }).success, false);
  assert.equal(couponSchema.safeParse({ ...base, minOrderValue: -5 }).success, false);
  assert.equal(couponSchema.safeParse({ ...base, discountType: 'percentage', discountValue: 10, minOrderValue: 50 }).success, true);
});
