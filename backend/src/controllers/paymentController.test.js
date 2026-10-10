// Covers Task 1's webhook cases: each of Cashfree's three payment webhook
// types (per the confirmed docs: PAYMENT_SUCCESS_WEBHOOK/
// PAYMENT_FAILED_WEBHOOK/PAYMENT_USER_DROPPED_WEBHOOK), signature
// verification, and a duplicate/repeated delivery of the same event. The
// true duplicate-confirmation guard is orderService.markPaid's own
// DynamoDB conditional write (ConditionExpression: paymentStatus =
// :awaiting) — not re-tested here with a real DynamoDB, consistent with
// how the rest of this codebase tests controllers (monkey-patched
// dependencies) vs. services (their own conditional-write logic is the
// safety net, documented inline where it's implemented). This test
// confirms the controller calls markPaid safely on every delivery,
// including a repeat.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const paymentController = require('./paymentController');

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

function webhookReq(payload) {
  const rawBody = JSON.stringify(payload);
  return { headers: { 'x-webhook-signature': 'sig', 'x-webhook-timestamp': 'ts' }, rawBody };
}

let orders;
let markPaidCalls;
let markPaymentAttemptCalls;

beforeEach(() => {
  orders = { 'ORDER-1': { orderId: 'ORDER-1', userId: 'USER-1', paymentStatus: 'awaiting_payment', total: 500 } };
  markPaidCalls = [];
  markPaymentAttemptCalls = [];

  paymentService.verifyWebhookSignature = () => true;
  // The webhook never trusts a reported SUCCESS alone — it always re-
  // confirms server-to-server via fetchOrderStatus before calling markPaid.
  paymentService.fetchOrderStatus = async () => ({ orderStatus: 'PAID' });
  orderService.findById = async (orderId) => orders[orderId] || null;
  orderService.markPaid = async (orderId, data) => {
    markPaidCalls.push({ orderId, data });
    orders[orderId] = { ...orders[orderId], paymentStatus: 'paid' };
  };
  orderService.markPaymentAttempt = async (orderId, status) => {
    markPaymentAttemptCalls.push({ orderId, status });
  };
  orderService.flagForReview = async () => {};
});

test('invalid signature -> throws (asyncHandler turns this into a 401 in production), no order lookup at all', async () => {
  paymentService.verifyWebhookSignature = () => false;
  let lookedUp = false;
  orderService.findById = async () => {
    lookedUp = true;
    return null;
  };
  const res = fakeRes();
  await assert.rejects(
    () =>
      paymentController.webhook(
        webhookReq({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'ORDER-1' }, payment: { payment_status: 'SUCCESS' } } }),
        res
      ),
    (err) => err.code === 'INVALID_SIGNATURE' && err.statusCode === 401
  );
  assert.equal(lookedUp, false);
});

test('PAYMENT_SUCCESS_WEBHOOK: marks paid', async () => {
  const req = webhookReq({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: 'ORDER-1', order_currency: 'INR' },
      payment: { payment_status: 'SUCCESS', payment_amount: 500, cf_payment_id: 'CF1', payment_time: '2026-01-01T00:00:00Z' },
    },
  });
  req.body = JSON.parse(req.rawBody);
  const res = fakeRes();
  await paymentController.webhook(req, res);
  assert.equal(markPaidCalls.length, 1);
  assert.equal(res.body.data.received, true);
});

test('PAYMENT_FAILED_WEBHOOK: records the attempt, never marks paid', async () => {
  const req = webhookReq({
    type: 'PAYMENT_FAILED_WEBHOOK',
    data: { order: { order_id: 'ORDER-1', order_currency: 'INR' }, payment: { payment_status: 'FAILED' } },
  });
  req.body = JSON.parse(req.rawBody);
  const res = fakeRes();
  await paymentController.webhook(req, res);
  assert.equal(markPaidCalls.length, 0);
  assert.equal(markPaymentAttemptCalls.length, 1);
  assert.equal(markPaymentAttemptCalls[0].status, 'FAILED');
});

test('PAYMENT_USER_DROPPED_WEBHOOK: records the attempt, never marks paid', async () => {
  const req = webhookReq({
    type: 'PAYMENT_USER_DROPPED_WEBHOOK',
    data: { order: { order_id: 'ORDER-1', order_currency: 'INR' }, payment: { payment_status: 'USER_DROPPED' } },
  });
  req.body = JSON.parse(req.rawBody);
  const res = fakeRes();
  await paymentController.webhook(req, res);
  assert.equal(markPaidCalls.length, 0);
  assert.equal(markPaymentAttemptCalls[0].status, 'USER_DROPPED');
});

test('an order_currency other than INR is ignored, never processed', async () => {
  const req = webhookReq({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: { order: { order_id: 'ORDER-1', order_currency: 'USD' }, payment: { payment_status: 'SUCCESS' } },
  });
  req.body = JSON.parse(req.rawBody);
  const res = fakeRes();
  await paymentController.webhook(req, res);
  assert.equal(markPaidCalls.length, 0);
});

test('repeated/duplicate webhook delivery of the exact same SUCCESS event is handled safely both times', async () => {
  const payload = {
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: 'ORDER-1', order_currency: 'INR' },
      payment: { payment_status: 'SUCCESS', payment_amount: 500, cf_payment_id: 'CF1', payment_time: '2026-01-01T00:00:00Z' },
    },
  };
  const req1 = webhookReq(payload);
  req1.body = JSON.parse(req1.rawBody);
  const req2 = webhookReq(payload);
  req2.body = JSON.parse(req2.rawBody);

  const res1 = fakeRes();
  const res2 = fakeRes();
  await paymentController.webhook(req1, res1);
  await paymentController.webhook(req2, res2);

  assert.equal(res1.body.data.received, true);
  assert.equal(res2.body.data.received, true);
  assert.equal(markPaidCalls.length, 2, 'the controller calls markPaid both times — markPaid\'s own conditional write (paymentStatus = :awaiting) is what prevents an actual duplicate confirmation, not this layer');
});

test('an order amount mismatch flags for review instead of marking paid', async () => {
  orders['ORDER-1'].total = 999;
  const req = webhookReq({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: 'ORDER-1', order_currency: 'INR' },
      payment: { payment_status: 'SUCCESS', payment_amount: 500, payment_time: '2026-01-01T00:00:00Z' },
    },
  });
  req.body = JSON.parse(req.rawBody);
  const res = fakeRes();
  await paymentController.webhook(req, res);
  assert.equal(markPaidCalls.length, 0);
});

test('a webhook for an order we do not recognize is acked and dropped, never errors', async () => {
  const req = webhookReq({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: { order: { order_id: 'UNKNOWN-ORDER', order_currency: 'INR' }, payment: { payment_status: 'SUCCESS' } },
  });
  req.body = JSON.parse(req.rawBody);
  const res = fakeRes();
  await paymentController.webhook(req, res);
  assert.equal(res.body.data.received, true);
});
