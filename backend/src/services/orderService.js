const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.orders;
const USER_INDEX = 'userId-createdAt-index';
const PAYMENT_EXPIRY_INDEX = 'paymentStatus-paymentExpiresAt-index';
const SHIPROCKET_ORDER_INDEX = 'shiprocketOrderId-index';

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

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
  shipping,
  paymentMethod,
  codCharge,
  total,
  paymentStatus,
  paymentExpiresAt,
  // Optional — only set by the GoKwik sandbox checkout path (orderController's
  // checkoutViaGoKwik). Absent/undefined for every normal Cashfree/COD order,
  // which is how the rest of the codebase tells the two paths apart
  // (order.paymentProvider === 'gokwik').
  paymentProvider,
  gokwikOid,
  gokwikRequestId,
  gokwikMid,
  gokwikEnvironment,
  gokwikMode,
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
    shipping: shipping || 0,
    paymentMethod: paymentMethod || 'COD',
    codCharge: codCharge || 0,
    total,
    // COD has no payment gate to wait for, so it auto-confirms on
    // placement rather than sitting at Pending for no reason. Online stays
    // Pending until payment actually succeeds — see markPaid below, which
    // bumps it to Confirmed automatically once paymentStatus flips to paid.
    status: (paymentMethod || 'COD') === 'COD' ? 'Confirmed' : 'Pending',
    // COD: not_required. Online: awaiting_payment, with a 24h deadline that
    // also drives the expiry sweep's GSI query below.
    paymentStatus: paymentStatus || 'not_required',
    ...(paymentExpiresAt ? { paymentExpiresAt } : {}),
    ...(paymentProvider ? { paymentProvider, gokwikOid, gokwikRequestId, gokwikMid, gokwikEnvironment, gokwikMode } : {}),
    // Shiprocket lifecycle (plan §3) — not_created until the shipment job
    // succeeds; see shipmentJobService.js / shipmentSweep.js.
    shipmentStatus: 'not_created',
    paymentAttemptCount: 0,
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
async function listAll({ status, search } = {}) {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  let items = (result.Items || []).map(withLegacyPaymentStatus);

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
async function markPaid(orderId, { cfPaymentId, paidAt }) {
  const now = new Date().toISOString();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET paymentStatus = :paid, cfPaymentId = :cfPaymentId, paidAt = :paidAt, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :awaiting',
        ExpressionAttributeValues: {
          ':paid': 'paid',
          ':awaiting': 'awaiting_payment',
          ':cfPaymentId': cfPaymentId,
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
          'SET paymentStatus = :paid, cfPaymentId = :cfPaymentId, paidAt = :paidAt, needsReview = :true, needsReviewReason = :reason, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :expired',
        ExpressionAttributeValues: {
          ':paid': 'paid',
          ':expired': 'expired',
          ':cfPaymentId': cfPaymentId,
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

// GoKwik sandbox equivalent of markPaid above — deliberately a separate,
// self-contained function (not a shared helper with markPaid) so the live
// Cashfree payment-confirmation logic is never touched by GoKwik work.
// Same two-step conditional-write pattern for the same reason: idempotent
// against a duplicate webhook, and safe against the expiry sweep racing it.
async function markPaidGoKwik(orderId, { gokwikTransactionId, paidAt }) {
  const now = new Date().toISOString();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId },
        UpdateExpression: 'SET paymentStatus = :paid, gokwikTransactionId = :txnId, paidAt = :paidAt, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :awaiting',
        ExpressionAttributeValues: {
          ':paid': 'paid',
          ':awaiting': 'awaiting_payment',
          ':txnId': gokwikTransactionId,
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
          'SET paymentStatus = :paid, gokwikTransactionId = :txnId, paidAt = :paidAt, needsReview = :true, needsReviewReason = :reason, updatedAt = :now',
        ConditionExpression: 'paymentStatus = :expired',
        ExpressionAttributeValues: {
          ':paid': 'paid',
          ':expired': 'expired',
          ':txnId': gokwikTransactionId,
          ':paidAt': paidAt,
          ':true': true,
          ':reason': 'Payment confirmed after order expiry (GoKwik) — coupon was already released; order honored at the price paid.',
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

// 24h expiry, only ever called after the caller has already confirmed with
// Cashfree that the order is NOT paid (never on an API error or an ACTIVE
// response — see the expiry sweep). couponReleased is flipped in the same
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

// Refund idempotency guard: written BEFORE calling Cashfree, conditioned on
// the order not already having a refund in flight or completed. A
// double-click or a retried request both hit the same condition; the
// second one no-ops instead of firing a second Cashfree refund call.
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
async function recordRefundResult(order, { refundId, status, cfRefundId }) {
  const now = new Date().toISOString();
  const attempts = (order.refundAttempts || []).map((a) =>
    a.refundId === refundId ? { ...a, status, cfRefundId, processedAt: now } : a
  );
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId: order.orderId },
        UpdateExpression:
          'SET refundStatus = :status, cfRefundId = :cfRefundId, refundProcessedAt = :now, refundAttempts = :attempts, updatedAt = :now',
        ConditionExpression: 'refundId = :refundId AND refundStatus = :pending',
        ExpressionAttributeValues: {
          ':status': status,
          ':cfRefundId': cfRefundId || null,
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

// ---------- Shiprocket lifecycle (plan §3) ----------

async function recordShiprocketOrderCreated(orderId, { shiprocketOrderId }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET shiprocketOrderId = :srId, shipmentStatus = :status, shiprocketMode = :mode, updatedAt = :now',
      // Always stored as a string — Shiprocket's own response type for this
      // field is unconfirmed (see shiprocket_integration_notes.md), and a
      // GSI attribute's type must stay consistent across every item.
      ExpressionAttributeValues: {
        ':srId': String(shiprocketOrderId),
        ':status': 'order_created',
        // Stamped at creation time so admin can tell a mock shipment apart
        // from a real one after the fact, even if SHIPROCKET_MODE is later
        // changed — this order's own record never silently reinterprets.
        ':mode': env.shiprocket.mode,
        ':now': new Date().toISOString(),
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
      Limit: 1,
    })
  );
  return withLegacyPaymentStatus(result.Items?.[0]) || null;
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
        ':shipId': shiprocketShipmentId,
        ':status': 'awb_assigned',
        ':now': new Date().toISOString(),
      },
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

// Driven by Shiprocket's tracking webhook. Only auto-advances our own
// fulfilment `status` on an unambiguous DELIVERED event — same "bump on an
// unambiguous terminal signal" principle as bumpStatusToConfirmedIfPending.
// TODO(design question, not Shiprocket's — ours): ORDER_STATUSES has no
// RTO/Returned value, so an RTO webhook is recorded in shipmentStatus/
// lastTrackingStatus only and intentionally does NOT touch `status` — mapping
// it to 'Cancelled' would be factually wrong (the customer didn't cancel)
// and there's currently no better-fitting status to put it in.
async function recordShipmentTracking(orderId, { shipmentStatus, courierName, currentStatus }) {
  const now = new Date().toISOString();
  const isDelivered = currentStatus === 'DELIVERED';
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: `SET shipmentStatus = :shipmentStatus, courierName = :courier, lastTrackingStatus = :currentStatus, updatedAt = :now${isDelivered ? ', #status = :delivered' : ''}`,
      ...(isDelivered ? { ExpressionAttributeNames: { '#status': 'status' } } : {}),
      ExpressionAttributeValues: {
        ':shipmentStatus': shipmentStatus,
        ':courier': courierName,
        ':currentStatus': currentStatus,
        ':now': now,
        ...(isDelivered ? { ':delivered': 'Delivered' } : {}),
      },
    })
  );
}

module.exports = {
  ORDER_STATUSES,
  createOrder,
  findById,
  listForUser,
  listAll,
  listExpiryCandidates,
  updateStatus,
  hasUserReceivedDeliveredProduct,
  markPaymentAttempt,
  markPaid,
  markPaidGoKwik,
  markExpired,
  flagForReview,
  recordRefundPending,
  recordRefundResult,
  recordShiprocketOrderCreated,
  findByShiprocketOrderId,
  recordAwbAssigned,
  recordPickupScheduled,
  recordLabelGenerated,
  recordShipmentTracking,
};
