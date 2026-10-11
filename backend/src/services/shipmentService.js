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
async function attemptShipmentCreation(orderId) {
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
  // resumability that makes this whole function idempotent).
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
      orderItems: (order.items || []).map((item) => ({
        name: item.productName,
        sku: item.productId,
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

module.exports = { attemptShipmentCreation, triggerShipmentIfNeeded };
