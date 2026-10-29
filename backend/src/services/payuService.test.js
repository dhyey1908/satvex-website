// Covers the two hash formulas (request + reverse/response), both confirmed
// against PayU's official "Prebuilt Checkout Page Integration" docs, plus
// verifyPayment/initiateRefund's post-service call shape. Sets
// PAYU_MERCHANT_KEY/SALT before requiring the module, same pattern as other
// env-dependent service tests in this codebase.
process.env.PAYU_MERCHANT_KEY = 'testkey';
process.env.PAYU_MERCHANT_SALT = 'testsalt';
process.env.PAYU_ENV = 'test'; // don't inherit PAYU_ENV=production from backend/.env

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const payuService = require('./payuService');

function sha512(s) {
  return crypto.createHash('sha512').update(s).digest('hex');
}

const originalFetch = global.fetch;
after(() => {
  global.fetch = originalFetch;
});

test('buildTxnid/orderIdFromTxnid: a real order UUID fits PayU\'s 25-character txnid limit and round-trips', () => {
  const orderId = '550e8400-e29b-41d4-a716-446655440000';
  for (const attempt of [1, 2, 9, 10, 61, 62, 500]) {
    const txnid = payuService.buildTxnid(orderId, attempt);
    assert.ok(txnid.length <= 25, `${txnid} is ${txnid.length} chars`);
    assert.match(txnid, /^[0-9A-Za-z]+$/, 'alphanumeric only');
    assert.equal(payuService.orderIdFromTxnid(txnid), orderId);
  }
});

test('buildTxnid: every attempt of an order has a different txnid, and different orders never collide', () => {
  const a = '550e8400-e29b-41d4-a716-446655440000';
  const b = '550e8400-e29b-41d4-a716-446655440001';
  const ids = new Set([payuService.buildTxnid(a, 1), payuService.buildTxnid(a, 2), payuService.buildTxnid(a, 11), payuService.buildTxnid(b, 1), payuService.buildTxnid(b, 2)]);
  assert.equal(ids.size, 5);
});

test('extreme UUIDs (all zeros / all f) still fit and round-trip', () => {
  for (const orderId of ['00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
    const txnid = payuService.buildTxnid(orderId, 1);
    assert.ok(txnid.length <= 25);
    assert.equal(payuService.orderIdFromTxnid(txnid), orderId);
  }
});

test('orderIdFromTxnid: legacy "<uuid>-<n>" txnids (payments started before the change) still resolve to their order', () => {
  const orderId = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(payuService.orderIdFromTxnid(`${orderId}-3`), orderId, 'splitting on the LAST hyphen must recover the full UUID');
});

test('formatAmount: always a plain 2-decimal string', () => {
  assert.equal(payuService.formatAmount(100), '100.00');
  assert.equal(payuService.formatAmount(24.78), '24.78');
  assert.equal(payuService.formatAmount(224.82000000000002), '224.82', 'float noise is rounded away');
  assert.equal(payuService.formatAmount('149'), '149.00');
  assert.equal(payuService.formatAmount(1), '1.00');
});

test('formatAmount: rejects 0, negatives, NaN, null, undefined, empty, commas, symbols, spaces and Infinity', () => {
  for (const bad of [0, -5, NaN, null, undefined, '', '   ', '1,000', '₹500', '5 0', 'abc', Infinity, 0.004, 1e12]) {
    assert.throws(() => payuService.formatAmount(bad), (e) => e.code === 'INVALID_PAYMENT_AMOUNT' && e.statusCode === 400, `should reject ${String(bad)}`);
  }
});

test('buildPaymentParams: the amount in the form and in the hash are the same string, and a bad amount blocks the payment', () => {
  const input = { txnid: 'abc123', productinfo: 'Order X', firstname: 'Jane', email: 'jane@example.com', phone: '9876543210' };
  const { fields } = payuService.buildPaymentParams({ ...input, amount: 224.82000000000002 });
  assert.equal(fields.amount, '224.82');
  const expected = sha512(['testkey', 'abc123', '224.82', 'Order X', 'Jane', 'jane@example.com', '', '', '', '', '', '', '', '', '', '', 'testsalt'].join('|'));
  assert.equal(fields.hash, expected);
  assert.throws(() => payuService.buildPaymentParams({ ...input, amount: 0 }), (e) => e.code === 'INVALID_PAYMENT_AMOUNT');
});

test('buildPaymentParams: every hashed value equals the posted form value (names are cleaned BEFORE hashing)', () => {
  const { fields } = payuService.buildPaymentParams({ txnid: 'abc123', amount: 10, productinfo: 'Order X', firstname: "Jane O'Brien-Smith 2", email: 'jane@example.com', phone: '9876543210' });
  assert.equal(fields.firstname, 'Jane O Brien Smith');
  const recomputed = sha512(['testkey', fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, '', '', '', '', '', '', '', '', '', '', 'testsalt'].join('|'));
  assert.equal(fields.hash, recomputed);
});

test('buildPaymentParams: a pipe inside a hashed value is refused (it would shift every later field)', () => {
  assert.throws(
    () => payuService.buildPaymentParams({ txnid: 'abc123', amount: 10, productinfo: 'a|b', firstname: 'Jane', email: 'j@e.com', phone: '9876543210' }),
    (e) => e.code === 'INVALID_PAYMENT_FIELD'
  );
});

test('the salt never reaches the form fields, and building a payment logs nothing', () => {
  const lines = [];
  const orig = console.log;
  console.log = (l) => lines.push(String(l));
  let fields;
  try {
    ({ fields } = payuService.buildPaymentParams({ txnid: 'abc123', amount: 10, productinfo: 'Order X', firstname: 'Jane', email: 'jane@example.com', phone: '9876543210' }));
  } finally {
    console.log = orig;
  }
  assert.ok(!JSON.stringify(fields).includes('testsalt'), 'salt in form fields');
  assert.ok(!lines.some((l) => l.includes('PayU request built') || l.includes('testsalt')), 'no request/hash debug logging');
});

test('orderIdFromTxnid: a txnid with no hyphen at all is returned unchanged (legacy/malformed input, never crashes)', () => {
  assert.equal(payuService.orderIdFromTxnid('PLAINID'), 'PLAINID');
});

test('buildPaymentParams: produces the documented request hash formula', () => {
  const { actionUrl, fields } = payuService.buildPaymentParams({
    txnid: 'ORDER-1',
    amount: 500,
    productinfo: 'Satvex Order',
    firstname: 'Jane',
    email: 'jane@example.com',
    phone: '9876543210',
    surl: 'https://api.example.com/cb',
    furl: 'https://api.example.com/cb',
  });

  assert.equal(actionUrl, 'https://test.payu.in/_payment'); // PAYU_ENV unset -> defaults to test
  assert.equal(fields.amount, '500.00'); // always a 2-decimal string, never a raw number

  const expected = sha512(
    ['testkey', 'ORDER-1', '500.00', 'Satvex Order', 'Jane', 'jane@example.com', '', '', '', '', '', '', '', '', '', '', 'testsalt'].join('|')
  );
  assert.equal(fields.hash, expected);
});

test('buildPaymentParams: throws a clear error when PayU is not configured', () => {
  const savedKey = process.env.PAYU_MERCHANT_KEY;
  delete process.env.PAYU_MERCHANT_KEY;
  // Re-require isn't needed — buildPaymentParams reads env.payu.key at call
  // time via the already-loaded env module, which cached the original
  // value at require-time, so this test instead directly asserts the
  // module's own guard exists by checking the error path with env.payu.key
  // temporarily cleared on the already-loaded config object.
  const env = require('../config/env');
  const savedEnvKey = env.payu.key;
  env.payu.key = '';
  assert.throws(
    () => payuService.buildPaymentParams({ txnid: 'X', amount: 1, productinfo: 'p', firstname: 'f', email: 'e', phone: '9876543210' }),
    (err) => err.code === 'PAYU_NOT_CONFIGURED'
  );
  env.payu.key = savedEnvKey;
  process.env.PAYU_MERCHANT_KEY = savedKey;
});

test('verifyResponseHash: accepts a correctly-computed reverse hash', () => {
  const fields = { status: 'success', txnid: 'ORDER-1', amount: '500.00', productinfo: 'Satvex Order', firstname: 'Jane', email: 'jane@example.com' };
  const hash = sha512(
    ['testsalt', 'success', '', '', '', '', '', '', '', '', '', '', 'jane@example.com', 'Jane', 'Satvex Order', '500.00', 'ORDER-1', 'testkey'].join('|')
  );
  assert.equal(payuService.verifyResponseHash({ ...fields, hash }), true);
});

test('verifyResponseHash: rejects a tampered status (hash no longer matches)', () => {
  const fields = { status: 'success', txnid: 'ORDER-1', amount: '500.00', productinfo: 'Satvex Order', firstname: 'Jane', email: 'jane@example.com' };
  const hash = sha512(
    ['testsalt', 'success', '', '', '', '', '', '', '', '', '', '', 'jane@example.com', 'Jane', 'Satvex Order', '500.00', 'ORDER-1', 'testkey'].join('|')
  );
  // Same hash, but status field now claims 'failure' — a forged/tampered post.
  assert.equal(payuService.verifyResponseHash({ ...fields, status: 'failure', hash }), false);
});

test('verifyResponseHash: rejects a missing hash/txnid/status without crashing', () => {
  assert.equal(payuService.verifyResponseHash({}), false);
  assert.equal(payuService.verifyResponseHash({ txnid: 'X' }), false);
});

beforeEach(() => {
  global.fetch = undefined;
});

test('verifyPayment: maps a successful transaction_details entry, including mode and bank_ref_num', async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        status: 1,
        transaction_details: {
          'ORDER-1': { status: 'success', mihpayid: 'MIHPAY123', amt: '500.00', mode: 'UPI', bank_ref_num: 'BANKREF123' },
        },
      }),
      { status: 200 }
    );
  const result = await payuService.verifyPayment('ORDER-1');
  assert.equal(result.status, 'success');
  assert.equal(result.mihpayid, 'MIHPAY123');
  assert.equal(result.amount, 500);
  assert.equal(result.mode, 'UPI');
  assert.equal(result.bankRefNum, 'BANKREF123');
});

test('verifyPayment: an unknown txnid returns not_found rather than throwing', async () => {
  global.fetch = async () => new Response(JSON.stringify({ status: 0, msg: 'Not Found' }), { status: 200 });
  const result = await payuService.verifyPayment('UNKNOWN');
  assert.equal(result.status, 'not_found');
});

test('verifyPayment: status casing is normalized to lowercase', async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({ status: 1, transaction_details: { 'ORDER-1': { status: 'Pending', mihpayid: null, amt: '500.00' } } }),
      { status: 200 }
    );
  const result = await payuService.verifyPayment('ORDER-1');
  assert.equal(result.status, 'pending');
});

test('initiateRefund: throws on a failed response', async () => {
  global.fetch = async () => new Response(JSON.stringify({ status: 0, msg: 'Refund failed' }), { status: 200 });
  await assert.rejects(
    () => payuService.initiateRefund({ mihpayid: 'MIHPAY123', refundId: 'R1', amount: 500 }),
    (err) => err.code === 'PAYU_REFUND_FAILED'
  );
});

test('initiateRefund: resolves on an accepted response', async () => {
  global.fetch = async () => new Response(JSON.stringify({ status: 1, msg: 'Refund initiated' }), { status: 200 });
  const result = await payuService.initiateRefund({ mihpayid: 'MIHPAY123', refundId: 'R1', amount: 500 });
  assert.equal(result.accepted, true);
});
