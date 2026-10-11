// Covers the PayU surl/furl callback: hash verification, the authoritative
// verify_payment re-check (never trusting the posted status alone), the
// amount-mismatch case, duplicate delivery, and an order we don't
// recognize. Mocked dependencies, same lightweight monkey-patching pattern
// used throughout this codebase. res.redirect is captured instead of
// res.json/res.status, since PayU's callback is a browser redirect (PRG),
// not a JSON response like Cashfree's server-to-server webhook was.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../services/orderService');
const payuService = require('../services/payuService');
const paymentController = require('./paymentController');

const originalOrderService = { ...orderService };
const originalPayuService = { ...payuService };

after(() => {
  Object.assign(orderService, originalOrderService);
  Object.assign(payuService, originalPayuService);
});

function fakeRes() {
  const res = { redirectedTo: null, redirectStatus: null };
  res.redirect = (status, url) => {
    res.redirectStatus = status;
    res.redirectedTo = url;
    return res;
  };
  return res;
}

let orders;
let markPaidCalls;
let markPaymentAttemptCalls;

beforeEach(() => {
  orders = { 'ORDER-1': { orderId: 'ORDER-1', userId: 'USER-1', paymentStatus: 'awaiting_payment', total: 500 } };
  markPaidCalls = [];
  markPaymentAttemptCalls = [];

  payuService.verifyResponseHash = () => true;
  // The callback never trusts a posted SUCCESS alone — it always re-confirms
  // server-to-server via verifyPayment before calling markPaid.
  payuService.verifyPayment = async () => ({ status: 'success', mihpayid: 'MIHPAY1', amount: 500 });
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

test('invalid hash -> redirects anyway but never looks up or acts on the order', async () => {
  payuService.verifyResponseHash = () => false;
  let lookedUp = false;
  orderService.findById = async () => {
    lookedUp = true;
    return null;
  };
  const res = fakeRes();
  await paymentController.callback({ body: { txnid: 'ORDER-1', status: 'success' } }, res);
  assert.equal(lookedUp, false);
  assert.equal(res.redirectStatus, 302);
  assert.ok(res.redirectedTo.includes('/order-confirmation/ORDER-1'));
});

test('success: verified via verifyPayment -> marks paid, redirects to confirmation', async () => {
  const res = fakeRes();
  await paymentController.callback({ body: { txnid: 'ORDER-1', status: 'success' } }, res);
  assert.equal(markPaidCalls.length, 1);
  assert.equal(markPaidCalls[0].data.payuMihpayid, 'MIHPAY1');
  assert.ok(res.redirectedTo.includes('/order-confirmation/ORDER-1'));
});

test('failure: posted status is failure AND verifyPayment confirms failure -> records the attempt, never marks paid', async () => {
  payuService.verifyPayment = async () => ({ status: 'failure', mihpayid: null, amount: null });
  const res = fakeRes();
  await paymentController.callback({ body: { txnid: 'ORDER-1', status: 'failure' } }, res);
  assert.equal(markPaidCalls.length, 0);
  assert.equal(markPaymentAttemptCalls.length, 1);
  assert.equal(markPaymentAttemptCalls[0].status, 'FAILED');
});

test('a posted SUCCESS is ignored if verifyPayment disagrees (pending) -- never trusts the redirect alone', async () => {
  payuService.verifyPayment = async () => ({ status: 'pending', mihpayid: null, amount: null });
  const res = fakeRes();
  await paymentController.callback({ body: { txnid: 'ORDER-1', status: 'success' } }, res);
  assert.equal(markPaidCalls.length, 0);
  assert.equal(markPaymentAttemptCalls[0].status, 'PENDING');
});

test('repeated/duplicate callback delivery of the same success is handled safely both times', async () => {
  const req = { body: { txnid: 'ORDER-1', status: 'success' } };
  const res1 = fakeRes();
  await paymentController.callback(req, res1);
  const res2 = fakeRes();
  await paymentController.callback(req, res2);

  assert.equal(res1.redirectStatus, 302);
  assert.equal(res2.redirectStatus, 302);
  // Second call sees paymentStatus already 'paid' (from the mock's own state
  // mutation) and short-circuits before calling markPaid again.
  assert.equal(markPaidCalls.length, 1, 'markPaid is called once -- the second callback short-circuits on paymentStatus !== awaiting_payment');
});

test('an order amount mismatch flags for review instead of marking paid', async () => {
  orders['ORDER-1'].total = 999;
  payuService.verifyPayment = async () => ({ status: 'success', mihpayid: 'MIHPAY1', amount: 500 });
  const res = fakeRes();
  await paymentController.callback({ body: { txnid: 'ORDER-1', status: 'success' } }, res);
  assert.equal(markPaidCalls.length, 0);
});

test('a callback for an order we do not recognize redirects harmlessly, never errors', async () => {
  const res = fakeRes();
  await paymentController.callback({ body: { txnid: 'UNKNOWN-ORDER', status: 'success' } }, res);
  assert.equal(res.redirectStatus, 302);
  assert.ok(res.redirectedTo.includes('/order-confirmation/UNKNOWN-ORDER'));
});

test('a callback with no txnid at all redirects to the frontend origin instead of crashing', async () => {
  const res = fakeRes();
  await paymentController.callback({ body: {} }, res);
  assert.equal(res.redirectStatus, 302);
  assert.ok(res.redirectedTo);
});
