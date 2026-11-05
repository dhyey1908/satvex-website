const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const shiprocketService = require('./shiprocketService');
const logger = require('../utils/logger');
const { scanAll } = require('../utils/listQuery');

const TABLE = env.tables.orders;
const USER_INDEX = 'userId-createdAt-index';
const PAYMENT_EXPIRY_INDEX = 'paymentStatus-paymentExpiresAt-index';
const SHIPROCKET_ORDER_INDEX = 'shiprocketOrderId-index';

// The last three are set by the system, never picked by hand:
//   Awaiting confirmation  a COD order nobody has phoned yet (it is NOT sent to Shiprocket until an admin confirms)
//   Address needs fix      Shiprocket refused the order's data (400/422): edit the address, then retry
//   Shipping retry needed  Shiprocket was unreachable: retried automatically a few times
const AWAITING_CONFIRMATION = 'Awaiting confirmation';
const ADDRESS_NEEDS_FIX = 'Address needs fix';
const SHIPPING_RETRY_NEEDED = 'Shipping retry needed';
const ORDER_STATUSES = ['Pending', AWAITING_CONFIRMATION, 'Confirmed', ADDRESS_NEEDS_FIX, SHIPPING_RETRY_NEEDED, 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
// Statuses where a shipment has been asked for but is not (fully) booked yet.
const SHIPMENT_PROBLEM_STATUSES = [ADDRESS_NEEDS_FIX, SHIPPING_RETRY_NEEDED];

// Orders placed before payment tracking existed have no `paymentStatus` at
// all. Applied on every read path so the rule lives in exactly one place:
// a missing paymentStatus on a COD order reads as `not_required` (matches
// today's behavior exactly); on an Online order it reads as unpaid
// (`awaiting_payment`, so the shipping gate blocks it like any other unpaid
// order) and gets flagged for a human to look at.
function withLegacyPaymentStatus(order) {
  if (!order || order.paymentStatus) return order;
  if (order.paymentMethod === 'Online') {
    return {
      ...order,
      paymentStatus: 'awaiting_payment',
      needsReview: true,
      needsReviewReason: order.needsReviewReason || 'Pre-dates payment tracking',
    };
  }
  return { ...order, paymentStatus: 'not_required' };
}

async function createOrder({
  orderId,
  userId,
  items,
  customer,
  address,
  subtotal,
  couponCode,
  discountAmount,
  gstPercent,
  gstAmount,
  pricesIncludeGst,
  shipping,
  shippingCourier,
  shippingSource,
  quotedFreightCharge,
  quotedRtoCharge,
  paymentMethod,
  codCharge,
  prepaidDiscount,
  total,
  paymentStatus,
  paymentExpiresAt,
  paymentAttempts,
  deliveryNotVerified,
  deliveryEta,
}) {
  const now = new Date().toISOString();
  const order = {
    orderId: orderId || uuid(),
    userId,
    items,
    customer,
    address,
    subtotal,
    couponCode: couponCode || null,
    discountAmount: discountAmount || 0,
    // Rate/amount are both stored on the order (not just recomputed from
    // current settings) so a later GST-percent change in Admin never alters
    // the tax shown on a historical order.
    gstPercent: gstPercent || 0,
    gstAmount: gstAmount || 0,
    // true: the prices on this order already include GST (gstAmount is the part inside them).
    pricesIncludeGst: Boolean(pricesIncludeGst),
    shipping: shipping || 0,
    shippingCourier: shippingCourier || null,
    // How `shipping` was decided ('free' | 'shiprocket' | 'fallback…') and
    // the courier's own quoted cost — snapshotted for cost analytics so a
    // later settings change can't rewrite history. null when no quote was
    // made (free-shipping orders skip the rate lookup).
    shippingSource: shippingSource || null,
    quotedFreightCharge: quotedFreightCharge ?? null,
    quotedRtoCharge: quotedRtoCharge ?? null,
    paymentMethod: paymentMethod || 'COD',
    codCharge: codCharge || 0,
    prepaidDiscount: prepaidDiscount || 0,
    total,
    // COD waits for a phone call before anything is shipped ("Awaiting confirmation"; an admin confirms it from the
    // Orders screen, which is what sends it to Shiprocket). Online stays Pending until payment actually succeeds -
    // see markPaid below, which bumps it to Confirmed automatically once paymentStatus flips to paid.
    status: (paymentMethod || 'COD') === 'COD' ? AWAITING_CONFIRMATION : 'Pending',
    // Shiprocket could not be asked whether this pincode is serviceable when the order was placed: the order was
    // allowed through and is flagged so the admin checks it by hand.
    ...(deliveryNotVerified ? { deliveryNotVerified: true } : {}),
    ...(deliveryEta ? { deliveryEta } : {}),
    // COD: not_required. Online: awaiting_payment, with a 24h deadline that
    // also drives the expiry sweep's GSI query below.
    paymentStatus: paymentStatus || 'not_required',
    ...(paymentExpiresAt ? { paymentExpiresAt } : {}),
    // Shiprocket lifecycle (Step 2) — not_created until the shipment job
    // succeeds; see shipmentJobService.js / shipmentSweep.js.
    shipmentStatus: 'not_created',
    paymentAttemptCount: 0,
    // Full per-attempt audit trail (PayU txnid, amount, mode, mihpayid,
    // bank reference, failure reason, timestamps) — one entry per distinct
    // PayU payment attempt, each with its own unique txnid (never reused
    // across retries; see orderController's buildTxnid). Empty for COD.
    // See recordPaymentAttemptInitiated/recordPaymentAttemptResult below.
    paymentAttempts: paymentAttempts || [],
    couponReleased: false,
    needsReview: false,
    refundStatus: 'none',
    refundAttempts: [],
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: TABLE, Item: order }));
  return order;
}

async function findById(orderId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { orderId } }));
  return withLegacyPaymentStatus(result.Item) || null;
}

async function listForUser(userId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: USER_INDEX,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
    })
  );
  return (result.Items || []).map(withLegacyPaymentStatus);
}

// Admin order volume is expected to stay modest for this store, so a Scan with
// in-memory filtering avoids maintaining extra GSIs for status/search.
// Every order, across all Scan pages (a single Scan stops at 1 MB).
async function listEverything() {
  const items = await scanAll(docClient, TABLE);
  return items.map(withLegacyPaymentStatus);
}

async function listAll({ status, search, dateFrom, dateTo, paymentMethod, shipmentStatus } = {}) {
  let items = await listEverything();

  if (status) {
    items = items.filter((order) => order.status === status);
  }
  if (search) {
    const term = search.trim().toLowerCase();
    items = items.filter(
      (order) =>
        order.orderId.toLowerCase().includes(term) ||
        order.customer?.name?.toLowerCase().includes(term) ||
        order.customer?.email?.toLowerCase().includes(term) ||
        order.customer?.phone?.includes(term)
    );
  }
  // dateFrom/dateTo are plain YYYY-MM-DD strings (from an HTML date input) —
  // compared against the date portion of createdAt only, so "today" always
  // includes every order placed today regardless of time of day.
  if (dateFrom) {
    items = items.filter((order) => order.createdAt.slice(0, 10) >= dateFrom);
  }
  if (dateTo) {
    items = items.filter((order) => order.createdAt.slice(0, 10) <= dateTo);
  }
  if (paymentMethod) {
    items = items.filter((order) => order.paymentMethod === paymentMethod);
  }
  if (shipmentStatus) {
    items = items.filter((order) => (order.shipmentStatus || 'not_created') === shipmentStatus);
  }

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Candidates for the expiry sweep: awaiting_payment orders past their
// deadline. Query against the GSI, not a Scan — the sweep runs hourly and
// should touch only what's actually due, not the whole table.
async function listExpiryCandidates(nowIso) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: PAYMENT_EXPIRY_INDEX,
      KeyConditionExpression: 'paymentStatus = :status AND paymentExpiresAt <= :now',
      ExpressionAttributeValues: { ':status': 'awaiting_payment', ':now': nowIso },
      Limit: 50,
    })
  );
  return result.Items || [];
}

async function hasUserReceivedDeliveredProduct(userId, productId) {
  const orders = await listForUser(userId);
  return orders.some(
    (order) => order.status === 'Delivered' && (order.items || []).some((item) => item.productId === productId)
  );
}

// The delivered order that makes someone a verified buyer of this product
// (most recent first), or null. Its orderId is stored on the review.
async function findDeliveredOrderForProduct(userId, productId) {
  const orders = await listForUser(userId);
  const matches = orders
    .filter((o) => o.status === 'Delivered' && (o.items || []).some((i) => i.productId === productId))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return matches[0] || null;
}

async function updateStatus(orderId, status) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status, ':now': new Date().toISOString() },
    })
  );
}

// The order's shipment could not be booked. Parks it in Address needs fix / Shipping retry needed and keeps the
// exact reason (utils/shiprocketErrors.describeShipmentError). Only moves orders that are still waiting to ship -
// never one that is already Shipped, Delivered or Cancelled.
async function recordShipmentProblem(orderId, status, shipmentError) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET #status = :status, shipmentError = :err, updatedAt = :now',
        ConditionExpression: '#status IN (:s0, :s1, :s2, :s3, :s4)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':err': shipmentError,
          ':now': new Date().toISOString(),
          ':s0': 'Pending',
          ':s1': AWAITING_CONFIRMATION,
          ':s2': 'Confirmed',
          ':s3': ADDRESS_NEEDS_FIX,
          ':s4': SHIPPING_RETRY_NEEDED,
        },
      })
    );
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
}

// The shipment is booked: the order is Confirmed (a prepaid one carries on to Processing, as it always did) and
// any earlier shipment error is cleared.
async function recordShipmentBooked(orderId, { prepaid }) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET #status = :confirmed, updatedAt = :now REMOVE shipmentError',
        ConditionExpression: '#status IN (:s0, :s1, :s2)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':confirmed': 'Confirmed',
          ':now': new Date().toISOString(),
          ':s0': AWAITING_CONFIRMATION,
          ':s1': ADDRESS_NEEDS_FIX,
          ':s2': SHIPPING_RETRY_NEEDED,
        },
      })
    );
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
  if (prepaid) await advanceStatusIfEligible(orderId, 'Processing', ['Confirmed']);
}

// Admin edited the delivery address. The old and new address are kept on the order (who, when) so nothing is lost.
// Only while the order has not left: not Shipped / Delivered / Cancelled.
async function updateAddress(orderId, address, by, { deliveryNotVerified = false, deliveryEta = null } = {}) {
  const now = new Date().toISOString();
  const order = await findById(orderId);
  const entry = { at: now, by: by?.name || by?.id || 'admin', byId: by?.id || null, from: order.address, to: address };
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      // The delivery flags are re-decided for the new address (it may now be verified, or not).
      UpdateExpression:
        'SET address = :address, addressHistory = list_append(if_not_exists(addressHistory, :empty), :entry), deliveryNotVerified = :nv, deliveryEta = :eta, updatedAt = :now',
      ConditionExpression: 'attribute_exists(orderId) AND NOT (#status IN (:shipped, :delivered, :cancelled))',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':address': address,
        ':empty': [],
        ':entry': [entry],
        ':nv': Boolean(deliveryNotVerified),
        ':eta': deliveryEta || null,
        ':now': now,
        ':shipped': 'Shipped',
        ':delivered': 'Delivered',
        ':cancelled': 'Cancelled',
      },
    })
  );
  return entry;
}

// Why an admin cancelled (the reason chosen in the cancel dialog).
async function recordCancelReason(orderId, { reason, note, by }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET cancelReason = :reason, cancelNote = :note, cancelledBy = :by, cancelledAt = :now, updatedAt = :now',
      ExpressionAttributeValues: { ':reason': reason, ':note': note || null, ':by': by || 'admin', ':now': new Date().toISOString() },
    })
  );
}

// ---------- Payment lifecycle (Online orders only) ----------
// Every transition below is a conditional DynamoDB write keyed on the
// order's *current* paymentStatus/refundStatus — never a plain
// read-then-write. That's what makes concurrent triggers (the expiry
// sweep, a webhook, and an on-read reconcile all potentially firing near
// the same moment) safe: whichever write loses the race gets a
// ConditionalCheckFailedException and no-ops instead of corrupting state.

// Attempt-level log only — never drives paymentStatus itself (a failed
// attempt is not an order failure; the customer can retry). No condition
// needed: last-write-wins is fine for a display-only field.
async function markPaymentAttempt(orderId, status) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression:
        'SET lastPaymentAttemptStatus = :status, lastPaymentAttemptAt = :now, updatedAt = :now ADD paymentAttemptCount :one',
      ExpressionAttributeValues: { ':status': status, ':now': new Date().toISOString(), ':one': 1 },
    })
  );
}

// Logs a new PayU payment attempt (retryPayment only — the first attempt is
// included directly in createOrder's initial item). Appended, never
// overwritten, via list_append — atomic, no read-before-write needed, same
// pattern as refundAttempts below. `status: 'initiated'` is written before
// the customer is ever redirected to PayU, so even an attempt the customer
// abandons on PayU's own page (never posts back to our callback at all)
// still has an exact-txnid audit record, not just a silent gap.
async function recordPaymentAttemptInitiated(orderId, { txnid, amount }) {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression:
        'SET paymentAttempts = list_append(if_not_exists(paymentAttempts, :empty), :attempt), updatedAt = :now',
      ExpressionAttributeValues: {
        ':empty': [],
        ':attempt': [{ txnid, status: 'initiated', amount, currency: 'INR', initiatedAt: now }],
        ':now': now,
      },
    })
  );
}

// Resolves a logged attempt (found by its own unique txnid) to its final
// PayU-reported outcome — mode (UPI/CC/DC/etc), PayU's own transaction id,
// bank reference, and (for a failure) the reason, alongside the existing
// top-level lastPaymentAttemptStatus/payuMihpayid fields that drive the
// order's own paymentStatus transitions (markPaid/markPaymentAttempt) —
// this is purely the detailed audit record for admin/customer display, kept
// as a separate call so a caller that only needs the status transition
// (e.g. the expiry sweep) isn't forced to also have mode/bank-ref data on
// hand. Read-modify-write (no DynamoDB partial-array-element update exists)
// — safe to call more than once for the same txnid, since it simply
// overwrites that one entry with the latest data each time (e.g. a
// duplicate callback delivery resolving the same attempt twice).
async function recordPaymentAttemptResult(orderId, { txnid, status, mihpayid, mode, bankRefNum, errorMessage }) {
  const order = await findById(orderId);
  if (!order) return;
  const now = new Date().toISOString();
  const attempts = (order.paymentAttempts || []).map((a) =>
    a.txnid === txnid
      ? { ...a, status, mihpayid: mihpayid || null, mode: mode || null, bankRefNum: bankRefNum || null, errorMessage: errorMessage || null, completedAt: now }
      : a
  );
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET paymentAttempts = :attempts, updatedAt = :now',
      ExpressionAttributeValues: { ':attempts': attempts, ':now': now },
    })
  );
}

// Best-effort companion to markPaid: bumps the fulfilment `status` from
// Pending to Confirmed the moment payment succeeds, so an Online order
// doesn't sit at Pending forever waiting for a manual admin click once
// there's nothing left to wait for. Conditioned on status still being
// Pending — if an admin already manually advanced it further, this simply
// no-ops rather than clobbering that. Failures are swallowed: this is a
// convenience bump, not part of the payment-correctness guarantee that
// markPaid itself provides.
async function bumpStatusToConfirmedIfPending(orderId) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET #status = :confirmed, updatedAt = :now',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':confirmed': 'Confirmed', ':pending': 'Pending', ':now': new Date().toISOString() },
      })
    );
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
}

// Confirms a payment. Handles both the normal path (awaiting_payment ->
// paid) and the "late payment" path (expired -> paid, Decision 6: honored
// at the price already paid, coupon NOT re-consumed since it was already
// released on expiry, flagged for a human via needsReview). Idempotent: a
// duplicate webhook for an already-paid order no-ops safely. `paid` is
// never a FROM state for any transition here, so it can never be
// downgraded.
// payuMihpayid (PayU's own transaction id) is a NEW attribute name,
// deliberately not reusing the old cfPaymentId attribute — historical
// Cashfree orders keep their cfPaymentId untouched/unread by this new code;
// nothing is migrated or renamed on existing records.
async function markPaid(orderId, { payuMihpayid, paidAt }) {
  const now = new Date().toISOString();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET paymentStatus = :paid, payuMihpayid = :payuMihpayid, paidAt = :paidAt, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :awaiting',
        ExpressionAttributeValues: {
          ':paid': 'paid',
          ':awaiting': 'awaiting_payment',
          ':payuMihpayid': payuMihpayid,
          ':paidAt': paidAt,
          ':now': now,
        },
      })
    );
    await bumpStatusToConfirmedIfPending(orderId);
    return { updated: true, late: false };
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression:
          'SET paymentStatus = :paid, payuMihpayid = :payuMihpayid, paidAt = :paidAt, needsReview = :true, needsReviewReason = :reason, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :expired',
        ExpressionAttributeValues: {
          ':paid': 'paid',
          ':expired': 'expired',
          ':payuMihpayid': payuMihpayid,
          ':paidAt': paidAt,
          ':true': true,
          ':reason': 'Payment confirmed after order expiry — coupon was already released; order honored at the price paid.',
          ':now': now,
        },
      })
    );
    await bumpStatusToConfirmedIfPending(orderId);
    return { updated: true, late: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { updated: false };
    throw err;
  }
}

// Flags an order for admin attention without changing its payment state —
// used for the amount-mismatch case (a webhook reports success but the
// confirmed amount doesn't match the order total): not auto-accepted, not
// auto-rejected, surfaced for a human.
async function flagForReview(orderId, reason) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET needsReview = :true, needsReviewReason = :reason, updatedAt = :now',
      ExpressionAttributeValues: { ':true': true, ':reason': reason, ':now': new Date().toISOString() },
    })
  );
}

// 24h expiry, only ever called after the caller has already confirmed the
// order is NOT paid (either our own deadline check or a confirmed PayU
// verify_payment result — never on an API error/inconclusive result, see
// the expiry sweep). couponReleased is flipped in the same
// conditional write as the status change, guaranteeing release-exactly-once
// even if this races another trigger — returns whether THIS call is the
// one that won the race, so the caller knows whether it's responsible for
// actually releasing the coupon (couponService.decrementUsage +
// couponRedemptionService.remove).
async function markExpired(orderId) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET paymentStatus = :expired, couponReleased = :true, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :awaiting',
        ExpressionAttributeValues: { ':expired': 'expired', ':true': true, ':awaiting': 'awaiting_payment', ':now': new Date().toISOString() },
      })
    );
    return { transitioned: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { transitioned: false };
    throw err;
  }
}

// Refund idempotency guard: written BEFORE calling PayU, conditioned on the
// order not already having a refund in flight or completed. A double-click
// or a retried request both hit the same condition; the second one no-ops
// instead of firing a second PayU refund call.
async function recordRefundPending(orderId, { refundId, adminId }) {
  const now = new Date().toISOString();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression:
          'SET refundStatus = :pending, refundId = :refundId, refundRequestedAt = :now, refundedByAdminId = :adminId, updatedAt = :now, refundAttempts = list_append(if_not_exists(refundAttempts, :empty), :attempt)',
        ConditionExpression: 'refundStatus = :none OR refundStatus = :failed',
        ExpressionAttributeValues: {
          ':pending': 'pending',
          ':none': 'none',
          ':failed': 'failed',
          ':refundId': refundId,
          ':adminId': adminId,
          ':now': now,
          ':empty': [],
          ':attempt': [{ refundId, status: 'pending', requestedAt: now }],
        },
      })
    );
    return { started: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { started: false };
    throw err;
  }
}

// Resolves a pending refund to success/failed. Guarded on refundId matching
// the order's current one (so a stale/duplicate event can't clobber a
// newer retry attempt) and refundStatus still being 'pending'. Takes the
// already-fetched order (the caller read it to route the webhook/poll
// anyway) so the refundAttempts array can be updated in the same write
// without a second read.
async function recordRefundResult(order, { refundId, status, payuRefundId }) {
  const now = new Date().toISOString();
  const attempts = (order.refundAttempts || []).map((a) =>
    a.refundId === refundId ? { ...a, status, payuRefundId, processedAt: now } : a
  );
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId: order.orderId },
        UpdateExpression:
          'SET refundStatus = :status, payuRefundId = :payuRefundId, refundProcessedAt = :now, refundAttempts = :attempts, updatedAt = :now',
        ConditionExpression: 'refundId = :refundId AND refundStatus = :pending',
        ExpressionAttributeValues: {
          ':status': status,
          ':payuRefundId': payuRefundId || null,
          ':now': now,
          ':attempts': attempts,
          ':refundId': refundId,
          ':pending': 'pending',
        },
      })
    );
    return { updated: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { updated: false };
    throw err;
  }
}

// ---------- Shiprocket lifecycle (Step 2) ----------

// Prevents two concurrent shipment-sync attempts on the SAME order — the
// automatic sweep and an admin's manual retry (or "Retry All") button, or
// two admins clicking retry at once, could otherwise both call Shiprocket's
// create/AWB/label APIs for the same order at the same time. Conditioned on
// the lock being absent OR stale (older than LOCK_STALE_MS) so a crashed
// holder (Lambda timeout, cold-start death) can never permanently wedge an
// order — the next attempt, whenever it comes, just takes over.
const LOCK_STALE_MS = 2 * 60 * 1000; // longer than any single attemptShipmentCreation run should take

async function acquireShipmentLock(orderId) {
  const now = Date.now();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET shipmentLockedAt = :now',
        // attribute_exists(orderId) first: without it, an UpdateItem on a
        // non-existent order passes the lock condition and silently CREATES
        // a bare ghost record (just orderId + shipmentLockedAt), which then
        // shows up as a ₹0.00 empty order in the admin Orders list.
        ConditionExpression: 'attribute_exists(orderId) AND (attribute_not_exists(shipmentLockedAt) OR shipmentLockedAt < :stale)',
        ExpressionAttributeValues: { ':now': now, ':stale': now - LOCK_STALE_MS },
      })
    );
    return { acquired: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { acquired: false };
    throw err;
  }
}

// Best-effort — a failure to release just means the lock expires naturally
// after LOCK_STALE_MS instead of immediately; never worth throwing over.
async function releaseShipmentLock(orderId) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'REMOVE shipmentLockedAt',
      })
    );
  } catch (err) {
    logger.error('failed to release shipment lock (non-fatal)', { orderId, message: err.message });
  }
}

// Set once a shipment-sync job exhausts all retry attempts (see
// shipmentJobService.recordFailure / shipmentSweep.js) — gives a stuck paid
// order its own distinct status instead of sitting at 'not_created'
// indistinguishable from a brand-new unpaid order. Conditioned on not
// already being 'label_generated' so a late/racing failure report can never
// downgrade an order that actually finished successfully in the meantime.
async function markShipmentSyncFailed(orderId) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET shipmentStatus = :failed, updatedAt = :now',
        // attribute_exists(orderId): never upsert a ghost record for an
        // order that doesn't exist (see acquireShipmentLock).
        ConditionExpression: 'attribute_exists(orderId) AND shipmentStatus <> :done',
        ExpressionAttributeValues: { ':failed': 'sync_failed', ':done': 'label_generated', ':now': new Date().toISOString() },
      })
    );
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
}

// Set after the Shiprocket order has been cancelled because the customer/admin
// cancelled ours. A distinct value (not 'order_created') so the admin lists and
// the sync-issues rule can tell "nothing to ship" from "stuck".
async function markShipmentCancelled(orderId) {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET shipmentStatus = :cancelled, shipmentCancelledAt = :now, updatedAt = :now',
      ExpressionAttributeValues: { ':cancelled': 'cancelled', ':now': now },
    })
  );
}

async function recordShiprocketOrderCreated(orderId, { shiprocketOrderId, shiprocketShipmentId }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      // The shipment id is what Shiprocket's AWB / pickup / label calls are keyed by.
      UpdateExpression: `SET shiprocketOrderId = :srId, shipmentStatus = :status, updatedAt = :now${shiprocketShipmentId ? ', shiprocketShipmentId = :shipId' : ''}`,
      // Always stored as a string — Shiprocket's own response type for this
      // field is unconfirmed (see shiprocket_integration_notes.md), and a
      // GSI attribute's type must stay consistent across every item.
      ExpressionAttributeValues: {
        ':srId': String(shiprocketOrderId),
        ':status': 'order_created',
        ':now': new Date().toISOString(),
        ...(shiprocketShipmentId ? { ':shipId': String(shiprocketShipmentId) } : {}),
      },
    })
  );
}

// Used by Shiprocket's tracking webhook, which identifies the order by
// Shiprocket's own order id (sr_order_id in the webhook payload) — never
// ours. Query against the GSI, not a Scan.
async function findByShiprocketOrderId(shiprocketOrderId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: SHIPROCKET_ORDER_INDEX,
      KeyConditionExpression: 'shiprocketOrderId = :id',
      ExpressionAttributeValues: { ':id': String(shiprocketOrderId) },
    })
  );
  return result.Items?.[0] || null;
}

// Advances the customer-facing order.status forward only — never
// backward, and never if the order is Cancelled or already past
// targetStatus — by conditioning the write on the order's CURRENT status
// being one of eligibleFromStatuses. A failed condition means someone else
// already moved it further (or cancelled it) and is a normal, expected
// no-op, not an error.
async function advanceStatusIfEligible(orderId, targetStatus, eligibleFromStatuses) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET #status = :target, updatedAt = :now',
        ConditionExpression: '#status IN (' + eligibleFromStatuses.map((_, i) => `:s${i}`).join(',') + ')',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':target': targetStatus,
          ':now': new Date().toISOString(),
          ...eligibleFromStatuses.reduce((acc, s, i) => ({ ...acc, [`:s${i}`]: s }), {}),
        },
      })
    );
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
}

async function recordAwbAssigned(orderId, { awbCode, courierName, shiprocketShipmentId }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression:
        'SET awbCode = :awb, courierName = :courier, shiprocketShipmentId = :shipId, shipmentStatus = :status, updatedAt = :now',
      ExpressionAttributeValues: {
        ':awb': awbCode,
        ':courier': courierName,
        ':shipId': shiprocketShipmentId != null ? String(shiprocketShipmentId) : null,
        ':status': 'awb_assigned',
        ':now': new Date().toISOString(),
      },
    })
  );
  // A real AWB means Shiprocket has genuinely booked the shipment — safe to
  // call this "Processing" (being packed/awaiting courier pickup) without
  // overriding a manual admin status or a cancellation.
  await advanceStatusIfEligible(orderId, 'Processing', ['Pending', 'Confirmed']);
}

// The admin booked this shipment by hand in the Shiprocket panel (because the
// automatic booking failed). Stores Shiprocket's order id - which is what lets
// Shiprocket's tracking webhook find this order - plus the AWB/courier when
// known, and flags it so the automatic booking, the retry sweep and "Retry all"
// never create a second Shiprocket order for it.
//
// `replacing` (the shipment being swapped out: { shiprocketOrderId, awbCode, courierName, ... }) is set when the old
// Shiprocket order was cancelled and a new one made by hand. The old one is kept in previousShipments for the record,
// and everything that belonged to it is dropped - its AWB (so the tracking link), label, invoice, the "Cancelled"
// tracking events and delivery estimate - so neither the admin nor the customer is left looking at a dead shipment.
async function recordManualShipment(orderId, { shiprocketOrderId, awbCode, courierName, note, replacing = null }) {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      // Replaces every manual-link field (not merges), so an edit with the AWB
      // left blank clears a wrong AWB instead of keeping it.
      UpdateExpression:
        'SET shiprocketOrderId = :srId, awbCode = :awb, courierName = :courier, shipmentStatus = :status, shipmentManuallyLinked = :true, manualShipmentAt = :now, manualShipmentNote = :note, updatedAt = :now' +
        (replacing ? ', previousShipments = list_append(if_not_exists(previousShipments, :none), :previous)' : '') +
        (replacing
          ? ' REMOVE lastTrackingStatus, trackingEvents, lastWebhookPayload, lastWebhookAt, estimatedDeliveryDate, labelUrl, invoiceUrl, shiprocketShipmentId, shipmentCancelledAt'
          : ''),
      ConditionExpression: 'attribute_exists(orderId)',
      ExpressionAttributeValues: {
        ':srId': String(shiprocketOrderId),
        ':awb': awbCode || null,
        ':courier': courierName || null,
        ':status': awbCode ? 'awb_assigned' : 'order_created',
        ':true': true,
        ':now': now,
        ':note': note || null,
        ...(replacing ? { ':none': [], ':previous': [{ ...replacing, replacedAt: now }] } : {}),
      },
    })
  );
  // A confirmed order with a real shipment is "Processing" from here on.
  await advanceStatusIfEligible(orderId, 'Processing', ['Pending', 'Confirmed']);
}

// Undo a manual link (entered by mistake): the order goes back to "Sync Failed"
// so it shows up in Shipment Sync Issues again and can be re-linked or retried.
async function clearManualShipment(orderId) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression:
        'SET shipmentStatus = :failed, updatedAt = :now REMOVE shiprocketOrderId, awbCode, courierName, shipmentManuallyLinked, manualShipmentAt, manualShipmentNote',
      ConditionExpression: 'attribute_exists(orderId) AND shipmentManuallyLinked = :true',
      ExpressionAttributeValues: { ':failed': 'sync_failed', ':true': true, ':now': new Date().toISOString() },
    })
  );
}

async function recordPickupScheduled(orderId) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET shipmentStatus = :status, updatedAt = :now',
      ExpressionAttributeValues: { ':status': 'pickup_scheduled', ':now': new Date().toISOString() },
    })
  );
}

async function recordLabelGenerated(orderId, { labelUrl }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET labelUrl = :url, shipmentStatus = :status, updatedAt = :now',
      ExpressionAttributeValues: { ':url': labelUrl, ':status': 'label_generated', ':now': new Date().toISOString() },
    })
  );
}

async function recordInvoiceGenerated(orderId, { invoiceUrl }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET invoiceUrl = :url, updatedAt = :now',
      ExpressionAttributeValues: { ':url': invoiceUrl, ':now': new Date().toISOString() },
    })
  );
}

// Maps Shiprocket's raw current_status text to the clean customer-facing
// status list. Only entries actually confirmed (the real webhook sample in
// shiprocket_integration_notes.md, which shows "IN TRANSIT") plus the few
// other strings a live order has actually been observed to send are mapped
// — anything else passes through as Shiprocket's own raw string rather
// than guessing a translation, per the project's don't-guess rule. Expand
// this table as real webhook deliveries confirm more strings.
// Once a parcel is Delivered or has come back (RTO) nothing later is news.
const TERMINAL_TRACKING_STATUSES = new Set(['Delivered', 'RTO / Returned']);

const SHIPROCKET_STATUS_MAP = {
  'IN TRANSIT': 'In Transit',
  'OUT FOR DELIVERY': 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  CANCELED: 'Cancelled',
  RTO: 'RTO / Returned',
  'RTO DELIVERED': 'RTO / Returned',
  'PICKUP SCHEDULED': 'Pickup Scheduled',
  'PICKED UP': 'Picked Up',
  'SHIPMENT CREATED': 'Shipment Created',
};

function mapShiprocketStatus(rawStatus) {
  if (!rawStatus) return null;
  return SHIPROCKET_STATUS_MAP[String(rawStatus).toUpperCase()] || rawStatus;
}

// Called from the tracking webhook. Deliberately conservative: only ever
// auto-bumps our own fulfilment `status` to 'Delivered' on an unambiguous
// DELIVERED event. Does NOT map RTO to our 'Cancelled' status — ORDER_
// STATUSES has no RTO/Returned value, and mapping it to Cancelled would be
// factually wrong (the order was fulfilled, then returned, which is a
// different thing from never having shipped). Left as an explicit open
// design question for Step 4 (returns), not guessed here.
//
// Safety net: invoice generation is normally attempted right after the
// label step (shipmentService), but that's a best-effort call that can
// fail silently — a customer should never be stuck on "Delivered" with no
// invoice just because that one attempt happened to fail earlier. Also
// called from adminUpdateStatus when an admin manually marks an order
// Delivered, not just from the real webhook path — same reasoning applies
// either way, as long as a real shipment (shiprocketOrderId) actually
// exists. If it doesn't, there's genuinely nothing to generate an invoice
// from — correctly a no-op, not an error.
async function ensureInvoiceGenerated(orderId) {
  const current = await findById(orderId);
  if (current && !current.invoiceUrl && current.shiprocketOrderId) {
    try {
      const invoiceUrl = await shiprocketService.generateInvoice({ shiprocketOrderId: current.shiprocketOrderId });
      await recordInvoiceGenerated(orderId, { invoiceUrl });
    } catch (err) {
      logger.error('invoice generation failed (non-fatal)', { orderId, message: err.message });
    }
  }
}

// trackingEvents is an append-only timeline (DynamoDB list_append, atomic —
// no read-before-write needed) for the customer-facing tracking UI; it is
// not capped since a real order's event count (a handful of webhook
// deliveries over its lifetime) is nowhere near large enough to matter.
async function recordShipmentTracking(orderId, { shipmentStatus, courierName, currentStatus, rawPayload, estimatedDeliveryDate }) {
  const isDelivered = currentStatus === 'DELIVERED';
  const mappedStatus = mapShiprocketStatus(currentStatus);
  const now = new Date().toISOString();
  const event = { status: mappedStatus, courierName: courierName || null, timestamp: now };

  // Shiprocket retries webhooks and doesn't guarantee order. Without this a
  // repeated event added a second identical timeline row, and a late
  // "In Transit" after "Delivered" dragged the tracking status backwards.
  const current = await findById(orderId);
  if (current && current.lastTrackingStatus) {
    if (current.lastTrackingStatus === mappedStatus) return; // exact repeat
    if (TERMINAL_TRACKING_STATUSES.has(current.lastTrackingStatus)) return; // stale event after the final one
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: `SET shipmentStatus = :shipmentStatus, courierName = :courier, lastTrackingStatus = :mappedStatus, lastWebhookPayload = :raw, lastWebhookAt = :now, updatedAt = :now, trackingEvents = list_append(if_not_exists(trackingEvents, :empty), :newEvent)${
        estimatedDeliveryDate ? ', estimatedDeliveryDate = :etd' : ''
      }${isDelivered ? ', deliveredAt = :now' : ''}`,
      ExpressionAttributeValues: {
        ':shipmentStatus': shipmentStatus || null,
        ':courier': courierName || null,
        ':mappedStatus': mappedStatus,
        // Kept for debugging/audit ("keep the raw payload" per the brief) —
        // only the latest event; trackingEvents above is the real history.
        ':raw': rawPayload ? JSON.stringify(rawPayload) : null,
        ':now': now,
        ':empty': [],
        ':newEvent': [event],
        ...(estimatedDeliveryDate ? { ':etd': estimatedDeliveryDate } : {}),
      },
    })
  );

  // Both status transitions below are conditioned on the order's CURRENT
  // status, never overriding a manual admin status or a cancellation (see
  // advanceStatusIfEligible) — including Delivered, which previously set
  // unconditionally.
  if (isDelivered) {
    await advanceStatusIfEligible(orderId, 'Delivered', ['Pending', 'Confirmed', 'Processing', 'Shipped']);
    await ensureInvoiceGenerated(orderId);
  } else {
    // Real courier movement — safe to advance to "Shipped". Checked against
    // the raw Shiprocket string, not the mapped label, so it stays exact
    // even if the mapping table's wording changes later.
    const SHIPPED_TRIGGERS = new Set(['PICKED UP', 'IN TRANSIT', 'OUT FOR DELIVERY']);
    if (currentStatus && SHIPPED_TRIGGERS.has(String(currentStatus).toUpperCase())) {
      await advanceStatusIfEligible(orderId, 'Shipped', ['Pending', 'Confirmed', 'Processing']);
    }
  }
}

module.exports = {
  ORDER_STATUSES,
  AWAITING_CONFIRMATION,
  ADDRESS_NEEDS_FIX,
  SHIPPING_RETRY_NEEDED,
  SHIPMENT_PROBLEM_STATUSES,
  recordShipmentProblem,
  recordShipmentBooked,
  updateAddress,
  recordCancelReason,
  createOrder,
  findById,
  listForUser,
  listAll,
  listEverything,
  listExpiryCandidates,
  updateStatus,
  hasUserReceivedDeliveredProduct,
  findDeliveredOrderForProduct,
  markPaymentAttempt,
  recordPaymentAttemptInitiated,
  recordPaymentAttemptResult,
  markPaid,
  markExpired,
  flagForReview,
  recordRefundPending,
  recordRefundResult,
  acquireShipmentLock,
  releaseShipmentLock,
  markShipmentSyncFailed,
  recordShiprocketOrderCreated,
  recordManualShipment,
  clearManualShipment,
  markShipmentCancelled,
  findByShiprocketOrderId,
  recordAwbAssigned,
  recordPickupScheduled,
  recordLabelGenerated,
  recordInvoiceGenerated,
  ensureInvoiceGenerated,
  recordShipmentTracking,
};
