const { v4: uuid } = require('uuid');
const cartService = require('../services/cartService');
const orderService = require('../services/orderService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const pricingService = require('../services/pricingService');
const payuService = require('../services/payuService');
const settingsService = require('../services/settingsService');
const shipmentService = require('../services/shipmentService');
const shiprocketService = require('../services/shiprocketService');
const { checkoutSchema, quoteSchema, updateOrderStatusSchema, refundSchema } = require('../validators/orderValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');
const { stripOrderCost } = require('../utils/productVisibility');
const {
  ordersQuerySchema,
  queryOrders,
  syncIssuesQuerySchema,
  querySyncIssues,
} = require('../services/adminListQueries');
const env = require('../config/env');
const deliveryEligibilityService = require('../services/deliveryEligibilityService');

// Internal cost data stored on an order for admin profit analytics is
// stripped from every customer-facing response (see utils/productVisibility).
const toCustomerOrder = stripOrderCost;

const CANCELLABLE_STATUSES = new Set(['Pending', 'Confirmed']);
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// PayU needs a plain 10-digit Indian mobile number. Our checkout validator
// allows spaces/parens/+, so this strips down to digits and removes a
// leading country code or trunk zero. Throws a normal checkout error rather
// than sending something malformed to PayU.
function normalizePhoneForPayu(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) {
    throw new AppError('Enter a valid 10-digit mobile number for online payment.', 400, 'INVALID_PHONE');
  }
  return digits;
}

// PayU's surl/furl must be a backend URL (see payuService). Deriving it
// from the incoming request's own Host, instead of baking it into
// CloudFormation, avoids a circular dependency: the HTTP API needs this
// Lambda's ARN for its integration, so this Lambda can't also depend on
// the HTTP API's id. env.apiBaseUrl is only a manual override for cases
// where the Host header isn't trustworthy (e.g. certain tunnels).
function resolveApiBaseUrl(req) {
  return env.apiBaseUrl || `${req.protocol}://${req.get('host')}`;
}

// PayU's own dashboard doesn't confirm udf1-udf5 as visible columns (only
// as request/hash/echo fields — see docs.payu.in's merchant-reference
// search help, which never mentions udf fields as searchable/visible).
// productinfo, by contrast, IS shown in a transaction's own detail view
// (per PayU's hosted-checkout response sample) — so it's the one field
// actually worth putting the SATVEX order reference into, for a human
// looking at a single transaction in PayU's dashboard to identify which
// order it belongs to.
function buildProductInfo(orderId) {
  return `Order SATVEX-${orderId.slice(0, 8).toUpperCase()}`;
}

// The txnid of the most recent PayU payment attempt on this order — the
// only one that can still be "awaiting_payment" (an earlier attempt that
// didn't succeed is final/abandoned; see retryPayment, which always starts
// a fresh attempt rather than reusing an old one). Falls back to the order
// id itself for an order created before this change (back when txnid was
// always just the bare orderId, with no paymentAttempts array at all) —
// still correct, since that WAS the real txnid used for that order.
function latestAttemptTxnid(order) {
  const attempts = order.paymentAttempts || [];
  return attempts[attempts.length - 1]?.txnid || order.orderId;
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
  // Prepaid-vs-COD comparison, so the checkout can show "pay online and
  // save ₹X" using real numbers. Only offered when online payment is
  // actually usable by this customer (never advertise a method they can't
  // pick), and strictly best-effort — a failure here must never break the
  // normal quote.
  let prepaidOffer = null;
  try {
    if (await isOnlinePaymentsAvailable(req.user.id)) {
      const otherMethod = paymentMethod === 'COD' ? 'Online' : 'COD';
      const otherTotals = await pricingService.calculateTotals({
        items: orderItems,
        couponCode,
        paymentMethod: otherMethod,
        userId: req.user.id,
        deliveryPincode: pincode,
      });
      const [codTotals, onlineTotals] = paymentMethod === 'COD' ? [totals, otherTotals] : [otherTotals, totals];
      prepaidOffer = pricingService.buildPrepaidOffer(codTotals, onlineTotals);
    }
  } catch {
    prepaidOffer = null;
  }

  // The quoted courier rates and per-pack cost are internal (see
  // toCustomerOrder) — strip them from the preview the browser receives.
  const { quotedFreightCharge, quotedRtoCharge, ...customerTotals } = totals;
  ok(res, { ...customerTotals, prepaidOffer, ...stripOrderCost({ items: orderItems }) });
}

// 'Jammu & Kashmir' / 'Jammu and Kashmir' / 'jammu  kashmir' should compare equal.
const normalizeState = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function checkout(req, res) {
  const { customer, address, couponCode, paymentMethod, expectedTotal } = checkoutSchema.parse(req.body);

  // Step 3: reject up front if Online isn't enabled for this user — before
  // any coupon commit or DB write. The API must not trust the frontend to
  // have hidden the option, since it can be called directly.
  if (paymentMethod === 'Online' && !(await isOnlinePaymentsAvailable(req.user.id))) {
    throw new AppError('Online payment is not available right now. Please use Cash on Delivery.', 400, 'ONLINE_PAYMENTS_DISABLED');
  }

  // The state a customer typed must be the pincode's real state: it goes
  // straight onto the courier label, and a mismatch is how orders end up
  // undeliverable. (Skipped when delivery restrictions are off and no state is
  // resolved - the pincode itself is still validated by the totals call below.)
  const { state: pincodeState } = await deliveryEligibilityService.isDeliverable(address.pincode);
  if (pincodeState && normalizeState(pincodeState) !== normalizeState(address.state)) {
    throw new AppError(
      `Pincode ${address.pincode} is in ${pincodeState}, but the address says ${address.state}. Please correct the state.`,
      400,
      'ADDRESS_STATE_MISMATCH',
      { expectedState: pincodeState }
    );
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

  // Price integrity: never charge a different amount than the one the customer
  // was looking at. Checked before any coupon commit or write, so refusing
  // leaves nothing to roll back.
  if (expectedTotal != null && Math.abs(Number(expectedTotal) - Number(totals.total)) > 0.009) {
    throw new AppError(
      `The total changed to \u20b9${Number(totals.total).toFixed(2)}. Please review it and place the order again.`,
      409,
      'PRICE_CHANGED',
      { total: totals.total, paymentMethod }
    );
  }

  // Step 2: mint the order id up front.
  const orderId = uuid();

  let payuParams = null;
  let paymentExpiresAt = null;
  let paymentAttempts;

  if (paymentMethod === 'Online') {
    // No gateway API call here — PayU's hosted checkout is a hashed HTML
    // form POST, not a create-order API (unlike Cashfree), so this is pure
    // local computation and can't itself fail/need rollback.
    const normalizedPhone = normalizePhoneForPayu(customer.phone);
    paymentExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();

    // Attempt #1 for this order — a unique txnid per attempt (never the
    // bare orderId reused across retries), so PayU's dashboard can tell
    // separate attempts apart when an admin searches by it. See
    // payuService.buildTxnid and retryPayment below for attempt #2+.
    const txnid = payuService.buildTxnid(orderId, 1);
    const callbackUrl = `${resolveApiBaseUrl(req)}/api/payments/payu/callback`;
    payuParams = payuService.buildPaymentParams({
      txnid,
      amount: totals.total,
      productinfo: buildProductInfo(orderId),
      firstname: customer.name,
      email: customer.email || 'customer@satvex.co.in', // PayU requires a non-empty email even though our checkout no longer collects one
      phone: normalizedPhone,
      surl: callbackUrl,
      furl: callbackUrl,
    });
    paymentAttempts = [{ txnid, status: 'initiated', amount: totals.total, currency: 'INR', initiatedAt: new Date().toISOString() }];
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
      // payuParams built above were never POSTed to PayU (that only happens
      // once the frontend auto-submits the returned form) — nothing to
      // clean up on PayU's side for this edge case.
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
      shippingSource: totals.shippingSource,
      quotedFreightCharge: totals.quotedFreightCharge,
      quotedRtoCharge: totals.quotedRtoCharge,
      paymentMethod: totals.paymentMethod,
      codCharge: totals.codCharge,
      prepaidDiscount: totals.prepaidDiscount,
      total: totals.total,
      paymentStatus: paymentMethod === 'Online' ? 'awaiting_payment' : 'not_required',
      paymentExpiresAt,
      paymentAttempts,
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
  created(res, { order: toCustomerOrder(order), payuParams });
}

async function listMyOrders(req, res) {
  const orders = await orderService.listForUser(req.user.id);
  ok(res, { orders: orders.map(toCustomerOrder) });
}

async function getMyOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  ok(res, { order: toCustomerOrder(order) });
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
  const released = await releaseCancelledOrder(order);
  ok(res, { updated: true, status: 'Cancelled', shipmentCancelled: released.shipment.cancelled });
}

// Everything a cancelled order was still holding: the coupon use (so the
// customer can use it again) and the Shiprocket shipment (so no courier is
// sent). Shared by the customer cancel and the admin status change.
async function releaseCancelledOrder(order) {
  if (order.couponCode) {
    await couponService.decrementUsage(order.couponCode).catch(() => {});
    await couponRedemptionService.remove(order.couponCode, order.userId).catch(() => {});
  }
  const shipment = await shipmentService.cancelShipmentForOrder(order);
  return { shipment };
}

// Server-to-server reconciliation, used both as the confirmation-page
// polling target and as a fallback if the surl/furl callback is ever
// missed. Never trusts client-side redirect params — only ever a prior
// callback or this direct PayU verify_payment call.
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

  // PayU has no server-side "order" that expires on its own (unlike
  // Cashfree's order_expiry_time) — expiry is purely our own deadline.
  // Check it before even calling PayU: if we've already decided an order is
  // expired, there's nothing useful verify_payment could tell us that
  // changes that (a late success still routes through the separate "late
  // payment" path in markPaid, triggered by a delayed callback/poll that
  // arrives after this point, not by this check).
  if (order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() < Date.now()) {
    await finalizeExpiry(order);
    const fresh = await orderService.findById(req.params.id);
    return ok(res, {
      paymentStatus: fresh.paymentStatus,
      lastPaymentAttemptStatus: fresh.lastPaymentAttemptStatus || null,
      needsReview: fresh.needsReview || false,
    });
  }

  const txnid = latestAttemptTxnid(order);
  const result = await payuService.verifyPayment(txnid).catch(() => null);

  if (result?.status === 'success') {
    if (result.amount != null && result.amount !== Number(order.total)) {
      await orderService.flagForReview(order.orderId, 'Payment amount mismatch on reconciliation.');
    } else {
      await orderService.markPaid(order.orderId, { payuMihpayid: result.mihpayid, paidAt: new Date().toISOString() });
      await orderService.recordPaymentAttemptResult(order.orderId, { txnid, status: 'success', mihpayid: result.mihpayid, mode: result.mode, bankRefNum: result.bankRefNum });
      await shipmentService.triggerShipmentIfNeeded(order.orderId);
    }
  } else if (result?.status === 'failure') {
    await orderService.markPaymentAttempt(order.orderId, 'FAILED');
    await orderService.recordPaymentAttemptResult(order.orderId, { txnid, status: 'failure', mihpayid: result.mihpayid, mode: result.mode, bankRefNum: result.bankRefNum });
  } else if (result?.status === 'pending') {
    await orderService.markPaymentAttempt(order.orderId, 'PENDING');
    await orderService.recordPaymentAttemptResult(order.orderId, { txnid, status: 'pending', mode: result.mode });
  }
  // 'not_found' or an API error: leave the order as awaiting_payment,
  // exactly as the expiry sweep does — never expire or mark paid on an
  // inconclusive result.

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

// Regenerates PayU payment params for an order that's still awaiting
// payment and hasn't expired yet — after first confirming with PayU that
// the most recent attempt genuinely hasn't already succeeded. Unlike
// Cashfree's reusable payment_session_id, PayU has nothing to "re-fetch";
// this builds a fresh hashed form POST against a NEW, never-before-used
// txnid (attempt #2, #3, ...), not the previous attempt's — see
// payuService.buildTxnid.
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

  const previousTxnid = latestAttemptTxnid(order);
  const result = await payuService.verifyPayment(previousTxnid).catch(() => null);
  if (result?.status === 'success') {
    await orderService.markPaid(order.orderId, { payuMihpayid: result.mihpayid, paidAt: new Date().toISOString() });
    await orderService.recordPaymentAttemptResult(order.orderId, { txnid: previousTxnid, status: 'success', mihpayid: result.mihpayid, mode: result.mode, bankRefNum: result.bankRefNum });
    await shipmentService.triggerShipmentIfNeeded(order.orderId);
    return ok(res, { payuParams: null, alreadyPaid: true });
  }

  const attemptNumber = (order.paymentAttempts?.length || 0) + 1;
  const txnid = payuService.buildTxnid(order.orderId, attemptNumber);
  const normalizedPhone = normalizePhoneForPayu(order.customer.phone);
  const callbackUrl = `${resolveApiBaseUrl(req)}/api/payments/payu/callback`;
  const payuParams = payuService.buildPaymentParams({
    txnid,
    amount: order.total,
    productinfo: buildProductInfo(order.orderId),
    firstname: order.customer.name,
    email: order.customer.email || 'customer@satvex.co.in',
    phone: normalizedPhone,
    surl: callbackUrl,
    furl: callbackUrl,
  });
  // Logged before the customer is ever redirected to PayU, same reasoning
  // as checkout's attempt #1 — see recordPaymentAttemptInitiated.
  await orderService.recordPaymentAttemptInitiated(order.orderId, { txnid, amount: order.total });
  ok(res, { payuParams });
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

// Filtering, sorting and pagination all happen here, over every order - see
// services/adminListQueries.js.
async function adminListOrders(req, res) {
  const query = ordersQuerySchema.parse(req.query);
  const orders = await orderService.listEverything();
  const { items, pagination, facets } = queryOrders(orders, query);
  ok(res, { orders: items, pagination, facets });
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
  // Only on the transition INTO Cancelled, so re-saving a cancelled order
  // can't release the coupon or the shipment twice.
  let shipmentCancelled;
  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    shipmentCancelled = (await releaseCancelledOrder(order)).shipment.cancelled;
  }
  ok(res, { updated: true, status, ...(shipmentCancelled !== undefined ? { shipmentCancelled } : {}) });
}

// Full-refund-only (Decision 4) — the amount is always the order's own
// stored total, never taken from the client. Idempotent: refundStatus is
// written 'pending' BEFORE calling PayU, so a double-click or a retry after
// a network blip both hit the same guard and the second one no-ops.
//
// Unlike Cashfree, PayU's refund docs don't give a confirmed
// status-check command for resolving an ambiguous failure (did PayU
// receive the request or not?) — see payuService.initiateRefund's
// TODO(confirm). On any failure here the refund is recorded 'failed'
// outright rather than guessed as possibly-succeeded; an admin must
// check PayU's dashboard directly and, if it actually went through,
// reconcile manually. This is a real, documented gap, not an oversight.
async function adminRefund(req, res) {
  const { note } = refundSchema.parse(req.body || {});
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'paid') {
    throw new AppError('Only paid online orders can be refunded.', 400, 'NOT_REFUNDABLE');
  }
  if (!order.payuMihpayid) {
    throw new AppError('No PayU transaction ID is recorded for this order — cannot refund.', 400, 'NOT_REFUNDABLE');
  }

  const refundId = uuid();
  const guard = await orderService.recordRefundPending(order.orderId, { refundId, adminId: req.user.id });
  if (!guard.started) {
    throw new AppError('A refund has already been requested or completed for this order.', 409, 'REFUND_ALREADY_IN_PROGRESS');
  }

  try {
    await payuService.initiateRefund({ mihpayid: order.payuMihpayid, refundId, amount: order.total, note });
    const fresh = await orderService.findById(order.orderId);
    // 'pending', not 'success' — PayU refunds settle asynchronously and
    // this command only confirms PayU accepted the request, per
    // initiateRefund's own TODO(confirm) comment.
    await orderService.recordRefundResult(fresh, { refundId, status: 'pending', payuRefundId: refundId });
  } catch (err) {
    const fresh = await orderService.findById(order.orderId);
    await orderService.recordRefundResult(fresh, { refundId, status: 'failed', payuRefundId: null });
    throw err;
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
// last succeeded rather than re-doing completed steps. Bookkeeping lives in
// shipmentService.retryShipment, shared with the bulk "Retry All" endpoint
// below.
async function adminRetryShipment(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }

  const result = await shipmentService.retryShipment(order.orderId);
  if (!result.success) {
    throw new AppError(`Shipment retry failed: ${result.error}`, 502, 'SHIPMENT_RETRY_FAILED');
  }
  ok(res, { order: result.order });
}

// Admin "Shipment Sync Issues" list — every paid/confirmed order that
// hasn't finished the Shiprocket pipeline yet, bucketed by why (still
// retrying / exhausted retries / no job at all). See
// shipmentService.listSyncIssues for exactly what counts.
// `counts` always describe ALL sync issues (they drive the summary line and
// the Retry All confirmation); the filters/sort/page only shape `issues`.
async function adminShipmentSyncIssues(req, res) {
  const query = syncIssuesQuerySchema.parse(req.query);
  const { issues, counts } = await shipmentService.listSyncIssues();
  const { items, pagination, facets } = querySyncIssues(issues, query);
  ok(res, { issues: items, counts, pagination, facets });
}

// "Retry All Failed" — reruns retryShipment for every order currently
// showing up in the sync-issues list, sequentially with a short delay
// between each (same BATCH_DELAY_MS pattern as shipmentSweep.js) rather than
// in parallel, so a burst of retries doesn't hammer Shiprocket's API all at
// once. Each order still goes through the same lock as every other path
// (shipmentService.attemptShipmentCreation), so this can safely overlap with
// the scheduled sweep without double-booking anything.
async function adminRetryAllShipments(req, res) {
  const { issues } = await shipmentService.listSyncIssues();
  const result = { total: issues.length, succeeded: 0, failed: 0 };
  for (const issue of issues) {
    const outcome = await shipmentService.retryShipment(issue.orderId);
    if (outcome.success) result.succeeded += 1;
    else result.failed += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  ok(res, result);
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
  adminShipmentSyncIssues,
  adminRetryAllShipments,
  adminTestShiprocketConnection,
  finalizeExpiry,
};
