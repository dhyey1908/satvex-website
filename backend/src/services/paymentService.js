const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const BASE_URL = env.cashfree.env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-client-id': env.cashfree.appId,
    'x-client-secret': env.cashfree.secretKey,
    'x-api-version': env.cashfree.apiVersion,
  };
}

async function cashfreeFetch(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers: headers() });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || 'Payment provider request failed.';
    throw new AppError(message, 502, 'CASHFREE_ERROR');
  }
  return data;
}

// order_id is our own orderId — Cashfree lets the merchant choose it, so we
// never need a separate id to reconcile a webhook back to our Order record.
// order_expiry_time is set by the caller to run a few minutes ahead of our
// own paymentExpiresAt, so Cashfree's side closes an order before our
// expiry sweep looks at it (avoids racing an ACTIVE order — see plan §8).
async function createOrder({ orderId, amount, customer, returnUrl, expiresAt }) {
  const data = await cashfreeFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      order_expiry_time: expiresAt,
      customer_details: {
        customer_id: customer.userId,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
      },
      order_meta: { return_url: returnUrl },
    }),
  });
  return { paymentSessionId: data.payment_session_id, cfOrderId: data.cf_order_id, orderStatus: data.order_status };
}

async function fetchOrderStatus(orderId) {
  const data = await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
  return {
    orderStatus: data.order_status,
    cfOrderId: data.cf_order_id,
    // Cashfree's payment_session_id stays valid for the order's whole ACTIVE
    // lifetime (not single-use), so a "retry payment" can reuse whatever
    // this returns rather than needing a second createOrder call — flagged
    // in the plan as worth confirming empirically against sandbox.
    paymentSessionId: data.payment_session_id,
  };
}

async function fetchOrderPayments(orderId) {
  const data = await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}/payments`, { method: 'GET' });
  return data || [];
}

async function createRefund({ orderId, refundId, amount, note }) {
  const data = await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}/refunds`, {
    method: 'POST',
    body: JSON.stringify({ refund_id: refundId, refund_amount: amount, refund_note: note || 'Refund initiated by Satvex admin' }),
  });
  return { cfRefundId: data.cf_refund_id, refundStatus: data.refund_status };
}

async function fetchRefundStatus(orderId, refundId) {
  const data = await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`, {
    method: 'GET',
  });
  return { cfRefundId: data.cf_refund_id, refundStatus: data.refund_status };
}

// Cashfree signs `timestamp + rawBody` using the same client secret key used
// for API auth (confirmed against current Cashfree docs — there is no
// separate webhook-signing secret). Must run against the exact bytes
// Cashfree sent — re-serializing the parsed JSON can produce different
// bytes (key order/whitespace) and silently break verification, so this
// takes the raw Buffer/string captured by app.js's webhook-route-scoped
// express.json({ verify }) hook, not req.body.
function verifyWebhookSignature({ rawBody, signature, timestamp }) {
  if (!signature || !timestamp || !rawBody) return false;
  const expected = crypto
    .createHmac('sha256', env.cashfree.secretKey)
    .update(timestamp + rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

module.exports = {
  createOrder,
  fetchOrderStatus,
  fetchOrderPayments,
  createRefund,
  fetchRefundStatus,
  verifyWebhookSignature,
};
