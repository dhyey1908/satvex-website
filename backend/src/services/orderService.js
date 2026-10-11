const { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const shiprocketService = require('./shiprocketService');
const logger = require('../utils/logger');

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
  shippingCourier,
  paymentMethod,
  codCharge,
  prepaidDiscount,
  total,
  paymentStatus,
  paymentExpiresAt,
  paymentAttempts,
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
    shippingCourier: shippingCourier || null,
    paymentMethod: paymentMethod || 'COD',
    codCharge: codCharge || 0,
    prepaidDiscount: prepaidDiscount || 0,
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
async function listAll({ status, search, dateFrom, dateTo, paymentMethod, shipmentStatus } = {}) {
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

async function recordShiprocketOrderCreated(orderId, { shiprocketOrderId }) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { orderId },
      UpdateExpression: 'SET shiprocketOrderId = :srId, shipmentStatus = :status, updatedAt = :now',
      // Always stored as a string — Shiprocket's own response type for this
      // field is unconfirmed (see shiprocket_integration_notes.md), and a
      // GSI attribute's type must stay consistent across every item.
      ExpressionAttributeValues: { ':srId': String(shiprocketOrderId), ':status': 'order_created', ':now': new Date().toISOString() },
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
const SHIPROCKET_STATUS_MAP = {
  'IN TRANSIT': 'In Transit',
  'OUT FOR DELIVERY': 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
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
  createOrder,
  findById,
  listForUser,
  listAll,
  listExpiryCandidates,
  updateStatus,
  hasUserReceivedDeliveredProduct,
  markPaymentAttempt,
  recordPaymentAttemptInitiated,
  recordPaymentAttemptResult,
  markPaid,
  markExpired,
  flagForReview,
  recordRefundPending,
  recordRefundResult,
  recordShiprocketOrderCreated,
  findByShiprocketOrderId,
  recordAwbAssigned,
  recordPickupScheduled,
  recordLabelGenerated,
  recordInvoiceGenerated,
  ensureInvoiceGenerated,
  recordShipmentTracking,
};
