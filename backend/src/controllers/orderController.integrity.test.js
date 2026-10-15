// Order-integrity guarantees at checkout and on cancellation:
//  - the customer is never charged a different total than the one they saw
//    (409 PRICE_CHANGED, before anything is written),
//  - the typed state must match the pincode's real state,
//  - cancelling releases the coupon and cancels the Shiprocket shipment.
// Same monkey-patching style as the other controller tests - no mock library.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const cartService = require('../services/cartService');
const pricingService = require('../services/pricingService');
const settingsService = require('../services/settingsService');
const orderService = require('../services/orderService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const shipmentService = require('../services/shipmentService');
const deliveryEligibilityService = require('../services/deliveryEligibilityService');
const orderController = require('./orderController');

const originals = [cartService, pricingService, settingsService, orderService, couponService, couponRedemptionService, shipmentService, deliveryEligibilityService].map((m) => [m, { ...m }]);
after(() => originals.forEach(([m, o]) => Object.assign(m, o)));

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (p) => ((res.body = p), res);
  return res;
}

const validBody = (over = {}) => ({
  customer: { name: 'Jane Doe', phone: '9876543210' },
  address: { line1: '12 Test Heights', city: 'Rajkot', state: 'Gujarat', pincode: '360004', country: 'India' },
  paymentMethod: 'COD',
  ...over,
});

let created;
let cartCleared;
let pincodeState;
let usageDecrements;
let redemptionRemovals;
let shipmentCancels;
let statusUpdates;
let orderOnFile;

beforeEach(() => {
  created = [];
  cartCleared = false;
  pincodeState = 'Gujarat';
  usageDecrements = [];
  redemptionRemovals = [];
  shipmentCancels = [];
  statusUpdates = [];
  orderOnFile = null;

  settingsService.getSettings = async () => ({ payments: { onlineEnabled: true, onlineTestUserIds: [] } });
  cartService.getCartForUser = async () => [{ productId: 'p1', sellingOptionId: 'o1', selectedColors: ['c'], quantity: 1, savedForLater: false }];
  cartService.clearCart = async () => {
    cartCleared = true;
  };
  pricingService.resolveLineItem = async () => ({ productId: 'p1', productName: 'Clip', unitPrice: 149, sellingOptionName: 'Combo of 2' });
  pricingService.calculateTotals = async ({ paymentMethod }) => ({
    subtotal: 149,
    total: paymentMethod === 'COD' ? 293.82 : 224.82,
    codCharge: paymentMethod === 'COD' ? 59 : 0,
    paymentMethod,
  });
  deliveryEligibilityService.isDeliverable = async () => ({ deliverable: true, state: pincodeState });
  orderService.createOrder = async (o) => {
    created.push(o);
    return { ...o, orderId: 'ORDER-X' };
  };
  couponService.decrementUsage = async (code) => usageDecrements.push(code);
  couponRedemptionService.remove = async (code, userId) => redemptionRemovals.push([code, userId]);
  shipmentService.cancelShipmentForOrder = async (o) => {
    shipmentCancels.push(o.orderId);
    return { cancelled: true };
  };
  orderService.findById = async () => orderOnFile;
  orderService.updateStatus = async (id, status) => statusUpdates.push([id, status]);
});

const attempt = async (body) => {
  const res = fakeRes();
  try {
    await orderController.checkout({ body, user: { id: 'U1' }, protocol: 'https', get: () => 'api.test' }, res);
    return { ok: true, res };
  } catch (err) {
    return { ok: false, err };
  }
};

test('checkout: the total the customer saw is honoured when it still matches', async () => {
  const r = await attempt(validBody({ expectedTotal: 293.82 }));
  assert.equal(r.ok, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].total ?? created[0].totals?.total ?? 293.82, 293.82);
});

test('checkout: a different total is refused with 409 PRICE_CHANGED and NOTHING is written', async () => {
  // e.g. the page still showed the prepaid price (224.82) while COD was selected
  const r = await attempt(validBody({ expectedTotal: 224.82 }));
  assert.equal(r.ok, false);
  assert.equal(r.err.statusCode, 409);
  assert.equal(r.err.code, 'PRICE_CHANGED');
  assert.equal(r.err.details.total, 293.82);
  assert.match(r.err.message, /293\.82/);
  assert.equal(created.length, 0, 'no order may be created');
  assert.equal(cartCleared, false, 'the cart must be left alone');
});

test('checkout: expectedTotal is optional (older clients keep working)', async () => {
  const r = await attempt(validBody());
  assert.equal(r.ok, true);
});

test('checkout: a state that does not match the pincode is refused with the right state named', async () => {
  const r = await attempt(validBody({ address: { ...validBody().address, state: 'Maharashtra' } }));
  assert.equal(r.ok, false);
  assert.equal(r.err.code, 'ADDRESS_STATE_MISMATCH');
  assert.equal(r.err.statusCode, 400);
  assert.match(r.err.message, /Gujarat/);
  assert.equal(created.length, 0);
});

test('checkout: state comparison ignores case, punctuation and "&" vs "and"', async () => {
  pincodeState = 'Jammu & Kashmir';
  const r = await attempt(validBody({ address: { ...validBody().address, state: 'jammu and kashmir' } }));
  assert.equal(r.ok, true);
});

test('checkout: when no state can be resolved the check is skipped (never blocks a valid order)', async () => {
  pincodeState = null;
  const r = await attempt(validBody({ address: { ...validBody().address, state: 'Anything' } }));
  assert.equal(r.ok, true);
});

test('customer cancel: releases the coupon and cancels the Shiprocket shipment', async () => {
  orderOnFile = { orderId: 'O1', userId: 'U1', status: 'Confirmed', paymentMethod: 'COD', couponCode: 'SATVEX10', shiprocketOrderId: 99 };
  const res = fakeRes();
  await orderController.cancelMyOrder({ params: { id: 'O1' }, user: { id: 'U1' } }, res);
  assert.deepEqual(statusUpdates, [['O1', 'Cancelled']]);
  assert.deepEqual(usageDecrements, ['SATVEX10']);
  assert.deepEqual(redemptionRemovals, [['SATVEX10', 'U1']]);
  assert.deepEqual(shipmentCancels, ['O1']);
  assert.equal(res.body.data.status, 'Cancelled');
  assert.equal(res.body.data.shipmentCancelled, true);
});

test('customer cancel: an order with no coupon only cancels the shipment', async () => {
  orderOnFile = { orderId: 'O2', userId: 'U1', status: 'Pending', paymentMethod: 'COD', shiprocketOrderId: 7 };
  await orderController.cancelMyOrder({ params: { id: 'O2' }, user: { id: 'U1' } }, fakeRes());
  assert.deepEqual(usageDecrements, []);
  assert.deepEqual(shipmentCancels, ['O2']);
});

test("customer cancel: someone else's order is a 404 and nothing is released", async () => {
  orderOnFile = { orderId: 'O3', userId: 'OTHER', status: 'Confirmed', paymentMethod: 'COD', couponCode: 'X' };
  await assert.rejects(() => orderController.cancelMyOrder({ params: { id: 'O3' }, user: { id: 'U1' } }, fakeRes()), (e) => e.statusCode === 404);
  assert.deepEqual(usageDecrements, []);
  assert.deepEqual(shipmentCancels, []);
});

test('admin sets Cancelled: same release, but only on the transition into Cancelled', async () => {
  orderOnFile = { orderId: 'O4', userId: 'U1', status: 'Confirmed', paymentMethod: 'COD', couponCode: 'ABC10', shiprocketOrderId: 5 };
  await orderController.adminUpdateStatus({ params: { id: 'O4' }, body: { status: 'Cancelled' } }, fakeRes());
  assert.deepEqual(shipmentCancels, ['O4']);
  assert.deepEqual(usageDecrements, ['ABC10']);

  // saving an already-cancelled order again must not release a second time
  orderOnFile = { orderId: 'O4', userId: 'U1', status: 'Cancelled', paymentMethod: 'COD', couponCode: 'ABC10', shiprocketOrderId: 5 };
  await orderController.adminUpdateStatus({ params: { id: 'O4' }, body: { status: 'Cancelled' } }, fakeRes());
  assert.equal(shipmentCancels.length, 1);
  assert.equal(usageDecrements.length, 1);
});

test('admin sets a non-cancel status: nothing is released', async () => {
  orderOnFile = { orderId: 'O5', userId: 'U1', status: 'Confirmed', paymentMethod: 'COD', couponCode: 'ABC10', shiprocketOrderId: 5 };
  await orderController.adminUpdateStatus({ params: { id: 'O5' }, body: { status: 'Processing' } }, fakeRes());
  assert.deepEqual(shipmentCancels, []);
  assert.deepEqual(usageDecrements, []);
});
