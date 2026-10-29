const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

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

// A unique PayU txnid per payment ATTEMPT (not per order) - PayU's dashboard
// looks transactions up by it, so reusing one across retries would make every
// attempt on an order indistinguishable there.
//
// PayU documents txnid as at most 25 characters. The old format was
// "<36-char order UUID>-<attempt>" (38 chars): PayU's TEST host accepts that,
// but the LIVE host is stricter. The new format packs the same two facts into
// 23-24 plain alphanumeric characters:
//   22 chars = the order UUID's 128 bits in base62, then the attempt in base62.
// orderIdFromTxnid still understands the old hyphenated format, so payments
// started before this change keep resolving to their order.
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const UUID_B62_LEN = 22; // 62^22 > 2^128, so every UUID fits in 22 chars
const UUID_HEX = /^[0-9a-f]{32}$/i;

function toBase62(n) {
  let x = BigInt(n);
  if (x === 0n) return '0';
  let out = '';
  while (x > 0n) {
    out = B62[Number(x % 62n)] + out;
    x /= 62n;
  }
  return out;
}

function fromBase62(str) {
  let x = 0n;
  for (const ch of str) {
    const i = B62.indexOf(ch);
    if (i === -1) return null;
    x = x * 62n + BigInt(i);
  }
  return x;
}

function buildTxnid(orderId, attemptNumber) {
  const hex = String(orderId).replace(/-/g, '');
  if (!UUID_HEX.test(hex)) return `${orderId}-${attemptNumber}`; // not a UUID: legacy shape
  return toBase62(BigInt(`0x${hex}`)).padStart(UUID_B62_LEN, '0') + toBase62(attemptNumber);
}

function orderIdFromTxnid(txnid) {
  const t = String(txnid || '');
  if (t.includes('-')) {
    // legacy "<uuid>-<attempt>": the UUID has its own hyphens, so split on the LAST one
    return t.slice(0, t.lastIndexOf('-'));
  }
  if (t.length > UUID_B62_LEN) {
    const n = fromBase62(t.slice(0, UUID_B62_LEN));
    if (n !== null && n < 1n << 128n) {
      const hex = n.toString(16).padStart(32, '0');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return t;
}

// ---- amount ----------------------------------------------------------------
// The ONE place an amount becomes the string PayU sees. Always "123.45":
// digits, one dot, exactly two decimals - no commas, currency symbols or
// spaces - and never zero, negative, NaN, null, undefined or empty. The same
// returned string is what is hashed AND what is posted, so they cannot differ.
function formatAmount(amount) {
  const bad = () =>
    new AppError('The payment amount is invalid. Please refresh your cart and try again.', 400, 'INVALID_PAYMENT_AMOUNT');
  if (amount === null || amount === undefined || (typeof amount === 'string' && amount.trim() === '')) throw bad();
  const n = typeof amount === 'string' ? Number(amount.trim()) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw bad();
  const out = Number(n).toFixed(2);
  if (!/^\d{1,9}\.\d{2}$/.test(out) || Number(out) <= 0) throw bad();
  return out;
}

// PayU rejects names with punctuation/symbols. Letters and spaces only, 60 max.
function cleanFirstname(name) {
  const cleaned = String(name || '')
    .replace(/[^\p{L}\p{M} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || 'Customer';
}

// Request hash, confirmed from PayU's official "Prebuilt Checkout Page
// Integration" docs: sha512(key|txnid|amount|productinfo|firstname|email|
// udf1|udf2|udf3|udf4|udf5||||||SALT) — six empty pipe-delimited slots
// between udf5 and SALT (reserved fields PayU's formula always includes,
// even when nothing uses them), udf1-5 as empty strings when unused.
function requestHashParts(f, salt) {
  return [f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1 || '', f.udf2 || '', f.udf3 || '', f.udf4 || '', f.udf5 || '', '', '', '', '', '', salt];
}

// Built from the very `fields` object that is posted, so every hashed value is
// identical to its form field by construction.
function buildRequestHash(fields) {
  return sha512(requestHashParts(fields, env.payu.salt).join('|'));
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
// straight to PayU - no network call here, just local hash computation. The
// salt stays on the server: it is only ever used inside buildRequestHash.
function buildPaymentParams({ txnid, amount, productinfo, firstname, email, phone, surl, furl }) {
  if (!env.payu.key || !env.payu.salt) {
    throw new AppError('Online payment is not configured.', 500, 'PAYU_NOT_CONFIGURED');
  }
  const fields = {
    key: env.payu.key,
    txnid,
    amount: formatAmount(amount), // formatted once; used for the hash and the form
    productinfo,
    firstname: cleanFirstname(firstname),
    email: String(email || '').trim(),
    phone,
    surl,
    furl,
  };
  // A pipe inside any hashed value would shift every later field in the hash.
  for (const k of ['txnid', 'productinfo', 'firstname', 'email']) {
    if (String(fields[k]).includes('|')) throw new AppError('Invalid payment details.', 400, 'INVALID_PAYMENT_FIELD');
  }
  fields.hash = buildRequestHash(fields);

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
// mode and bank_ref_num are both confirmed fields on transaction_details
// (docs.payu.in/reference/addl-info-general-apis) — surfaced here so
// callers can record which payment method (UPI/card/netbanking/etc) was
// actually used, for admin/customer-facing display.
async function verifyPayment(txnid) {
  const hash = sha512([env.payu.key, 'verify_payment', txnid, env.payu.salt].join('|'));
  const data = await postService({ key: env.payu.key, command: 'verify_payment', var1: txnid, hash });
  const detail = data?.transaction_details?.[txnid];
  if (!data || data.status !== 1 || !detail) {
    return { status: 'not_found', mihpayid: null, amount: null, mode: null, bankRefNum: null, raw: data };
  }
  // PayU's docs show inconsistent casing across examples (e.g. "Not Found")
  // — normalize to lowercase so callers compare against one known set of
  // strings instead of guessing every casing variant.
  return {
    status: String(detail.status || '').toLowerCase(),
    mihpayid: detail.mihpayid || detail.mihpayupid || null,
    amount: detail.amt != null ? Number(detail.amt) : null,
    mode: detail.mode || null,
    bankRefNum: detail.bank_ref_num || null,
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
  buildTxnid,
  orderIdFromTxnid,
  buildPaymentParams,
  formatAmount,
  verifyResponseHash,
  verifyPayment,
  initiateRefund,
};
