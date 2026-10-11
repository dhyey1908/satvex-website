const orderService = require('../services/orderService');
const payuService = require('../services/payuService');
const shipmentService = require('../services/shipmentService');
const env = require('../config/env');
const logger = require('../utils/logger');

// Public endpoint — PayU's hosted checkout POSTs here directly from the
// CUSTOMER'S BROWSER (both surl and furl point at this same URL; PayU's
// `status` field tells success from failure), not server-to-server like
// Cashfree's webhook was. That means this must respond with a real HTTP
// redirect (PRG pattern), not JSON — the browser lands wherever this
// redirects it. It always redirects to the SAME frontend confirmation page
// regardless of outcome, exactly as Cashfree's return_url did; that page's
// own polling (getPaymentStatus) is what the customer actually sees, not
// anything embedded in this redirect.
//
// Never trusts the posted status alone, even with a valid hash — the
// posted hash only proves PayU sent it, not that it's still current (a
// stale resubmission, a delayed duplicate, etc.). payuService.verifyPayment
// is the actual source of truth, called fresh every time.
async function callback(req, res) {
  const body = req.body || {};
  const frontendOrigin = env.frontendOrigin.split(',')[0].trim();
  const txnid = body.txnid;

  if (!txnid) {
    return res.redirect(302, frontendOrigin);
  }

  const redirectTo = `${frontendOrigin}/order-confirmation/${txnid}`;

  const hashValid = payuService.verifyResponseHash(body);
  if (!hashValid) {
    // Don't act on anything this request claims — but still send the
    // customer's browser somewhere sane. The confirmation page's own poll
    // (backed by verifyPayment, not this request) determines the real
    // status.
    logger.error('PayU callback: response hash did not verify', { txnid });
    return res.redirect(302, redirectTo);
  }

  const order = await orderService.findById(txnid);
  if (!order) {
    return res.redirect(302, redirectTo); // stale/forged callback for an order we don't have
  }

  if (order.paymentStatus !== 'awaiting_payment') {
    // Already resolved (a prior callback, or the poll beat us to it) —
    // nothing to do, just send the browser on.
    return res.redirect(302, redirectTo);
  }

  const result = await payuService.verifyPayment(txnid).catch(() => null);

  if (result?.status === 'success') {
    if (result.amount != null && result.amount !== Number(order.total)) {
      await orderService.flagForReview(order.orderId, 'Payment amount mismatch on PayU callback.');
    } else {
      await orderService.markPaid(order.orderId, { payuMihpayid: result.mihpayid, paidAt: new Date().toISOString() });
      await shipmentService.triggerShipmentIfNeeded(order.orderId);
    }
  } else if (result?.status === 'failure') {
    await orderService.markPaymentAttempt(order.orderId, 'FAILED');
  } else if (result?.status === 'pending') {
    await orderService.markPaymentAttempt(order.orderId, 'PENDING');
  }
  // 'not_found' or an API error: leave it as awaiting_payment — the
  // confirmation page's poll (or the next callback) will resolve it.

  res.redirect(302, redirectTo);
}

module.exports = { callback };
