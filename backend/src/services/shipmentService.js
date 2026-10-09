const shiprocketService = require('./shiprocketService');
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
// exactly where it left off.
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

  // Step 1: create the Shiprocket order (skip if already done).
  if (!order.shiprocketOrderId) {
    const { lengthCm, breadthCm, heightCm, weightKg } = settings.shiprocket.defaultPackage || {};
    const [firstName, ...rest] = (order.customer?.name || '').trim().split(' ');
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

  // Step 2: assign AWB (skip if already done).
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
  }

  return orderService.findById(orderId);
}

// Called from every place an order's status transitions to 'Confirmed'
// (checkout for COD, and every payment-confirmation path for Online — see
// orderController.checkout/checkoutViaGoKwik/getPaymentStatus,
// paymentController.webhook, gokwikController.webhook, expirePayments.js).
// Best-effort, never throws: tries immediately so most orders ship without
// waiting for the 10-minute sweep, and falls back to a retry job on
// failure. A disabled feature (the common case until this is verified end
// to end) is a silent no-op — it does NOT create a job, so turning
// Shiprocket off never leaves a backlog of jobs that will all fail the
// moment it's turned on.
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
