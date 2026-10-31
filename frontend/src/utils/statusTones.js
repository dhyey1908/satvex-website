// One colour system for every admin badge:
//   amber  Pending / Awaiting / Open        blue    Processing / Order Created
//   indigo Shipped / In transit             green   Delivered / Paid / Resolved / Live
//   red    Cancelled / Failed / Expired / RTO   grey  Not Created / Draft / Off
export const TONES = ['amber', 'blue', 'indigo', 'green', 'red', 'grey'];

const MAPS = {
  order: {
    Pending: 'amber',
    'Awaiting confirmation': 'amber',
    Confirmed: 'blue',
    'Address needs fix': 'red',
    'Shipping retry needed': 'amber',
    Processing: 'blue',
    Shipped: 'indigo',
    Delivered: 'green',
    Cancelled: 'red',
  },
  payment: { paid: 'green', confirming: 'amber', awaiting: 'amber', dropped: 'red', failed: 'red', expired: 'red', not_required: 'grey' },
  shipment: {
    not_created: 'grey',
    order_created: 'blue',
    awb_assigned: 'blue',
    pickup_scheduled: 'blue',
    label_generated: 'indigo',
    sync_failed: 'red',
    cancelled: 'red',
  },
  contact: { open: 'amber', in_progress: 'blue', resolved: 'green' },
  schedule: { live: 'green', scheduled: 'blue', expired: 'red', off: 'grey' },
};

/** @param kind 'order' | 'payment' | 'shipment' | 'contact' | 'schedule' */
export const toneFor = (kind, value) => MAPS[kind]?.[value] || 'grey';

export const PAYMENT_LABELS = {
  paid: 'Paid',
  expired: 'Expired',
  failed: 'Failed',
  dropped: 'Dropped',
  confirming: 'Confirming',
  awaiting: 'Awaiting',
  not_required: 'On delivery',
};
export const SHIPMENT_LABELS = {
  not_created: 'Not created',
  order_created: 'Order created',
  awb_assigned: 'AWB assigned',
  pickup_scheduled: 'Pickup scheduled',
  label_generated: 'Label ready',
  sync_failed: 'Sync failed',
  cancelled: 'Cancelled',
};
export const CONTACT_STATUS_LABELS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
export const SCHEDULE_LABELS = { live: 'Live', scheduled: 'Scheduled', expired: 'Expired', off: 'Off' };

/** live / scheduled / expired / off for an item with isActive + startDate/endDate (YYYY-MM-DD, IST). */
export function scheduleState(item, today) {
  if (item.isActive === false) return 'off';
  if (item.endDate && today > item.endDate) return 'expired';
  if (item.startDate && today < item.startDate) return 'scheduled';
  return 'live';
}
