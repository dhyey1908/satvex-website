// Rules that stop an order from showing contradictory statuses (e.g. "Processing"
// with an expired payment, or "Delivered" while shipping still says "Order Created").
// Pure functions: used by the admin status endpoint (to refuse the change) and by the
// admin list (to flag rows that already conflict).

const FULFILMENT_STATUSES = ['Confirmed', 'Processing', 'Shipped', 'Delivered'];
// Shipping states that mean "booked, not yet with the courier".
const PRE_DISPATCH = new Set(['order_created', 'awb_assigned', 'pickup_scheduled', 'label_generated']);

const isPaid = (order) => order.paymentMethod !== 'Online' || order.paymentStatus === 'paid';

// Has the parcel actually left? Courier tracking says so, or the admin linked a shipment by hand.
function hasDispatched(order) {
  if (order.shipmentManuallyLinked || order.deliveredAt) return true;
  if (order.lastTrackingStatus) return true;
  return !PRE_DISPATCH.has(order.shipmentStatus);
}

/** Why moving `order` to `status` would contradict its payment/shipping, or null when it is fine. */
function statusChangeProblem(order, status) {
  if (FULFILMENT_STATUSES.includes(status) && !isPaid(order)) {
    return { code: 'PAYMENT_NOT_CONFIRMED', message: 'This order has not been paid, so it cannot be moved to this status.' };
  }
  if (status === 'Delivered' && PRE_DISPATCH.has(order.shipmentStatus) && !hasDispatched(order)) {
    return {
      code: 'NOT_DISPATCHED',
      message: `Shipping still says "${String(order.shipmentStatus).replace(/_/g, ' ')}", so the order cannot be Delivered yet.`,
    };
  }
  return null;
}

/** Existing contradictions on an order, for the warning icon in the list. */
function statusConflicts(order) {
  const out = [];
  if (FULFILMENT_STATUSES.includes(order.status) && !isPaid(order)) {
    const why = order.paymentStatus === 'expired' ? 'expired' : 'not paid';
    out.push(`Payment ${why}, but the order is ${order.status}.`);
  }
  if (order.status === 'Delivered' && PRE_DISPATCH.has(order.shipmentStatus) && !hasDispatched(order)) {
    out.push(`Marked Delivered, but shipping says "${String(order.shipmentStatus).replace(/_/g, ' ')}".`);
  }
  return out;
}

module.exports = { statusChangeProblem, statusConflicts, FULFILMENT_STATUSES, PRE_DISPATCH };
