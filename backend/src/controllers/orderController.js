const { v4: uuid } = require('uuid');
const cartService = require('../services/cartService');
const orderService = require('../services/orderService');
const userService = require('../services/userService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const pricingService = require('../services/pricingService');
const paymentService = require('../services/paymentService');
const settingsService = require('../services/settingsService');
const shipmentService = require('../services/shipmentService');
const shipmentJobService = require('../services/shipmentJobService');
const shiprocketService = require('../services/shiprocketService');
const { checkoutSchema, quoteSchema, updateOrderStatusSchema, refundSchema } = require('../validators/orderValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

const CANCELLABLE_STATUSES = new Set(['Pending', 'Confirmed']);
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
// Cashfree's own order_expiry_time is set a few minutes ahead of ours, so
// their side closes an order before our expiry sweep looks at it — avoids
// racing an ACTIVE order (plan §8).
const CASHFREE_EXPIRY_LEAD_MS = 10 * 60 * 1000;

// Cashfree needs a plain 10-digit Indian mobile number. Our checkout
// validator allows spaces/parens/+, so this strips down to digits and
// removes a leading country code or trunk zero. Throws a normal checkout
// error rather than sending something malformed to Cashfree.
function normalizePhoneForCashfree(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) {
    throw new AppError('Enter a valid 10-digit mobile number for online payment.', 400, 'INVALID_PHONE');
  }
  return digits;
}

async function isOnlinePaymentsAvailable(userId) {
  const settings = await settingsService.getSettings();
  const { onlineEnabled, onlineTestUserIds } = settings.payments || {};
  return Boolean(onlineEnabled || (onlineTestUserIds || []).includes(userId));
}

// Shared by checkout and the quote preview — re-derives every line item from
// current product/variant data (price, availability, stock) rather than
// trusting anything cached in the cart snapshot.
async function resolveOrderItems(userId) {
  const cartItems = (await cartService.getCartForUser(userId)).filter((item) => !item.savedForLater);
  if (cartItems.length === 0) {
    throw new AppError('Your cart is empty.', 400, 'CART_EMPTY');
  }
  return Promise.all(
    cartItems.map(async (cartItem) => {
      const lineItem = await pricingService.resolveLineItem({
        productId: cartItem.productId,
        sellingOptionId: cartItem.sellingOptionId,
        selectedColors: cartItem.selectedColors,
      });
      const subtotal = Number((lineItem.unitPrice * cartItem.quantity).toFixed(2));
      return { ...lineItem, quantity: cartItem.quantity, subtotal };
    })
  );
}

// Read-only preview of the full breakdown (subtotal/discount/GST/shipping/COD/
// total) so the frontend never has to guess/recompute any of it — Cart and
// Checkout just display what this returns. Never mutates coupon usage.
async function quote(req, res) {
  const { couponCode, paymentMethod, pincode } = quoteSchema.parse(req.body);
  const orderItems = await resolveOrderItems(req.user.id);
  const totals = await pricingService.calculateTotals({
    items: orderItems,
    couponCode,
    paymentMethod,
    userId: req.user.id,
    deliveryPincode: pincode,
  });
  ok(res, { ...totals, items: orderItems });
}

async function checkout(req, res) {
  const { customer, address, couponCode, paymentMethod } = checkoutSchema.parse(req.body);

  // Phone verification gate — enforced server-side (never trust the
  // frontend to have gated this), before any Cashfree call, coupon commit,
  // or DB write. Re-checked against the EXACT phone on this request, not
  // just "has this account ever verified a phone" — a changed number
  // always fails this until re-verified (userService.isPhoneVerified).
  const user = await userService.findById(req.user.id);
  if (!userService.isPhoneVerified(user, customer.phone)) {
    throw new AppError(
      'Please verify your mobile number before placing the order.',
      400,
      'PHONE_NOT_VERIFIED'
    );
  }

  // Step 3: reject up front if Online isn't enabled for this user — before
  // any Cashfree call, coupon commit, or DB write. The API must not trust
  // the frontend to have hidden the option, since it can be called directly.
  if (paymentMethod === 'Online' && !(await isOnlinePaymentsAvailable(req.user.id))) {
    throw new AppError('Online payment is not available right now. Please use Cash on Delivery.', 400, 'ONLINE_PAYMENTS_DISABLED');
  }

  // Step 1: resolve items + compute totals (no side effects).
  const orderItems = await resolveOrderItems(req.user.id);
  const totals = await pricingService.calculateTotals({
    items: orderItems,
    couponCode,
    paymentMethod,
    userId: req.user.id,
    deliveryPincode: address.pincode,
  });

  // Step 2: mint the order id up front — also used as Cashfree's order_id,
  // so no separate id is ever needed to reconcile a webhook back to us.
  const orderId = uuid();

  let paymentSessionId = null;
  let paymentExpiresAt = null;

  if (paymentMethod === 'Online') {
    // Step 4: call Cashfree FIRST, before touching the coupon or our DB.
    // Failure here needs no rollback — nothing has been committed yet.
    const normalizedPhone = normalizePhoneForCashfree(customer.phone);
    const expiresAtMs = Date.now() + PAYMENT_WINDOW_MS;
    paymentExpiresAt = new Date(expiresAtMs).toISOString();
    const cashfreeExpiry = new Date(expiresAtMs - CASHFREE_EXPIRY_LEAD_MS).toISOString();

    const returnUrl = `${req.headers.origin || ''}/order-confirmation/${orderId}`;
    const cfOrder = await paymentService.createOrder({
      orderId,
      amount: totals.total,
      customer: { userId: req.user.id, name: customer.name, email: customer.email, phone: normalizedPhone },
      returnUrl,
      expiresAt: cashfreeExpiry,
    });
    paymentSessionId = cfOrder.paymentSessionId;
  }

  // Step 5: commit the coupon (redemption record + incrementUsage) — same
  // as the existing COD path, including its existing rollback-on-failure.
  let coupon = null;
  if (totals.couponCode) {
    coupon = await couponService.findByCode(totals.couponCode);
    if (coupon.oneUsePerCustomer) {
      await couponRedemptionService.record({
        code: coupon.code,
        userId: req.user.id,
        orderId,
        customerName: customer.name,
        customerEmail: customer.email,
        discountAmount: totals.discountAmount,
      });
    }
    try {
      await couponService.incrementUsage(coupon.code, coupon.usageLimit);
    } catch (err) {
      if (coupon.oneUsePerCustomer) {
        await couponRedemptionService.remove(coupon.code, req.user.id).catch(() => {});
      }
      throw err;
      // If a Cashfree order was already created above, it's harmless and
      // self-cleaning — it simply expires on Cashfree's side with no money
      // ever collected. No extra cleanup code needed for this edge case.
    }
  }

  // Step 6: write the DB order. If this fails after the coupon was already
  // committed, roll the coupon back the same way, so the customer can
  // retry cleanly without having burned it.
  let order;
  try {
    order = await orderService.createOrder({
      orderId,
      userId: req.user.id,
      items: orderItems,
      customer,
      address,
      subtotal: totals.subtotal,
      couponCode: totals.couponCode,
      discountAmount: totals.discountAmount,
      gstPercent: totals.gstPercent,
      gstAmount: totals.gstAmount,
      shipping: totals.shipping,
      shippingCourier: totals.shippingCourier,
      paymentMethod: totals.paymentMethod,
      codCharge: totals.codCharge,
      prepaidDiscount: totals.prepaidDiscount,
      total: totals.total,
      paymentStatus: paymentMethod === 'Online' ? 'awaiting_payment' : 'not_required',
      paymentExpiresAt,
    });
  } catch (err) {
    if (coupon) {
      if (coupon.oneUsePerCustomer) {
        await couponRedemptionService.remove(coupon.code, req.user.id).catch(() => {});
      }
      await couponService.decrementUsage(coupon.code).catch(() => {});
    }
    throw new AppError('Could not place your order — please try again.', 500, 'ORDER_CREATE_FAILED');
  }

  // Step 7: clear the cart.
  await cartService.clearCart(req.user.id);

  if (order.status === 'Confirmed') {
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
  }

  // Step 8: return.
  created(res, { order, paymentSessionId });
}

async function listMyOrders(req, res) {
  const orders = await orderService.listForUser(req.user.id);
  ok(res, { orders });
}

async function getMyOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  ok(res, { order });
}

async function cancelMyOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  if (!CANCELLABLE_STATUSES.has(order.status)) {
    throw new AppError(`Orders can only be cancelled while ${[...CANCELLABLE_STATUSES].join('/')}.`, 400, 'NOT_CANCELLABLE');
  }
  // A paid Online order can never be silently cancelled without a refund —
  // only admin can trigger a refund (Decision 4), so a customer self-cancel
  // on an already-paid order is routed to support instead.
  if (order.paymentMethod === 'Online' && order.paymentStatus === 'paid') {
    throw new AppError('This order has already been paid online. Please contact support to cancel and refund it.', 400, 'REFUND_REQUIRED');
  }
  await orderService.updateStatus(req.params.id, 'Cancelled');
  ok(res, { updated: true, status: 'Cancelled' });
}

// Server-to-server reconciliation, used both as the confirmation-page
// polling target and as a fallback if a webhook is ever missed. Never
// trusts client-side redirect params — only ever a prior webhook or this
// direct Cashfree call.
async function getPaymentStatus(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }

  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'awaiting_payment') {
    return ok(res, {
      paymentStatus: order.paymentStatus,
      lastPaymentAttemptStatus: order.lastPaymentAttemptStatus || null,
      needsReview: order.needsReview || false,
    });
  }

  const cfStatus = await paymentService.fetchOrderStatus(order.orderId).catch(() => null);
  if (cfStatus?.orderStatus === 'PAID') {
    const payments = await paymentService.fetchOrderPayments(order.orderId).catch(() => []);
    const success = payments.find((p) => p.payment_status === 'SUCCESS');
    if (success && Number(success.payment_amount) !== Number(order.total)) {
      await orderService.flagForReview(order.orderId, 'Payment amount mismatch on reconciliation.');
    } else {
      await orderService.markPaid(order.orderId, { cfPaymentId: success?.cf_payment_id, paidAt: new Date().toISOString() });
      await shipmentService.triggerShipmentIfNeeded(order.orderId);
    }
  } else if (cfStatus?.orderStatus === 'EXPIRED') {
    await finalizeExpiry(order);
  } else if (cfStatus?.orderStatus === 'ACTIVE') {
    // The Cashfree ORDER hasn't closed, but a specific payment ATTEMPT may
    // already have a definitive outcome (FAILED/USER_DROPPED/etc) before
    // the webhook arrives — surface that immediately via
    // lastPaymentAttemptStatus rather than making the customer wait for a
    // webhook or the poll timeout to find out their card was declined.
    // Per Cashfree's docs (api-reference/payments/enums), payment_status is
    // one of SUCCESS/FAILED/NOT_ATTEMPTED/PENDING/FLAGGED/CANCELLED/VOID/
    // USER_DROPPED. Ordering of the payments list isn't documented, so this
    // sorts by payment_time itself rather than assuming index order.
    const payments = await paymentService.fetchOrderPayments(order.orderId).catch(() => []);
    const latest = [...payments].sort((a, b) => new Date(b.payment_time) - new Date(a.payment_time))[0];
    if (latest?.payment_status && latest.payment_status !== 'NOT_ATTEMPTED') {
      await orderService.markPaymentAttempt(order.orderId, latest.payment_status);
    }
  }
  // On a Cashfree API error: leave the order as awaiting_payment, exactly as
  // the expiry sweep does — never expire or mark paid on an inconclusive
  // result.

  const fresh = await orderService.findById(req.params.id);
  ok(res, {
    paymentStatus: fresh.paymentStatus,
    lastPaymentAttemptStatus: fresh.lastPaymentAttemptStatus || null,
    needsReview: fresh.needsReview || false,
  });
}

// Shared by the on-read reconcile above and the scheduled expiry sweep
// (src/expirePayments.js) — centralizes the "expire, then release the
// coupon exactly once" logic in one place.
async function finalizeExpiry(order) {
  const result = await orderService.markExpired(order.orderId);
  if (result.transitioned && order.couponCode) {
    await couponService.decrementUsage(order.couponCode).catch(() => {});
    await couponRedemptionService.remove(order.couponCode, order.userId).catch(() => {});
  }
  return result;
}

// Regenerates access to Cashfree's hosted checkout for an order that's
// still awaiting payment and hasn't expired yet. Cashfree's
// payment_session_id stays valid for the order's whole ACTIVE lifetime, so
// this re-fetches the existing session rather than creating a new order.
async function retryPayment(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'awaiting_payment') {
    throw new AppError('This order is not awaiting online payment.', 400, 'NOT_RETRYABLE');
  }
  if (order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() < Date.now()) {
    throw new AppError('This order has expired. Please place a new order.', 400, 'PAYMENT_EXPIRED');
  }

  const cfStatus = await paymentService.fetchOrderStatus(order.orderId);
  if (cfStatus.orderStatus === 'PAID') {
    await orderService.markPaid(order.orderId, { paidAt: new Date().toISOString() });
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
    return ok(res, { paymentSessionId: null, alreadyPaid: true });
  }
  if (cfStatus.orderStatus !== 'ACTIVE' || !cfStatus.paymentSessionId) {
    throw new AppError('This payment session is no longer available. Please place a new order.', 400, 'SESSION_UNAVAILABLE');
  }
  ok(res, { paymentSessionId: cfStatus.paymentSessionId });
}

async function reorder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }

  const results = await Promise.allSettled(
    order.items.map(async (item) => {
      const lineItem = await pricingService.resolveLineItem({
        productId: item.productId,
        sellingOptionId: item.sellingOptionId,
        selectedColors: item.selectedColors,
      });
      return cartService.addItem(req.user.id, lineItem, item.quantity);
    })
  );

  const addedCount = results.filter((r) => r.status === 'fulfilled').length;
  const unavailableCount = results.length - addedCount;
  ok(res, { addedCount, unavailableCount });
}

async function adminListOrders(req, res) {
  const { status, search, dateFrom, dateTo, paymentMethod, shipmentStatus } = req.query;
  const orders = await orderService.listAll({ status, search, dateFrom, dateTo, paymentMethod, shipmentStatus });
  ok(res, { orders });
}

async function adminGetOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  ok(res, { order });
}

async function adminUpdateStatus(req, res) {
  const { status } = updateOrderStatusSchema.parse(req.body);
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }

  // Fulfilment gating: an Online order can't be marked Shipped/Delivered
  // until it's actually paid — enforced here, not just hidden in the UI.
  if (
    order.paymentMethod === 'Online' &&
    order.paymentStatus !== 'paid' &&
    (status === 'Shipped' || status === 'Delivered')
  ) {
    throw new AppError('This order has not been paid yet and cannot be shipped.', 400, 'PAYMENT_NOT_CONFIRMED');
  }

  // A paid Online order can never be cancelled without at least a refund
  // having been initiated — otherwise we'd hold the customer's money on a
  // cancelled order.
  if (
    status === 'Cancelled' &&
    order.paymentMethod === 'Online' &&
    order.paymentStatus === 'paid' &&
    order.refundStatus !== 'pending' &&
    order.refundStatus !== 'success'
  ) {
    throw new AppError('Refund this order before cancelling it.', 400, 'REFUND_REQUIRED');
  }

  await orderService.updateStatus(req.params.id, status);
  if (status === 'Delivered') {
    await orderService.ensureInvoiceGenerated(req.params.id);
  }
  ok(res, { updated: true, status });
}

// Full-refund-only (Decision 4) — the amount is always the order's own
// stored total, never taken from the client. Idempotent: refundStatus is
// written 'pending' BEFORE calling Cashfree, so a double-click or a retry
// after a network blip both hit the same guard and the second one no-ops.
async function adminRefund(req, res) {
  const { note } = refundSchema.parse(req.body || {});
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'paid') {
    throw new AppError('Only paid online orders can be refunded.', 400, 'NOT_REFUNDABLE');
  }

  const refundId = uuid();
  const guard = await orderService.recordRefundPending(order.orderId, { refundId, adminId: req.user.id });
  if (!guard.started) {
    throw new AppError('A refund has already been requested or completed for this order.', 409, 'REFUND_ALREADY_IN_PROGRESS');
  }

  try {
    const result = await paymentService.createRefund({ orderId: order.orderId, refundId, amount: order.total, note });
    const fresh = await orderService.findById(order.orderId);
    await orderService.recordRefundResult(fresh, {
      refundId,
      status: result.refundStatus === 'SUCCESS' ? 'success' : 'pending',
      cfRefundId: result.cfRefundId,
    });
  } catch (err) {
    // Ambiguous failure — did Cashfree receive the request or not? Don't
    // blindly retry (risks a duplicate refund); resolve via a status check
    // against the SAME refundId instead.
    const status = await paymentService.fetchRefundStatus(order.orderId, refundId).catch(() => null);
    const fresh = await orderService.findById(order.orderId);
    await orderService.recordRefundResult(fresh, {
      refundId,
      status: status?.refundStatus === 'SUCCESS' ? 'success' : status ? 'pending' : 'failed',
      cfRefundId: status?.cfRefundId,
    });
    if (!status) throw err;
  }

  const finalOrder = await orderService.findById(order.orderId);
  ok(res, { order: finalOrder });
}

// Admin-triggered manual retry — calls attemptShipmentCreation directly
// (synchronous, so the admin gets immediate pass/fail feedback) rather than
// just re-queuing a job and making them wait for the next sweep. Resumable
// — safe to click even if a previous attempt partially succeeded (see
// shipmentService.js).
// Customer-triggered manual refresh — the webhook is the primary source of
// truth, this just lets a customer pull the latest status on demand (e.g.
// if a webhook delivery was missed). Only works once an AWB exists; before
// that there's nothing to track yet.
async function refreshTracking(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  if (!order.awbCode) {
    throw new AppError('Tracking is not available yet for this order.', 400, 'NO_AWB');
  }

  const tracking = await shiprocketService.trackByAwb(order.awbCode);
  if (tracking) {
    await orderService.recordShipmentTracking(order.orderId, {
      shipmentStatus: tracking.shipment_status || tracking.current_status,
      courierName: tracking.courier_name,
      currentStatus: tracking.current_status,
      rawPayload: tracking,
      estimatedDeliveryDate: tracking.etd || null,
    });
  }

  const updated = await orderService.findById(req.params.id);
  ok(res, { order: updated });
}

// On failure, the order itself is never mutated into a bad state — only a
// retry job is queued/reset, exactly as the background sweep would do. Safe
// to call repeatedly; attemptShipmentCreation resumes from whichever step
// last succeeded rather than re-doing completed steps.
async function adminRetryShipment(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }

  try {
    const updated = await shipmentService.attemptShipmentCreation(order.orderId);
    const existingJob = await shipmentJobService.findByOrderId(order.orderId);
    if (existingJob) await shipmentJobService.markDone(order.orderId);
    ok(res, { order: updated });
  } catch (err) {
    const existingJob = await shipmentJobService.findByOrderId(order.orderId);
    if (existingJob) await shipmentJobService.resetForManualRetry(order.orderId);
    else await shipmentJobService.createJob(order.orderId);
    throw new AppError(`Shipment retry failed: ${err.message}`, 502, 'SHIPMENT_RETRY_FAILED');
  }
}

// Read-only — logs in and makes one serviceability lookup, nothing else.
// See shiprocketService.testConnection for exactly what that does and why
// it's safe to run any time.
async function adminTestShiprocketConnection(req, res) {
  const settings = await settingsService.getSettings();
  const result = await shiprocketService.testConnection({ pincode: settings.shiprocket?.pickupPincode });
  ok(res, result);
}

module.exports = {
  quote,
  checkout,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  getPaymentStatus,
  retryPayment,
  reorder,
  refreshTracking,
  adminListOrders,
  adminGetOrder,
  adminUpdateStatus,
  adminRefund,
  adminRetryShipment,
  adminTestShiprocketConnection,
  finalizeExpiry,
};
