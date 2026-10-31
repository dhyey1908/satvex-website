const test = require('node:test');
const assert = require('node:assert/strict');
const { couponStatus, chipCoupons } = require('./couponStatus');
const { couponSchema, couponUpdateSchema } = require('../validators/couponValidators');

const now = Date.parse('2026-10-31T12:00:00Z');
const base = { discountType: 'percentage', discountValue: 10, isActive: true, usageCount: 0, createdAt: '2026-10-01T00:00:00Z' };
const coupons = [
  { ...base, code: 'SATVEX10', showAsChip: true },
  { ...base, code: 'HIDDEN', showAsChip: false },
  { ...base, code: 'NOFLAG' }, // saved before the setting existed: not shown until the admin switches it on
  { ...base, code: 'OFF', showAsChip: true, isActive: false },
  { ...base, code: 'OLD', showAsChip: true, expiresAt: '2026-10-30T18:29:59Z' },
  { ...base, code: 'USEDUP', showAsChip: true, usageLimit: 5, usageCount: 5 },
  { ...base, code: 'FLAT100', showAsChip: true, discountType: 'flat', discountValue: 100, createdAt: '2026-10-02T00:00:00Z' },
  { ...base, code: 'LATER', showAsChip: true, expiresAt: '2026-12-31T18:29:59Z', createdAt: '2026-10-03T00:00:00Z' },
];

test('couponStatus: expired beats exhausted beats the active switch', () => {
  assert.equal(couponStatus(coupons[0], now), 'active');
  assert.equal(couponStatus(coupons[3], now), 'inactive');
  assert.equal(couponStatus(coupons[4], now), 'expired');
  assert.equal(couponStatus(coupons[5], now), 'exhausted');
});

test('chips: only coupons the admin switched on AND that can still be used today', () => {
  const chips = chipCoupons(coupons, now);
  assert.deepEqual(chips.map((c) => c.code), ['SATVEX10', 'FLAT100', 'LATER']);
  // switched off, never flagged, expired and used-up coupons never appear
  for (const hidden of ['HIDDEN', 'NOFLAG', 'OFF', 'OLD', 'USEDUP']) assert.equal(chips.some((c) => c.code === hidden), false, hidden);
});

test('chips carry a short discount label and keep the order the coupons were created in', () => {
  const chips = chipCoupons(coupons, now);
  assert.equal(chips[0].discountLabel, '10% off');
  assert.equal(chips[1].discountLabel, '₹100 off');
  assert.deepEqual(chipCoupons([], now), []);
});

test('the coupon form saves showAsChip (off by default) on create and on edit', () => {
  const create = { code: 'SATVEX10', discountType: 'percentage', discountValue: 10 };
  assert.equal(couponSchema.parse(create).showAsChip, false);
  assert.equal(couponSchema.parse({ ...create, showAsChip: true }).showAsChip, true);
  assert.equal(couponUpdateSchema.parse({ showAsChip: true }).showAsChip, true);
  assert.equal('showAsChip' in couponUpdateSchema.parse({ discountValue: 20 }), false); // an edit that does not mention it leaves it alone
  assert.equal(couponSchema.safeParse({ ...create, showAsChip: 'yes' }).success, false);
});
