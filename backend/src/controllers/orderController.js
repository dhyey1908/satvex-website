const { v4: uuid } = require('uuid');
const cartService = require('../services/cartService');
const orderService = require('../services/orderService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const pricingService = require('../services/pricingService');
const paymentService = require('../services/paymentService');
const gokwikService = require('../services/gokwikProvider');
const shipmentService = require('../services/shipmentService');
const shipmentJobService = require('../services/shipmentJobService');
const settingsService = require('../services/settingsService');
const env = require('../config/env');
const logger = require('../utils/logger');
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

// SANDBOX ONLY — mirrors isOnlinePaymentsAvailable exactly. Checked before
// isOnlinePaymentsAvailable in checkout() so an allowlisted test user always
// goes through GoKwik (which handles both COD and Online), never Cashfree.
async function isGoKwikAvailable(userId) {
  const settings = await settingsService.getSettings();
  const { gokwikEnabled, gokwikTestUserIds } = settings.payments || {};
  return Boolean(gokwikEnabled || (gokwikTestUserIds || []).includes(userId));
}

// Best-effort "First Last" split — GoKwik's address schema wants separate
// first_name/last_name but checkout only collects one `name` field.
// TODO(confirm): whether GoKwik requires both to be non-empty; this falls
// back to putting the whole name in first_name if there's no space.
function splitName(fullName) {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

// Shared by both the Cashfree/COD path and the GoKwik path — same
// commit-with-rollback semantics either way, kept in one place so they can
// never silently diverge. Returns the coupon record (or null) for the
// caller to pass into the order-write's own rollback-on-DB-failure step.
async function commitCoupon(totals, userId, orderId, customer) {
  if (!totals.couponCode) return null;
  const coupon = await couponService.findByCode(totals.couponCode);
  if (coupon.oneUsePerCustomer) {
    await couponRedemptionService.record({
      code: coupon.code,
      userId,
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
      await couponRedemptionService.remove(coupon.code, userId).catch(() => {});
    }
    throw err;
  }
  return coupon;
}

async function rollbackCoupon(coupon, userId) {
  if (!coupon) return;
  if (coupon.oneUsePerCustomer) {
    await couponRedemptionService.remove(coupon.code, userId).catch(() => {});
  }
  await couponService.decrementUsage(coupon.code).catch(() => {});
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
  const { couponCode, paymentMethod } = quoteSchema.parse(req.body);
  const orderItems = await resolveOrderItems(req.user.id);
  const totals = await pricingService.calculateTotals({
    items: orderItems,
    couponCode,
    paymentMethod,
    userId: req.user.id,
  });
  ok(res, { ...totals, items: orderItems });
}

async function checkout(req, res) {
  const { customer, address, couponCode, paymentMethod } = checkoutSchema.parse(req.body);

  // SANDBOX ONLY: an allowlisted test user is routed entirely through
  // GoKwik (both COD and Online) instead of Cashfree — checked first and
  // returns early, so every real customer below hits byte-identical code
  // to before this was added.
  if (await isGoKwikAvailable(req.user.id)) {
    return checkoutViaGoKwik(req, res, { customer, address, couponCode, paymentMethod });
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
  // If a Cashfree order was already created above and this throws, it's
  // harmless and self-cleaning — it simply expires on Cashfree's side with
  // no money ever collected. No extra cleanup code needed for this edge case.
  const coupon = await commitCoupon(totals, req.user.id, orderId, customer);

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
      paymentMethod: totals.paymentMethod,
      codCharge: totals.codCharge,
      total: totals.total,
      paymentStatus: paymentMethod === 'Online' ? 'awaiting_payment' : 'not_required',
      paymentExpiresAt,
    });
  } catch (err) {
    await rollbackCoupon(coupon, req.user.id);
    throw new AppError('Could not place your order — please try again.', 500, 'ORDER_CREATE_FAILED');
  }

  // Step 7: clear the cart.
  await cartService.clearCart(req.user.id);

  // COD auto-confirms at creation (see orderService.createOrder) — this is
  // the earliest point a shipment can be created for it. Online orders stay
  // Pending here; their trigger point is getPaymentStatus/webhook, once
  // actually paid.
  if (order.status === 'Confirmed') {
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
  }

  // Step 8: return.
  created(res, { order, paymentSessionId });
}

// SANDBOX ONLY — GoKwik equivalent of checkout() above, same 8-step order of
// operations, isolated into its own function so the Cashfree path above is
// never at risk of a GoKwik-specific bug. Per the approved plan, GoKwik
// creates an order for BOTH COD and Online (so its COD risk check runs on
// every order, not just prepaid ones) — unlike Cashfree, which is never
// involved for COD at all.
async function checkoutViaGoKwik(req, res, { customer, address, couponCode, paymentMethod }) {
  // Step 1: resolve items + compute totals (no side effects) — identical to
  // the Cashfree path; pricing math never differs by payment provider.
  const orderItems = await resolveOrderItems(req.user.id);
  const totals = await pricingService.calculateTotals({
    items: orderItems,
    couponCode,
    paymentMethod,
    userId: req.user.id,
  });

  // Step 2: mint the order id up front — this is GoKwik's `moid`.
  const orderId = uuid();

  // Step 3: n/a — GoKwik has no "online payments enabled" style gate in the
  // notes; both 'cod' and 'upi' are first-class payment_details.method_id
  // values it documents.

  // Step 4: call GoKwik FIRST, before touching the coupon or our DB.
  // Failure here needs no rollback — nothing has been committed yet.
  const { firstName, lastName } = splitName(customer.name);
  const gokwikAddress = {
    first_name: firstName,
    last_name: lastName,
    address_1: address.line1,
    address_2: address.landmark || undefined,
    city: address.city,
    state: address.state,
    postcode: address.pincode,
    country: address.country,
    email: customer.email,
    phone: customer.phone,
  };

  let paymentExpiresAt = null;
  if (paymentMethod === 'Online') {
    paymentExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();
  }

  const gkOrder = await gokwikService.createOrder({
    orderId,
    items: orderItems,
    totals,
    paymentMethod,
    customerIp: req.ip,
    customerUserAgent: req.headers['user-agent'],
    billingAddress: gokwikAddress,
    shippingAddress: gokwikAddress,
  });

  // Step 5: commit the coupon — identical helper/semantics as the Cashfree path.
  const coupon = await commitCoupon(totals, req.user.id, orderId, customer);

  // Step 6: write the DB order, tagged with paymentProvider so every other
  // code path (webhook, admin status updates, the expiry sweep) can tell a
  // GoKwik order apart from a Cashfree one.
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
      paymentMethod: totals.paymentMethod,
      codCharge: totals.codCharge,
      total: totals.total,
      paymentStatus: paymentMethod === 'Online' ? 'awaiting_payment' : 'not_required',
      paymentExpiresAt,
      paymentProvider: 'gokwik',
      gokwikOid: gkOrder.gokwik_oid,
      gokwikRequestId: gkOrder.request_id,
      gokwikMid: gkOrder.mid,
      gokwikEnvironment: env.gokwik.env,
      gokwikMode: env.gokwik.mode,
    });
  } catch (err) {
    await rollbackCoupon(coupon, req.user.id);
    throw new AppError('Could not place your order — please try again.', 500, 'ORDER_CREATE_FAILED');
  }

  // Step 7: clear the cart.
  await cartService.clearCart(req.user.id);

  if (order.status === 'Confirmed') {
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
  }

  // Step 8: return everything the frontend's gokwikSdk.initPayment needs.
  // order_type mirrors payment_details.method_id sent to GoKwik above.
  created(res, {
    order,
    gokwik: {
      requestId: gkOrder.request_id,
      gokwikOid: gkOrder.gokwik_oid,
      mid: gkOrder.mid,
      orderType: paymentMethod === 'Online' ? 'upi' : 'cod',
      environment: env.gokwik.env,
    },
  });
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
    return ok(res, { paymentStatus: order.paymentStatus, needsReview: order.needsReview || false });
  }

  // SANDBOX ONLY — isolated branch so the Cashfree reconciliation logic
  // below is never touched by GoKwik work. TODO(confirm): the notes only
  // document 200/202/404/400 for payment/verify, with no explicit
  // "expired" signal — unlike Cashfree, this never auto-expires a GoKwik
  // order from here; it only ever confirms a successful payment.
  if (order.paymentProvider === 'gokwik') {
    const verifyResult = await gokwikService.verifyPayment({ gokwikOid: order.gokwikOid, total: order.total }).catch(() => null);
    if (verifyResult?.transaction_id) {
      await orderService.markPaidGoKwik(order.orderId, {
        gokwikTransactionId: verifyResult.transaction_id,
        paidAt: new Date().toISOString(),
      });
      await shipmentService.triggerShipmentIfNeeded(order.orderId);
    }
    const freshGoKwik = await orderService.findById(req.params.id);
    return ok(res, { paymentStatus: freshGoKwik.paymentStatus, needsReview: freshGoKwik.needsReview || false });
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
  }
  // On a Cashfree API error, or ACTIVE/anything else: leave the order as
  // awaiting_payment, exactly as the expiry sweep does — never expire or
  // mark paid on an inconclusive result.

  const fresh = await orderService.findById(req.params.id);
  ok(res, { paymentStatus: fresh.paymentStatus, needsReview: fresh.needsReview || false });
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
  // TODO(confirm): gokwik_integration_notes.md doesn't document a
  // resume-existing-session endpoint (only order/create, which would mint a
  // new GoKwik order) — this never calls Cashfree with a GoKwik order's id,
  // which would otherwise 404 against an order Cashfree never created.
  if (order.paymentProvider === 'gokwik') {
    throw new AppError('Please place a new order to retry payment.', 400, 'NOT_RETRYABLE');
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
  const { status, search } = req.query;
  const orders = await orderService.listAll({ status, search });
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

  // SANDBOX ONLY, best-effort — a GoKwik API hiccup must never block an
  // admin's ability to update order status, so failures are logged and
  // swallowed, never thrown. TODO(confirm): our own status set (Pending/
  // Confirmed/Processing/Shipped/Delivered/Cancelled) doesn't map 1:1 onto
  // GoKwik's documented list (pending/processing/shipped/in-transit/
  // delayed/rto/ofd/cancelled/returned/delivered/completed) — "Confirmed"
  // has no direct equivalent, so it's sent as 'processing' until GoKwik
  // confirms the right value.
  if (order.paymentProvider === 'gokwik') {
    const GOKWIK_STATUS_MAP = {
      Pending: 'pending',
      Confirmed: 'processing',
      Processing: 'processing',
      Shipped: 'shipped',
      Delivered: 'delivered',
      Cancelled: 'cancelled',
    };
    gokwikService
      .updateOrder({ orderId: order.orderId, gokwikOid: order.gokwikOid, status: GOKWIK_STATUS_MAP[status] || 'processing' })
      .catch((err) => logger.error('gokwik order/update failed', { orderId: order.orderId, message: err.message }));
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

// Admin-triggered manual retry (plan §5 — "retry shipment" button). Calls
// attemptShipmentCreation directly (synchronous, so the admin gets
// immediate pass/fail feedback) rather than just re-queuing a job and
// making them wait for the next sweep. Resumable — safe to click even if a
// previous attempt partially succeeded (see shipmentService.js).
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
    throw new AppError(err.message || 'Shipment retry failed.', 502, 'SHIPMENT_RETRY_FAILED');
  }
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
  adminListOrders,
  adminGetOrder,
  adminUpdateStatus,
  adminRefund,
  adminRetryShipment,
  finalizeExpiry,
};
