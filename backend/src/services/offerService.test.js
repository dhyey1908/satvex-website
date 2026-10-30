// decorateOptions: per-piece price, "Save ₹X" and the coupon price, all
// computed server-side. The coupon lookup is stubbed through couponService.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const couponService = require('./couponService');
const { decorateOptions } = require('./offerService');

const product = {
  sellingOptions: [
    { id: 'o1', quantity: 1, price: 149, compareAtPrice: null, isActive: true },
    { id: 'o2', quantity: 2, price: 249, compareAtPrice: 299, isActive: true },
    { id: 'o3', quantity: 3, price: 349, compareAtPrice: null, isActive: true },
  ],
};

test('per-piece price and savings (compareAt wins, else vs. buying singles)', async () => {
  const out = await decorateOptions(product, null);
  const [o1, o2, o3] = out.sellingOptions.map((o) => o.offer);
  assert.equal(o1.perPiece, 149);
  assert.equal(o1.saveAmount, 0);
  assert.equal(o2.perPiece, 124.5);
  assert.equal(o2.saveAmount, 50); // 299 - 249
  assert.equal(o3.saveAmount, 98); // 149*3 - 349
  assert.equal(o3.couponCode, undefined);
});

test('a "buy 3, get 1 free" pack gets its label; packs with nothing free get none', async () => {
  const p = { sellingOptions: [
    { id: 'a', quantity: 4, freeQuantity: 1, price: 447, isActive: true },
    { id: 'b', quantity: 3, price: 349, isActive: true },
    { id: 'c', quantity: 3, freeQuantity: 3, price: 349, isActive: true },
  ] };
  const [a, b, c] = (await decorateOptions(p, null)).sellingOptions.map((o) => o.offer);
  assert.equal(a.freeLabel, 'Buy 3, get 1 free');
  assert.equal(a.freeQuantity, 1);
  assert.equal(a.paidQuantity, 3);
  assert.equal(a.perPiece, 111.75);
  assert.equal(b.freeLabel, undefined);
  assert.equal(c.freeLabel, undefined); // nothing left to pay for: ignored
});

test('coupon price appears only while the coupon is valid', async () => {
  const orig = couponService.findByCode;
  couponService.findByCode = async () => ({ code: 'SATVEX10', isActive: true, discountType: 'percentage', discountValue: 10, usageCount: 0 });
  let out = await decorateOptions(product, 'SATVEX10');
  assert.equal(out.sellingOptions[1].offer.couponCode, 'SATVEX10');
  assert.equal(out.sellingOptions[1].offer.priceAfterCoupon, 224.1);

  couponService.findByCode = async () => ({ code: 'SATVEX10', isActive: false });
  out = await decorateOptions(product, 'SATVEX10');
  assert.equal(out.sellingOptions[1].offer.couponCode, undefined);
  couponService.findByCode = orig;
});
