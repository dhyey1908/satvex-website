const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');

// Public endpoint — Cashfree calls this server-to-server, no session/auth.
// Response codes matter for Cashfree's retry behavior: return 200 for every
// *verified* event, including ones intentionally ignored (Cashfree retries
// on non-2xx). Return 4xx only when the signature itself doesn't verify.
async function webhook(req, res) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const valid = paymentService.verifyWebhookSignature({ rawBody: req.rawBody, signature, timestamp });
  if (!valid) {
    throw new AppError('Invalid webhook signature.', 401, 'INVALID_SIGNATURE');
  }

  const payload = JSON.parse(req.rawBody);
  const type = payload.type;
  const data = payload.data || {};

  if (type === 'REFUND_STATUS_WEBHOOK') {
    const orderId = data.refund?.order_id;
    const order = orderId ? await orderService.findById(orderId) : null;
    if (order) {
      const status = data.refund?.refund_status === 'SUCCESS' ? 'success' : data.refund?.refund_status === 'FAILED' ? 'failed' : null;
      if (status) {
        await orderService.recordRefundResult(order, {
          refundId: data.refund?.refund_id,
          status,
          cfRefundId: data.refund?.cf_refund_id,
        });
      }
    }
    return ok(res, { received: true });
  }

  const orderId = data.order?.order_id;
  if (!orderId) return ok(res, { received: true });

  const order = await orderService.findById(orderId);
  if (!order) return ok(res, { received: true }); // stale/forged event for an order we don't have

  if (data.order?.order_currency && data.order.order_currency !== 'INR') {
    return ok(res, { received: true }); // ignore — not our currency
  }

  const paymentStatus = data.payment?.payment_status;

  if (paymentStatus !== 'SUCCESS') {
    // Attempt-level only (FAILED/PENDING/etc.) — never drives paymentStatus
    // itself; the customer can still retry on the same order (Decision 2).
    if (paymentStatus) await orderService.markPaymentAttempt(orderId, paymentStatus);
    return ok(res, { received: true });
  }

  // Never trust the webhook payload alone for a reported success — confirm
  // server-to-server before writing paymentStatus: 'paid'. This, not a
  // timestamp cutoff, is the actual anti-replay/anti-spoof mechanism.
  const cfStatus = await paymentService.fetchOrderStatus(orderId).catch(() => null);
  if (cfStatus?.orderStatus !== 'PAID') {
    return ok(res, { received: true }); // couldn't confirm — a later webhook or poll will pick it up
  }

  const amountReported = Number(data.payment?.payment_amount);
  if (Number.isFinite(amountReported) && amountReported !== Number(order.total)) {
    await orderService.flagForReview(orderId, 'Payment amount mismatch on webhook.');
    return ok(res, { received: true });
  }

  // markPaid handles both the normal (awaiting_payment -> paid) and late
  // (expired -> paid, Decision 6) paths itself; no coupon action needed
  // here either way — the normal path never released it, and the late path
  // already released it on expiry and must not re-consume it.
  await orderService.markPaid(orderId, {
    cfPaymentId: data.payment?.cf_payment_id,
    paidAt: data.payment?.payment_time || new Date().toISOString(),
  });

  ok(res, { received: true });
}

module.exports = { webhook };
