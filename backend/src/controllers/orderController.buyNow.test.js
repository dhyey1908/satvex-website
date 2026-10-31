// "Buy Now" = a separate, one-item checkout. The bag must never be read, charged or changed by it.
//  - session: a signed token holding only the selection; bound to the customer; expires; cannot be edited
//  - quote / checkout with a session price and order ONLY that item
//  - a Buy Now order leaves the bag exactly as it was (a normal bag checkout still empties it)
// Same monkey-patching style as the other controller tests - no mock library.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const cartService = require('../services/cartService');
const pricingService = require('../services/pricingService');
const settingsService = require('../services/settingsService');
const orderService = require('../services/orderService');
const deliveryEligibilityService = require('../services/deliveryEligibilityService');
const directCheckoutService = require('../services/directCheckoutService');
const { verifyAccessToken, signAccessToken } = require('../utils/jwt');
const orderController = require('./orderController');

const originals = [cartService, pricingService, settingsService, orderService, deliveryEligibilityService].map((m) => [m, { ...m }]);
after(() => originals.forEach(([m, o]) => Object.assign(m, o)));

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (p) => ((res.body = p), res);
  return res;
}

// the bag holds a Combo of 2 (x1); Buy Now is a Combo of 3
const BAG = [{ cartItemId: 'c1', productId: 'p1', sellingOptionId: 'combo2', selectedColors: ['pink', 'lav'], quantity: 1, savedForLater: false }];
const PACKS = { combo2: { name: 'Combo of 2', price: 249 }, combo3: { name: 'Combo of 3', price: 349 } };

let created;
let bagReads;
let bagCleared;
let priced;

beforeEach(() => {
  created = [];
  bagReads = 0;
  bagCleared = false;
  priced = [];
  settingsService.getSettings = async () => ({ payments: { onlineEnabled: true, onlineTestUserIds: [] } });
  cartService.getCartForUser = async () => {
    bagReads += 1;
    return BAG;
  };
  cartService.clearCart = async () => {
    bagCleared = true;
  };
  pricingService.resolveLineItem = async ({ productId, sellingOptionId, selectedColors }) => ({
    productId,
    productName: 'Clip',
    sellingOptionId,
    sellingOptionName: PACKS[sellingOptionId].name,
    selectedColors,
    unitPrice: PACKS[sellingOptionId].price,
  });
  pricingService.calculateTotals = async ({ items }) => {
    priced.push(items);
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    return { subtotal, total: subtotal, paymentMethod: 'COD', codCharge: 0, shipping: 0, gstAmount: 0, gstPercent: 0 };
  };
  deliveryEligibilityService.isDeliverable = async () => ({ deliverable: true, state: 'Gujarat' });
  orderService.createOrder = async (o) => {
    created.push(o);
    return { ...o, orderId: 'ORDER-X', status: 'Pending' };
  };
});

const select = (over = {}) => ({ productId: 'p1', sellingOptionId: 'combo3', selectedColors: ['pink', 'lav', 'blue'], quantity: 1, ...over });
const ctx = (body) => ({ body, user: { id: 'U1' }, protocol: 'https', get: () => 'api.test' });
const checkoutBody = (over = {}) => ({
  customer: { name: 'Jane Doe', phone: '9876543210' },
  address: { line1: '12 Test Heights', city: 'Rajkot', state: 'Gujarat', pincode: '360004', country: 'India' },
  paymentMethod: 'COD',
  ...over,
});

async function startBuyNow(over) {
  const res = fakeRes();
  await orderController.createDirectSession(ctx(select(over)), res);
  return res.body.data ? res.body.data.session : res.body.session;
}

test('starting Buy Now returns a session and does NOT touch the bag', async () => {
  const res = fakeRes();
  await orderController.createDirectSession(ctx(select()), res);
  assert.equal(res.statusCode, 201);
  assert.ok((res.body.data || res.body).session);
  assert.equal(bagReads, 0, 'the bag is not read');
  assert.equal(bagCleared, false, 'the bag is not changed');
});

test('starting Buy Now checks the selection like adding to the bag would (bad pack / colours are refused)', async () => {
  pricingService.resolveLineItem = async () => {
    throw Object.assign(new Error('Select exactly 3 color(s) for "Combo of 3".'), { statusCode: 400, code: 'INVALID_COLOR_SELECTION', isAppError: true });
  };
  await assert.rejects(() => orderController.createDirectSession(ctx(select({ selectedColors: ['pink'] })), fakeRes()), /Select exactly 3/);
  await assert.rejects(() => orderController.createDirectSession(ctx({ productId: 'p1' }), fakeRes())); // invalid body
});

test('bag has Combo of 2 -> Buy Now Combo of 3: the quote shows ONLY the Combo of 3', async () => {
  const session = await startBuyNow();
  const res = fakeRes();
  await orderController.quote(ctx({ paymentMethod: 'COD', directSession: session }), res);
  const body = res.body.data || res.body;
  assert.deepEqual(body.items.map((i) => i.sellingOptionName), ['Combo of 3']);
  assert.equal(body.subtotal, 349, 'priced on the Buy Now item only, not 249 + 349');
  assert.equal(bagReads, 0, 'the bag is never read for a Buy Now quote');
  assert.equal(priced.length >= 1 && priced.every((items) => items.length === 1 && items[0].sellingOptionName === 'Combo of 3'), true, 'coupon, shipping, COD fee and GST are all computed on that one item');
});

test('the same quote without a session is the bag, as before', async () => {
  const res = fakeRes();
  await orderController.quote(ctx({ paymentMethod: 'COD' }), res);
  assert.deepEqual((res.body.data || res.body).items.map((i) => i.sellingOptionName), ['Combo of 2']);
  assert.equal(bagReads, 1);
});

test('Buy Now quantity is honoured and priced on that item', async () => {
  const session = await startBuyNow({ quantity: 3 });
  const res = fakeRes();
  await orderController.quote(ctx({ paymentMethod: 'COD', directSession: session }), res);
  const body = res.body.data || res.body;
  assert.equal(body.items[0].quantity, 3);
  assert.equal(body.subtotal, 349 * 3);
});

test('placing a Buy Now order: the order holds ONLY the Buy Now item and the bag is left exactly as it was', async () => {
  const session = await startBuyNow();
  const res = fakeRes();
  await orderController.checkout(ctx(checkoutBody({ directSession: session })), res);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].items.map((i) => i.sellingOptionName), ['Combo of 3']);
  assert.equal(bagReads, 0, 'the order is never built from the bag');
  assert.equal(bagCleared, false, 'the bag still has the Combo of 2');
});

test('a normal bag checkout still uses the bag and empties it', async () => {
  const res = fakeRes();
  await orderController.checkout(ctx(checkoutBody()), res);
  assert.deepEqual(created[0].items.map((i) => i.sellingOptionName), ['Combo of 2']);
  assert.equal(bagCleared, true);
});

test('a session cannot be used by another customer, edited, or after it has expired', async () => {
  const session = await startBuyNow();
  // someone else
  await assert.rejects(() => orderController.resolveOrderItems('U2', session), (e) => e.code === 'DIRECT_SESSION_INVALID');
  // edited (re-signed with another secret / changed payload)
  const forged = jwt.sign({ typ: 'direct', uid: 'U1', item: { ...select(), sellingOptionId: 'combo2' } }, 'not-the-real-secret', { expiresIn: '2h' });
  await assert.rejects(() => orderController.resolveOrderItems('U1', forged), (e) => e.code === 'DIRECT_SESSION_INVALID');
  // expired
  const old = jwt.sign({ typ: 'direct', uid: 'U1', item: select() }, env.jwt.secret, { expiresIn: -10 });
  await assert.rejects(() => orderController.resolveOrderItems('U1', old), (e) => e.code === 'DIRECT_SESSION_EXPIRED');
  // junk
  await assert.rejects(() => orderController.resolveOrderItems('U1', 'abc'), (e) => e.code === 'DIRECT_SESSION_INVALID');
  assert.equal(bagReads, 0);
});

test('a Buy Now session is not an access token, and an access token is not a Buy Now session', async () => {
  const session = directCheckoutService.createSession('U1', select());
  assert.throws(() => verifyAccessToken(session));
  assert.throws(() => directCheckoutService.readSession(signAccessToken({ id: 'U1' }), 'U1'));
});

test('the session holds the selection only, never a price', async () => {
  const session = directCheckoutService.createSession('U1', select({ quantity: 2 }));
  const payload = jwt.decode(session);
  assert.deepEqual(Object.keys(payload.item).sort(), ['productId', 'quantity', 'selectedColors', 'sellingOptionId']);
  assert.ok(payload.exp - payload.iat <= 2 * 60 * 60);
});

// ---- coupons on a Buy Now checkout: the code is checked against the one Buy Now item, not the bag
const couponController = require('./couponController');
const couponPricing = { validateCoupon: pricingService.validateCoupon };

test('coupon on a Buy Now checkout works even when the bag is empty (it used to answer "Your cart is empty")', async () => {
  const session = await startBuyNow(); // Combo of 3 = 349
  cartService.getCartForUser = async () => {
    bagReads += 1;
    return [];
  };
  const seen = [];
  pricingService.validateCoupon = async (code, subtotal) => {
    seen.push([code, subtotal]);
    return { code, discountAmount: 34.9 };
  };
  const res = fakeRes();
  await couponController.applyToCart(ctx({ code: 'SATVEX10', directSession: session }), res);
  assert.deepEqual(seen, [['SATVEX10', 349]], 'priced on the Buy Now item only');
  assert.equal((res.body.data || res.body).subtotal, 349);
  assert.equal(bagReads, 0, 'the bag is not read at all');
  pricingService.validateCoupon = couponPricing.validateCoupon;
});

test('coupon on a Buy Now checkout ignores what is in the bag (Combo of 2 = 249 is not added in)', async () => {
  const session = await startBuyNow();
  pricingService.validateCoupon = async (code, subtotal) => ({ code, discountAmount: subtotal / 10 });
  const res = fakeRes();
  await couponController.applyToCart(ctx({ code: 'SATVEX10', directSession: session }), res);
  assert.equal((res.body.data || res.body).subtotal, 349);
  assert.equal((res.body.data || res.body).discountAmount, 34.9);
  assert.equal(bagReads, 0);
  pricingService.validateCoupon = couponPricing.validateCoupon;
});

test('coupon from the bag page still checks the bag (no session)', async () => {
  const seen = [];
  pricingService.validateCoupon = async (code, subtotal) => {
    seen.push(subtotal);
    return { code, discountAmount: 1 };
  };
  const bagWithTotals = [{ ...BAG[0], subtotal: 249 }];
  cartService.getCartForUser = async () => bagWithTotals;
  const res = fakeRes();
  await couponController.applyToCart(ctx({ code: 'SATVEX10' }), res);
  assert.deepEqual(seen, [249]);
  // and an empty bag is still refused
  cartService.getCartForUser = async () => [];
  await assert.rejects(() => couponController.applyToCart(ctx({ code: 'SATVEX10' }), fakeRes()), (e) => e.code === 'CART_EMPTY');
  pricingService.validateCoupon = couponPricing.validateCoupon;
});

test('a coupon cannot be priced on somebody else\'s or an expired Buy Now session', async () => {
  const session = await startBuyNow();
  await assert.rejects(() => couponController.applyToCart({ ...ctx({ code: 'SATVEX10', directSession: session }), user: { id: 'U2' } }, fakeRes()), (e) => e.code === 'DIRECT_SESSION_INVALID');
  await assert.rejects(() => couponController.applyToCart(ctx({ code: 'SATVEX10', directSession: 'junk' }), fakeRes()), (e) => e.code === 'DIRECT_SESSION_INVALID');
});

// ---- the quick-apply chips endpoint (public) answers from the coupons table
test('GET /coupons/chips: returns only the codes switched on as chips and still usable', async () => {
  const couponService = require('../services/couponService');
  const original = couponService.listAll;
  couponService.listAll = async () => [
    { code: 'SATVEX10', discountType: 'percentage', discountValue: 10, isActive: true, showAsChip: true, createdAt: '2026-10-01T00:00:00Z' },
    { code: 'OFFCHIP', discountType: 'percentage', discountValue: 10, isActive: false, showAsChip: true, createdAt: '2026-10-02T00:00:00Z' },
    { code: 'PLAIN', discountType: 'percentage', discountValue: 5, isActive: true, createdAt: '2026-10-03T00:00:00Z' },
  ];
  const res = fakeRes();
  await couponController.listChips(ctx(), res);
  assert.deepEqual((res.body.data || res.body).chips.map((c) => c.code), ['SATVEX10']);
  couponService.listAll = original;
});
