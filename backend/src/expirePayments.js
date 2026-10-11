// Scheduled Lambda (EventBridge, hourly — see template.yaml) that expires
// stale awaiting_payment orders and releases their coupons. Runs
// independently of the API Lambda/Express app.
//
// Safety rules:
// - Never expires an order on a PayU API error, or an inconclusive
//   ('pending'/'not_found') result — only ever on an explicit, confirmed
//   non-success result.
// - Reconciles with PayU first: if verify_payment reports success, the
//   order is marked paid instead of expired (a callback was missed, not a
//   failure).
// - Batch-capped and paced between orders to stay well under PayU's rate
//   limits, rather than firing every call concurrently.
const orderService = require('./services/orderService');
const payuService = require('./services/payuService');
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
  let result;
  try {
    result = await payuService.verifyPayment(order.orderId);
  } catch {
    // API error — skip this order, retry next hourly run. Never expire on
    // an inconclusive result.
    return 'skipped-error';
  }

  if (result.status === 'success') {
    await orderService.markPaid(order.orderId, { payuMihpayid: result.mihpayid, paidAt: new Date().toISOString() });
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
    return 'reconciled-paid';
  }

  if (result.status === 'failure') {
    await finalizeExpiry(order);
    return 'expired';
  }

  // 'pending' or 'not_found' — not due yet despite our own deadline
  // passing (e.g. the customer is mid-payment); skip and retry next run.
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
