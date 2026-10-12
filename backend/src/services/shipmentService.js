const shiprocketService = require('./shiprocketService');
const shippingRateService = require('./shippingRateService');
const orderService = require('./orderService');
const settingsService = require('./settingsService');
const shipmentJobService = require('./shipmentJobService');
const logger = require('../utils/logger');

// Orchestrates the whole create-order -> assign-AWB -> schedule-pickup ->
// generate-label sequence for one order, called both from the immediate
// attempt (orderController, right when an order becomes paid/confirmed) and
// from the retry sweep (shipmentSweep.js) — same function either way, so
// the two paths can never drift into different behavior.
//
// Resumable by design: re-reads the order fresh and checks which steps are
// already recorded before calling Shiprocket again, so retrying after a
// PARTIAL failure (e.g. AWB assignment failed after order creation
// succeeded) never re-creates a duplicate Shiprocket order — it picks up
// exactly where it left off. Combined with createOrder's own idempotency
// (orderId is our own unique id, passed as Shiprocket's order_id), a
// duplicate webhook or a retried immediate attempt can never create two
// shipments for one order.
//
// KNOWN LIMITATION (open question, not guessed): the brief asks for AWB
// assignment to use "the same courier rule as the rate quote" (lowest rate
// or fastest). The confirmed real serviceability response (shiprocket_
// integration_notes.md, built from Shiprocket's own open-source MCP server)
// exposes courier_name/cutoff_time/etd/freight_charge/is_surface/
// rto_charges — NOT a courier id field assignAwb could use to force a
// specific courier. Without a confirmed id field, assignAwb is called
// without courier_id, so Shiprocket auto-assigns its own default courier —
// which may not be the one the customer was quoted. This re-runs the same
// selectCourier rule at booking time purely to log whether the courier
// Shiprocket actually assigned matches what was quoted, as a diagnostic;
// it cannot force the match. Confirm via scripts/shiprocket-sample-rate.js
// whether a usable id field exists before this can be fixed.
// Exported separately from attemptShipmentCreation so the lock can wrap the
// WHOLE attempt (every step), not just one DB write — see
// orderService.acquireShipmentLock's comment for why this exists: the
// automatic sweep, an admin's manual retry, and "Retry All" can otherwise
// all reach this same order at once.
async function attemptShipmentCreation(orderId) {
  const { acquired } = await orderService.acquireShipmentLock(orderId);
  if (!acquired) {
    throw new Error('Shipment sync for this order is already in progress — try again in a minute.');
  }
  try {
    return await attemptShipmentCreationLocked(orderId);
  } finally {
    await orderService.releaseShipmentLock(orderId);
  }
}

async function attemptShipmentCreationLocked(orderId) {
  const settings = await settingsService.getSettings();
  if (!settings.shiprocket?.enabled) {
    throw new Error('Shiprocket is not enabled in settings.');
  }
  if (!settings.shiprocket.pickupLocation) {
    throw new Error('Shiprocket pickupLocation is not configured in settings.');
  }

  let order = await orderService.findById(orderId);
  if (!order) throw new Error(`Order ${orderId} not found.`);

  // Step 1: create the Shiprocket order (skip if already done — the
  // resumability that makes this whole function idempotent). First checks
  // whether Shiprocket already has an order for us (covers a previous
  // createOrder call that succeeded on Shiprocket's side but whose response
  // we never got to save — see findOrderByChannelOrderId) before ever
  // calling createOrder again.
  if (!order.shiprocketOrderId) {
    const existing = await shiprocketService.findOrderByChannelOrderId(order.orderId);
    if (existing) {
      await orderService.recordShiprocketOrderCreated(orderId, { shiprocketOrderId: existing.shiprocketOrderId });
      order = await orderService.findById(orderId);
    }
  }
  if (!order.shiprocketOrderId) {
    const { lengthCm, breadthCm, heightCm, weightKg } = settings.shiprocket.defaultPackage || {};
    const [firstName, ...rest] = (order.customer?.name || '').trim().split(' ');

    // Best-effort diagnostic only — see the KNOWN LIMITATION note above.
    // Never blocks order creation if the lookup itself fails.
    try {
      const couriers = await shiprocketService.getServiceability({
        pickupPostcode: settings.shiprocket.pickupPincode,
        deliveryPostcode: order.address?.pincode,
        weightKg,
        cod: order.paymentMethod === 'COD',
      });
      const quotedChoice = shippingRateService.selectCourier(couriers, settings.shipping?.courierSelectionRule || 'lowest_rate');
      if (quotedChoice) {
        logger.info('shipment booking: courier quoted at rate-check time', { orderId, courierName: quotedChoice.courier_name });
      }
    } catch (err) {
      logger.error('shipment booking: diagnostic courier re-check failed (non-fatal)', { orderId, message: err.message });
    }

    const created = await shiprocketService.createOrder({
      orderId: order.orderId,
      orderDate: order.createdAt.slice(0, 10),
      pickupLocation: settings.shiprocket.pickupLocation,
      billingFirstName: firstName || order.customer?.name || 'Customer',
      billingLastName: rest.join(' '),
      billingAddress: order.address?.line1,
      billingCity: order.address?.city,
      billingPincode: Number(order.address?.pincode),
      billingState: order.address?.state,
      billingCountry: order.address?.country || 'India',
      billingEmail: order.customer?.email,
      billingPhone: Number(order.customer?.phone),
      // Shiprocket rejects an order whose line items repeat a SKU — our own
      // items can share a productId when the same product was added with
      // different variants/colors as separate cart lines, so the line's
      // index is appended to guarantee uniqueness regardless.
      // Include the selling option (e.g. "Combo of 2") in the name sent to
      // Shiprocket — otherwise the label/invoice they generate shows only
      // the bare product name, which is ambiguous when a product has
      // multiple pack-size/variant options.
      orderItems: (order.items || []).map((item, index) => ({
        name: item.sellingOptionName ? `${item.productName} - ${item.sellingOptionName}` : item.productName,
        sku: `${item.productId}-${index}`,
        units: item.quantity,
        sellingPrice: item.unitPrice,
      })),
      paymentMethod: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
      subTotal: order.subtotal,
      length: lengthCm,
      breadth: breadthCm,
      height: heightCm,
      weight: weightKg,
    });
    await orderService.recordShiprocketOrderCreated(orderId, { shiprocketOrderId: created.order_id });
    order = await orderService.findById(orderId);
  }

  // Step 2: assign AWB (skip if already done). No courier_id passed — see
  // the KNOWN LIMITATION note above.
  if (!order.awbCode) {
    const awb = await shiprocketService.assignAwb({ shiprocketOrderId: order.shiprocketOrderId });
    await orderService.recordAwbAssigned(orderId, {
      awbCode: awb.awbCode,
      courierName: awb.courierName,
      shiprocketShipmentId: awb.shipmentId,
    });
    order = await orderService.findById(orderId);
  }

  // Step 3: schedule pickup (best-effort — failure here shouldn't block the
  // label from being generated, and isn't itself something worth blocking
  // the whole job on; log and continue rather than throw).
  if (order.shipmentStatus !== 'pickup_scheduled' && order.shipmentStatus !== 'label_generated') {
    try {
      await shiprocketService.schedulePickup({
        shiprocketOrderId: order.shiprocketOrderId,
        pickupDate: new Date().toISOString().slice(0, 10),
      });
      await orderService.recordPickupScheduled(orderId);
      order = await orderService.findById(orderId);
    } catch (err) {
      logger.error('shiprocket pickup scheduling failed (non-fatal)', { orderId, message: err.message });
    }
  }

  // Step 4: generate label (skip if already done).
  if (!order.labelUrl && order.shiprocketShipmentId) {
    const labelUrl = await shiprocketService.generateLabel({ shipmentId: order.shiprocketShipmentId });
    await orderService.recordLabelGenerated(orderId, { labelUrl });
    order = await orderService.findById(orderId);
  }

  // Step 5: generate invoice (skip if already done, best-effort — never
  // blocks shipment creation on an invoice failure, same reasoning as
  // pickup scheduling above).
  if (!order.invoiceUrl && order.shiprocketOrderId) {
    try {
      const invoiceUrl = await shiprocketService.generateInvoice({ shiprocketOrderId: order.shiprocketOrderId });
      await orderService.recordInvoiceGenerated(orderId, { invoiceUrl });
    } catch (err) {
      logger.error('shiprocket invoice generation failed (non-fatal)', { orderId, message: err.message });
    }
  }

  return orderService.findById(orderId);
}

// Called from every place an order's status/paymentStatus transitions to
// Confirmed/paid (COD checkout, and every payment-confirmation path for
// Online — see orderController.checkout/getPaymentStatus/retryPayment,
// paymentController.webhook, expirePayments.js). Best-effort, never throws:
// tries immediately so most orders ship without waiting for the sweep, and
// falls back to a retry job on failure. A disabled feature (the default,
// current state — Shiprocket is not yet connected) is a silent no-op — it
// does NOT create a job, so turning Shiprocket off never leaves a backlog
// of jobs that will all fail the moment it's turned on.
async function triggerShipmentIfNeeded(orderId) {
  const settings = await settingsService.getSettings();
  if (!settings.shiprocket?.enabled) return;

  try {
    await attemptShipmentCreation(orderId);
  } catch (err) {
    const { created } = await shipmentJobService.createJob(orderId);
    if (created) {
      logger.error('immediate shiprocket attempt failed, queued for retry', { orderId, message: err.message });
    }
  }
}

// Shared by the admin "Retry Shipment" button and "Retry All Failed" (see
// orderController.adminRetryShipment/adminRetryAllShipments) — same
// bookkeeping either way: on success, mark any existing job done; on
// failure, reset an existing job for another round or create one if none
// existed yet (e.g. this order's very first attempt never even got a job,
// because Shiprocket was disabled at the time — see listSyncIssues below).
// Never throws — returns a result object so a bulk caller can tally
// successes/failures without needing try/catch per order.
async function retryShipment(orderId) {
  try {
    const order = await attemptShipmentCreation(orderId);
    const existingJob = await shipmentJobService.findByOrderId(orderId);
    if (existingJob) await shipmentJobService.markDone(orderId);
    return { success: true, order };
  } catch (err) {
    const existingJob = await shipmentJobService.findByOrderId(orderId);
    if (existingJob) await shipmentJobService.resetForManualRetry(orderId);
    else await shipmentJobService.createJob(orderId);
    return { success: false, error: err.message };
  }
}

// An order counts as "paid/confirmed" for sync-issue purposes if money has
// genuinely changed hands and is still with us: COD orders confirm on
// placement (no payment gate), Online orders only once paymentStatus is
// 'paid'. Cancelled orders and anything already refunded are excluded either
// way — per the brief, there's nothing left to ship for either.
function isPaidOrConfirmed(order) {
  if (order.status === 'Cancelled') return false;
  if (order.refundStatus === 'success') return false;
  if (order.paymentMethod === 'Online') return order.paymentStatus === 'paid';
  return true;
}

// Powers both the admin dashboard's warning card/count and the dedicated
// "Shipment Sync Issues" list (see orderController.adminShipmentSyncIssues).
// A paid/confirmed order with shipmentStatus !== 'label_generated' hasn't
// finished the pipeline — bucketed by its job's state: 'retrying' (job still
// has attempts left), 'failed' (job exhausted MAX_ATTEMPTS — see
// shipmentJobService/shipmentSweep), or 'no_job' (no job record exists at
// all, e.g. Shiprocket was disabled in settings at the moment this order
// became paid, so triggerShipmentIfNeeded never even queued one — see its
// own comment). All three are real, actionable problems; none is silently
// dropped. Scan-based, same reasoning as orderService.listAll — admin order
// volume for this store is modest enough that a Scan plus in-memory
// filtering is simpler and cheaper than maintaining another GSI.
async function listSyncIssues() {
  const orders = await orderService.listAll({});
  const candidates = orders.filter((o) => isPaidOrConfirmed(o) && o.shipmentStatus !== 'label_generated');

  const issues = await Promise.all(
    candidates.map(async (order) => {
      const job = await shipmentJobService.findByOrderId(order.orderId);
      const bucket = !job ? 'no_job' : job.status === 'failed' ? 'failed' : 'retrying';
      return {
        orderId: order.orderId,
        customerName: order.customer?.name || null,
        total: order.total,
        paidAt: order.paidAt || order.createdAt,
        paymentMethod: order.paymentMethod,
        shipmentStatus: order.shipmentStatus || 'not_created',
        bucket,
        attempts: job?.attempts ?? 0,
        lastError: job?.lastError ?? null,
      };
    })
  );

  issues.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  const counts = {
    total: issues.length,
    retrying: issues.filter((i) => i.bucket === 'retrying').length,
    failed: issues.filter((i) => i.bucket === 'failed').length,
    noJob: issues.filter((i) => i.bucket === 'no_job').length,
  };
  return { issues, counts };
}

module.exports = { attemptShipmentCreation, triggerShipmentIfNeeded, retryShipment, listSyncIssues };
