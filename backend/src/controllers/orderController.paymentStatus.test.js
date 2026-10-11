// Covers getPaymentStatus (the confirmation-page poll target) and
// retryPayment against PayU's single verify_payment call, which replaces
// Cashfree's two-call (order status + payments list) model. Mocked
// dependencies, same lightweight monkey-patching pattern used throughout
// this codebase — no new test framework/mocking library.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../services/orderService');
const payuService = require('../services/payuService');
const orderController = require('./orderController');

const originalOrderService = { ...orderService };
const originalPayuService = { ...payuService };

after(() => {
  Object.assign(orderService, originalOrderService);
  Object.assign(payuService, originalPayuService);
});

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

function baseOrder(overrides = {}) {
  return {
    orderId: 'ORDER-1',
    userId: 'USER-1',
    paymentMethod: 'Online',
    paymentStatus: 'awaiting_payment',
    total: 500,
    lastPaymentAttemptStatus: null,
    needsReview: false,
    customer: { name: 'Jane Doe', phone: '9876543210', email: '' },
    ...overrides,
  };
}

let orders;
let markPaidCalls;
let markPaymentAttemptCalls;

beforeEach(() => {
  orders = {};
  markPaidCalls = [];
  markPaymentAttemptCalls = [];

  orderService.findById = async (orderId) => orders[orderId] || null;
  orderService.markPaid = async (orderId, data) => {
    markPaidCalls.push({ orderId, data });
    orders[orderId] = { ...orders[orderId], paymentStatus: 'paid', ...data };
    return { updated: true, late: false };
  };
  orderService.markPaymentAttempt = async (orderId, status) => {
    markPaymentAttemptCalls.push({ orderId, status });
    orders[orderId] = { ...orders[orderId], lastPaymentAttemptStatus: status };
  };
  orderService.flagForReview = async (orderId, reason) => {
    orders[orderId] = { ...orders[orderId], needsReview: true, needsReviewReason: reason };
  };
  orderService.markExpired = async (orderId) => {
    orders[orderId] = { ...orders[orderId], paymentStatus: 'expired' };
    return { transitioned: true };
  };
});

// --- Outcome 1: success ---
test('success: verify_payment reports success -> marks paid, returns paymentStatus paid', async () => {
  orders['ORDER-1'] = baseOrder();
  payuService.verifyPayment = async () => ({ status: 'success', mihpayid: 'MIHPAY1', amount: 500 });

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(res.body.data.paymentStatus, 'paid');
  assert.equal(markPaidCalls.length, 1);
});

test('success with amount mismatch: flags for review instead of marking paid', async () => {
  orders['ORDER-1'] = baseOrder({ total: 999 });
  payuService.verifyPayment = async () => ({ status: 'success', mihpayid: 'MIHPAY1', amount: 500 });

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaidCalls.length, 0);
  assert.equal(orders['ORDER-1'].needsReview, true);
});

// --- Outcome 2: failure ---
test('failure: verify_payment reports failure -> records the attempt immediately, does not mark paid', async () => {
  orders['ORDER-1'] = baseOrder();
  payuService.verifyPayment = async () => ({ status: 'failure', mihpayid: null, amount: null });

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls.length, 1);
  assert.equal(markPaymentAttemptCalls[0].status, 'FAILED');
  assert.equal(res.body.data.paymentStatus, 'awaiting_payment', 'order stays awaiting_payment/retryable, not expired or paid');
  assert.equal(markPaidCalls.length, 0);
});

// --- Outcome 3: pending ---
test('pending: verify_payment reports pending -> records it, never marked paid or expired', async () => {
  orders['ORDER-1'] = baseOrder();
  payuService.verifyPayment = async () => ({ status: 'pending', mihpayid: null, amount: null });

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls[0].status, 'PENDING');
  assert.equal(markPaidCalls.length, 0);
  assert.equal(res.body.data.paymentStatus, 'awaiting_payment');
});

// --- not_found must not be surfaced as a result ---
test('not_found (never attempted / API inconclusive) is not recorded as an attempt', async () => {
  orders['ORDER-1'] = baseOrder();
  payuService.verifyPayment = async () => ({ status: 'not_found', mihpayid: null, amount: null });

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls.length, 0);
  assert.equal(res.body.data.paymentStatus, 'awaiting_payment');
});

// --- Our own deadline, not a gateway-reported expiry ---
test('our own paymentExpiresAt deadline has passed -> finalizes expiry without even calling PayU', async () => {
  orders['ORDER-1'] = baseOrder({ paymentExpiresAt: new Date(Date.now() - 1000).toISOString() });
  let payuCalled = false;
  payuService.verifyPayment = async () => {
    payuCalled = true;
    return { status: 'pending', mihpayid: null, amount: null };
  };

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(payuCalled, false, 'an already-expired deadline needs no PayU call at all');
  assert.equal(res.body.data.paymentStatus, 'expired');
});

// --- Callback arrived first: this endpoint must be a safe no-op ---
test('callback-arrived-first: order already paid -> no PayU calls, no double confirmation', async () => {
  orders['ORDER-1'] = baseOrder({ paymentStatus: 'paid' });
  let payuCalled = false;
  payuService.verifyPayment = async () => {
    payuCalled = true;
    return { status: 'success', mihpayid: 'MIHPAY1', amount: 500 };
  };

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(payuCalled, false, 'already-paid orders must short-circuit before any PayU call');
  assert.equal(res.body.data.paymentStatus, 'paid');
});

// --- Pending-then-success flow (two sequential polls) ---
test('pending-then-success: first poll records PENDING, second poll (once PayU reports success) marks paid', async () => {
  orders['ORDER-1'] = baseOrder();
  payuService.verifyPayment = async () => ({ status: 'pending', mihpayid: null, amount: null });

  const res1 = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res1);
  assert.equal(res1.body.data.paymentStatus, 'awaiting_payment');
  assert.equal(res1.body.data.lastPaymentAttemptStatus, 'PENDING');

  payuService.verifyPayment = async () => ({ status: 'success', mihpayid: 'MIHPAY1', amount: 500 });

  const res2 = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res2);
  assert.equal(res2.body.data.paymentStatus, 'paid');
  assert.equal(markPaidCalls.length, 1);
});

// --- Late success after a failure (retryPayment path) ---
test('late success after a failure: retryPayment sees PayU now reports success -> marks paid, never rebuilds params', async () => {
  orders['ORDER-1'] = baseOrder({ lastPaymentAttemptStatus: 'FAILED', paymentExpiresAt: new Date(Date.now() + 60000).toISOString() });
  payuService.verifyPayment = async () => ({ status: 'success', mihpayid: 'MIHPAY1', amount: 500 });

  const res = fakeRes();
  await orderController.retryPayment({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(res.body.data.alreadyPaid, true);
  assert.equal(res.body.data.payuParams, null);
  assert.equal(markPaidCalls.length, 1);
});

test('retryPayment on a genuinely still-unpaid order returns fresh PayU form params, never calls markPaid', async () => {
  orders['ORDER-1'] = baseOrder({ paymentExpiresAt: new Date(Date.now() + 60000).toISOString() });
  payuService.verifyPayment = async () => ({ status: 'pending', mihpayid: null, amount: null });
  payuService.buildPaymentParams = ({ txnid }) => ({ actionUrl: 'https://test.payu.in/_payment', fields: { txnid, hash: 'h' } });

  const res = fakeRes();
  const req = { params: { id: 'ORDER-1' }, user: { id: 'USER-1' }, protocol: 'https', get: () => 'api.example.com' };
  await orderController.retryPayment(req, res);
  assert.equal(res.body.data.payuParams.fields.txnid, 'ORDER-1', 'retry reuses the SAME txnid as the original order id');
  assert.equal(markPaidCalls.length, 0);
});
