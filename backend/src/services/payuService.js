const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');

// PayU's hosted checkout has no session/order-create API call (unlike
// Cashfree) — the payment request itself IS a hashed HTML form POST
// straight to PayU's payment page. These two hosts are both confirmed
// against PayU's official docs (docs.payu.in).
const PAYMENT_ACTION_URL = env.payu.env === 'production' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment';
// The post-service host (verify_payment, cancel_refund_transaction) is a
// SEPARATE host from the payment-page host above — also confirmed from docs.
const POST_SERVICE_URL =
  env.payu.env === 'production'
    ? 'https://info.payu.in/merchant/postservice.php?form=2'
    : 'https://test.payu.in/merchant/postservice.php?form=2';

function sha512(input) {
  return crypto.createHash('sha512').update(input).digest('hex');
}

// Request hash, confirmed from PayU's official "Prebuilt Checkout Page
// Integration" docs: sha512(key|txnid|amount|productinfo|firstname|email|
// udf1|udf2|udf3|udf4|udf5||||||SALT) — six empty pipe-delimited slots
// between udf5 and SALT (reserved fields PayU's formula always includes,
// even when nothing uses them), udf1-5 as empty strings when unused.
function buildRequestHash({ txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) {
  const raw = [env.payu.key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', env.payu.salt].join(
    '|'
  );
  return sha512(raw);
}

// Reverse hash for the surl/furl response, confirmed from the same docs:
// sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|
// productinfo|amount|txnid|key) — the exact reverse of the request fields,
// salt first instead of last.
function buildResponseHash({ status, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) {
  const raw = [env.payu.salt, status, '', '', '', '', '', udf5, udf4, udf3, udf2, udf1, email, firstname, productinfo, amount, txnid, env.payu.key].join(
    '|'
  );
  return sha512(raw);
}

// Builds every field the frontend needs to auto-submit a hidden form
// straight to PayU — no network call here, just local hash computation, so
// (unlike Cashfree's createOrder) this can never itself fail/need rollback.
function buildPaymentParams({ txnid, amount, productinfo, firstname, email, phone, surl, furl }) {
  if (!env.payu.key || !env.payu.salt) {
    throw new AppError('Online payment is not configured.', 500, 'PAYU_NOT_CONFIGURED');
  }
  // PayU's amount field is a plain decimal string (not paise/smallest-unit).
  const amountStr = Number(amount).toFixed(2);
  const fields = {
    key: env.payu.key,
    txnid,
    amount: amountStr,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
  };
  fields.hash = buildRequestHash({ txnid, amount: amountStr, productinfo, firstname, email });
  return { actionUrl: PAYMENT_ACTION_URL, fields };
}

// Verifies the surl/furl POST really came from PayU (not a forged request
// to our public callback endpoint) by recomputing the reverse hash over the
// exact fields PayU posted and comparing. Returns false on any mismatch —
// callers must never act on the posted status without this passing.
function verifyResponseHash(body) {
  if (!body?.hash || !body?.txnid || !body?.status) return false;
  const expected = buildResponseHash({
    status: body.status,
    txnid: body.txnid,
    amount: body.amount,
    productinfo: body.productinfo,
    firstname: body.firstname,
    email: body.email,
    udf1: body.udf1,
    udf2: body.udf2,
    udf3: body.udf3,
    udf4: body.udf4,
    udf5: body.udf5,
  });
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(body.hash));
  } catch {
    return false; // different length -> definitely not equal, never a crash
  }
}

async function postService(body) {
  const res = await fetch(POST_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new AppError('Payment provider request failed.', 502, 'PAYU_ERROR');
  }
  return data;
}

// The authoritative "never trust the frontend/redirect" check — called both
// from the surl/furl callback and from getPaymentStatus's poll, exactly
// mirroring how fetchOrderStatus was the Cashfree equivalent. Confirmed
// shape from PayU's verify_payment docs: { status: 1|0, transaction_details:
// { [txnid]: { status: 'success'|'failure'|'pending'|'Not Found', ... } } }.
async function verifyPayment(txnid) {
  const hash = sha512([env.payu.key, 'verify_payment', txnid, env.payu.salt].join('|'));
  const data = await postService({ key: env.payu.key, command: 'verify_payment', var1: txnid, hash });
  const detail = data?.transaction_details?.[txnid];
  if (!data || data.status !== 1 || !detail) {
    return { status: 'not_found', mihpayid: null, amount: null, raw: data };
  }
  // PayU's docs show inconsistent casing across examples (e.g. "Not Found")
  // — normalize to lowercase so callers compare against one known set of
  // strings instead of guessing every casing variant.
  return {
    status: String(detail.status || '').toLowerCase(),
    mihpayid: detail.mihpayid || null,
    amount: detail.amt != null ? Number(detail.amt) : null,
    raw: detail,
  };
}

// cancel_refund_transaction — hash formula follows PayU's general
// post-service pattern (sha512(key|command|var1|salt)) since the docs don't
// give a confirmed worked example specifically for this command; var1 is
// the PayU mihpayid (not our txnid), per the parameter reference.
// TODO(confirm): the exact success/failure response shape for this command
// isn't documented with a worked example — initiateRefund deliberately
// does NOT assume a synchronous 'success' result; it reports 'pending' and
// leaves final confirmation to manual reconciliation in the PayU dashboard
// (see orderController.adminRefund's comment).
async function initiateRefund({ mihpayid, refundId, amount }) {
  const hash = sha512([env.payu.key, 'cancel_refund_transaction', mihpayid, env.payu.salt].join('|'));
  const data = await postService({
    key: env.payu.key,
    command: 'cancel_refund_transaction',
    var1: mihpayid,
    var2: refundId,
    var3: Number(amount).toFixed(2),
    hash,
  });
  if (!data || data.status === 0) {
    throw new AppError(data?.msg || 'Refund request failed.', 502, 'PAYU_REFUND_FAILED');
  }
  return { accepted: true, raw: data };
}

module.exports = {
  PAYMENT_ACTION_URL,
  buildPaymentParams,
  verifyResponseHash,
  verifyPayment,
  initiateRefund,
};
