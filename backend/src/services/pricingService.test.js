const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveShippingTierCharge } = require('./pricingService');

const TIERS = [
  { minSubtotal: 0, maxSubtotal: 399.99, charge: 59 },
  { minSubtotal: 400, maxSubtotal: 599.99, charge: 39 },
  { minSubtotal: 600, maxSubtotal: null, charge: 0 },
];

test('charges the lowest tier under 400', () => {
  assert.equal(resolveShippingTierCharge(TIERS, 0), 59);
  assert.equal(resolveShippingTierCharge(TIERS, 399.99), 59);
});

test('charges the middle tier for 400-599', () => {
  assert.equal(resolveShippingTierCharge(TIERS, 400), 39);
  assert.equal(resolveShippingTierCharge(TIERS, 599.99), 39);
});

test('is free at 600 and above, including an open-ended high subtotal', () => {
  assert.equal(resolveShippingTierCharge(TIERS, 600), 0);
  assert.equal(resolveShippingTierCharge(TIERS, 1_000_000), 0);
});

test('falls back to 0 for missing or empty tiers rather than throwing', () => {
  assert.equal(resolveShippingTierCharge(undefined, 100), 0);
  assert.equal(resolveShippingTierCharge([], 100), 0);
});
