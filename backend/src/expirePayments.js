// Scheduled Lambda (EventBridge, hourly — see template.yaml) that expires
// stale awaiting_payment orders and releases their coupons. Runs
// independently of the API Lambda/Express app.
//
// Safety rules (see 18-payment-gateway.md §8):
// - Never expires an order on a Cashfree API error, or if Cashfree still
//   reports ACTIVE — only ever on an explicit, confirmed non-PAID result.
// - Reconciles with Cashfree first: if Cashfree reports PAID, the order is
//   marked paid instead of expired (a webhook was missed, not a failure).
// - Batch-capped and paced between orders to stay well under Cashfree's
//   rate limits, rather than firing every call concurrently.
const orderService = require('./services/orderService');
const paymentService = require('./services/paymentService');
const couponService = require('./services/couponService');
const couponRedemptionService = require('./services/couponRedemptionService');
const shipmentService = require('./services/shipmentService');

const BATCH_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function finalizeExpiry(order) {
  const result = await orderService.markExpired(order.orderId);
  if (result.transitioned && order.couponCode) {
    await couponService.decrementUsage(order.couponCode).catch(() => {});
    await couponRedemptionService.remove(order.couponCode, order.userId).catch(() => {});
  }
  return result;
}

async function processOrder(order) {
  // SANDBOX ONLY — bug fixed 2026-10: this sweep used to call Cashfree's API
  // unconditionally on every candidate, including GoKwik orders (which also
  // set paymentExpiresAt) — Cashfree never created that order, so the call
  // just errored and the GoKwik order silently never got swept at all.
  // TODO(confirm): GoKwik's payment/verify has no documented "expired"
  // signal (see gokwik_integration_notes.md), so this never auto-expires a
  // GoKwik order either — it only skips it safely instead of erroring.
  if (order.paymentProvider === 'gokwik') {
    return 'skipped-gokwik';
  }

  let cfStatus;
  try {
    cfStatus = await paymentService.fetchOrderStatus(order.orderId);
  } catch {
    // API error — skip this order, retry next hourly run. Never expire on
    // an inconclusive result.
    return 'skipped-error';
  }

  if (cfStatus.orderStatus === 'PAID') {
    const payments = await paymentService.fetchOrderPayments(order.orderId).catch(() => []);
    const success = payments.find((p) => p.payment_status === 'SUCCESS');
    await orderService.markPaid(order.orderId, { cfPaymentId: success?.cf_payment_id, paidAt: new Date().toISOString() });
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
    return 'reconciled-paid';
  }

  if (cfStatus.orderStatus === 'EXPIRED' || cfStatus.orderStatus === 'TERMINATED') {
    await finalizeExpiry(order);
    return 'expired';
  }

  // ACTIVE (or anything else inconclusive) — not due yet on Cashfree's
  // side despite our own deadline passing; skip and retry next run.
  return 'skipped-active';
}

exports.handler = async () => {
  const now = new Date().toISOString();
  const candidates = await orderService.listExpiryCandidates(now);

  const results = { total: candidates.length, expired: 0, reconciledPaid: 0, skipped: 0 };
  for (const order of candidates) {
    const outcome = await processOrder(order).catch(() => 'skipped-error');
    if (outcome === 'expired') results.expired += 1;
    else if (outcome === 'reconciled-paid') results.reconciledPaid += 1;
    else results.skipped += 1;
    await sleep(BATCH_DELAY_MS);
  }

  console.log('expirePayments run complete', results);
  return results;
};
