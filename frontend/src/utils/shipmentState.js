// Tracking statuses that mean the courier has actually moved the parcel; a shipment can no longer be swapped after these.
const PARCEL_MOVED = ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'RTO / Returned'];

// The order is still on, but its Shiprocket shipment was cancelled (in the Shiprocket panel, or by us) and nothing has
// replaced it yet. Its AWB and tracking link lead nowhere, so they are not shown to the customer meanwhile.
export const shipmentIsCancelled = (order) =>
  Boolean(order) && order.status !== 'Cancelled' && (order.shipmentStatus === 'cancelled' || /^cancel/i.test(order.lastTrackingStatus || ''));

export const parcelHasMoved = (order) => order.status === 'Delivered' || PARCEL_MOVED.includes(order.lastTrackingStatus);
