// Covers Task 1's required cases for getPaymentStatus (the return-page/poll
// reconciliation endpoint) and retryPayment: each of Cashfree's four
// payment outcomes, the pending-then-success flow, and "webhook arrived
// first" (order already paid, this endpoint must be a safe no-op). The
// webhook itself is covered separately in paymentController.test.js.
// Mocked responses only, same lightweight monkey-patching pattern already
// used throughout this codebase — no new test framework/mocking library.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const orderController = require('./orderController');

const originalOrderService = { ...orderService };
const originalPaymentService = { ...paymentService };

after(() => {
  Object.assign(orderService, originalOrderService);
  Object.assign(paymentService, originalPaymentService);
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

// --- Outcome 1: SUCCESS ---
test('SUCCESS: order_status PAID -> marks paid, returns paymentStatus paid', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'PAID' });
  paymentService.fetchOrderPayments = async () => [
    { payment_status: 'SUCCESS', payment_amount: 500, cf_payment_id: 'CF1', payment_time: '2026-01-01T00:00:10Z' },
  ];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(res.body.data.paymentStatus, 'paid');
  assert.equal(markPaidCalls.length, 1);
});

test('SUCCESS with amount mismatch: flags for review instead of marking paid', async () => {
  orders['ORDER-1'] = baseOrder({ total: 999 });
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'PAID' });
  paymentService.fetchOrderPayments = async () => [{ payment_status: 'SUCCESS', payment_amount: 500, payment_time: '2026-01-01T00:00:10Z' }];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaidCalls.length, 0);
  assert.equal(orders['ORDER-1'].needsReview, true);
});

// --- Outcome 2: FAILED ---
test('FAILED: order_status ACTIVE with a FAILED payment -> records the attempt immediately, does not mark paid', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE' });
  paymentService.fetchOrderPayments = async () => [{ payment_status: 'FAILED', payment_time: '2026-01-01T00:00:10Z' }];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls.length, 1);
  assert.equal(markPaymentAttemptCalls[0].status, 'FAILED');
  assert.equal(res.body.data.lastPaymentAttemptStatus, 'FAILED');
  assert.equal(res.body.data.paymentStatus, 'awaiting_payment', 'order stays awaiting_payment/retryable, not expired or paid');
  assert.equal(markPaidCalls.length, 0);
});

// --- Outcome 3: USER_DROPPED ---
test('USER_DROPPED: order_status ACTIVE with a USER_DROPPED payment -> records it, order stays retryable', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE' });
  paymentService.fetchOrderPayments = async () => [{ payment_status: 'USER_DROPPED', payment_time: '2026-01-01T00:00:10Z' }];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls[0].status, 'USER_DROPPED');
  assert.equal(res.body.data.paymentStatus, 'awaiting_payment');
});

// --- Outcome 4: PENDING ---
test('PENDING: order_status ACTIVE with a PENDING payment -> records it, never marked paid or expired', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE' });
  paymentService.fetchOrderPayments = async () => [{ payment_status: 'PENDING', payment_time: '2026-01-01T00:00:10Z' }];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls[0].status, 'PENDING');
  assert.equal(markPaidCalls.length, 0);
  assert.equal(res.body.data.paymentStatus, 'awaiting_payment');
});

// --- NOT_ATTEMPTED must not be surfaced as a result ---
test('NOT_ATTEMPTED payment attempts are not recorded (nothing has actually happened yet)', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE' });
  paymentService.fetchOrderPayments = async () => [{ payment_status: 'NOT_ATTEMPTED', payment_time: '2026-01-01T00:00:10Z' }];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls.length, 0);
});

// --- EXPIRED ---
test('EXPIRED order_status -> finalizes expiry', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'EXPIRED' });
  paymentService.fetchOrderPayments = async () => [];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(res.body.data.paymentStatus, 'expired');
});

// --- Picks the LATEST payment by payment_time, not array order ---
test('multiple payment attempts: picks the most recent by payment_time, not list order', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE' });
  paymentService.fetchOrderPayments = async () => [
    { payment_status: 'USER_DROPPED', payment_time: '2026-01-01T00:00:10Z' }, // older, listed first
    { payment_status: 'FAILED', payment_time: '2026-01-01T00:05:00Z' }, // newer
  ];

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(markPaymentAttemptCalls[0].status, 'FAILED');
});

// --- Webhook arrived first: this endpoint must be a safe no-op ---
test('webhook-arrived-first: order already paid -> no Cashfree calls, no double confirmation', async () => {
  orders['ORDER-1'] = baseOrder({ paymentStatus: 'paid' });
  let cashfreeCalled = false;
  paymentService.fetchOrderStatus = async () => {
    cashfreeCalled = true;
    return { orderStatus: 'PAID' };
  };

  const res = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(cashfreeCalled, false, 'already-paid orders must short-circuit before any Cashfree call');
  assert.equal(res.body.data.paymentStatus, 'paid');
});

// --- Pending-then-success flow (two sequential polls) ---
test('pending-then-success: first poll records PENDING, second poll (once Cashfree reports PAID) marks paid', async () => {
  orders['ORDER-1'] = baseOrder();
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE' });
  paymentService.fetchOrderPayments = async () => [{ payment_status: 'PENDING', payment_time: '2026-01-01T00:00:10Z' }];

  const res1 = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res1);
  assert.equal(res1.body.data.paymentStatus, 'awaiting_payment');
  assert.equal(res1.body.data.lastPaymentAttemptStatus, 'PENDING');

  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'PAID' });
  paymentService.fetchOrderPayments = async () => [
    { payment_status: 'SUCCESS', payment_amount: 500, payment_time: '2026-01-01T00:01:00Z' },
  ];

  const res2 = fakeRes();
  await orderController.getPaymentStatus({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res2);
  assert.equal(res2.body.data.paymentStatus, 'paid');
  assert.equal(markPaidCalls.length, 1);
});

// --- Late success after a failure (retryPayment path) ---
test('late success after a failure: retryPayment sees Cashfree now reports PAID -> marks paid, never re-creates a session', async () => {
  orders['ORDER-1'] = baseOrder({ lastPaymentAttemptStatus: 'FAILED', paymentExpiresAt: new Date(Date.now() + 60000).toISOString() });
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'PAID' });

  const res = fakeRes();
  await orderController.retryPayment({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(res.body.data.alreadyPaid, true);
  assert.equal(res.body.data.paymentSessionId, null);
  assert.equal(markPaidCalls.length, 1);
});

test('retryPayment on a genuinely still-ACTIVE order returns a fresh/existing session, never calls markPaid', async () => {
  orders['ORDER-1'] = baseOrder({ paymentExpiresAt: new Date(Date.now() + 60000).toISOString() });
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'ACTIVE', paymentSessionId: 'session_123' });

  const res = fakeRes();
  await orderController.retryPayment({ params: { id: 'ORDER-1' }, user: { id: 'USER-1' } }, res);
  assert.equal(res.body.data.paymentSessionId, 'session_123');
  assert.equal(markPaidCalls.length, 0);
});
