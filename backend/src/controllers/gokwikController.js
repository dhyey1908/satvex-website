const orderService = require('../services/orderService');
const gokwikService = require('../services/gokwikProvider');
const shipmentService = require('../services/shipmentService');
const { ok } = require('../utils/response');

// Public endpoint — GoKwik calls this server-to-server. Per
// gokwik_integration_notes.md, auth is the appid/appsecret headers matching
// our own credentials (no signature scheme is documented). That alone is
// weak, so this NEVER marks an order paid off the webhook body alone — it
// always re-confirms with payment/verify first, same principle as the
// existing Cashfree webhook.
//
// Idempotency: markPaidGoKwik's conditional write (paymentStatus must still
// be 'awaiting_payment'/'expired') means a duplicate webhook for an
// already-paid order simply no-ops on its second delivery — no separate
// "seen this event before" table needed.
async function webhook(req, res) {
  const appid = req.headers.appid;
  const appsecret = req.headers.appsecret;
  if (!gokwikService.verifyWebhookHeaders({ appid, appsecret })) {
    // Not AppError — this path must not leak which credential was wrong,
    // and we still want GoKwik to see a normal rejection, not a crash.
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid webhook credentials.' } });
  }

  // Body per the notes: request_id, gokwik_oid, moid, transaction_id.
  const { gokwik_oid: gokwikOid, moid, transaction_id: transactionId } = req.body || {};
  if (!moid) return ok(res, { received: true });

  const order = await orderService.findById(moid);
  if (!order) return ok(res, { received: true }); // stale/forged event for an order we don't have

  if (order.paymentProvider !== 'gokwik') return ok(res, { received: true }); // not ours to act on

  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'awaiting_payment') {
    return ok(res, { received: true }); // nothing to confirm — already resolved or not a payment-gated order
  }

  // Always confirm server-to-server before trusting the webhook.
  const verifyResult = await gokwikService.verifyPayment({ gokwikOid: order.gokwikOid || gokwikOid, total: order.total }).catch(() => null);

  // TODO(confirm): the notes describe verifyPayment's HTTP status (200/202/
  // 404/400) but not a body field for "which status this was" beyond that —
  // treating any successful (2xx) response with a transaction_id as proof
  // of payment, matching the "200 Payment Success" case in the notes.
  if (verifyResult?.transaction_id || transactionId) {
    await orderService.markPaidGoKwik(moid, {
      gokwikTransactionId: verifyResult?.transaction_id || transactionId,
      paidAt: new Date().toISOString(),
    });
    await shipmentService.triggerShipmentIfNeeded(moid);
  }
  // Anything else (pending/not found/error): leave the order as
  // awaiting_payment — never mark paid on an inconclusive result. A later
  // webhook retry or the customer's own confirmation-page poll will catch it.

  ok(res, { received: true });
}

module.exports = { webhook };
