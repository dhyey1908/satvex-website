// Single source of truth for "what actually happened with this order's
// payment", used by every page that shows order status (admin list/detail,
// customer account list/detail). order.paymentStatus itself only ever
// holds not_required/awaiting_payment/paid/expired — a FAILED/PENDING
// payment ATTEMPT doesn't close the order on its own (the customer can
// still retry), so that detail lives in lastPaymentAttemptStatus instead
// and has to be layered on top here.
// Each page maps the returned key to its own label text/styling.
export function effectivePaymentStatus(order) {
  if (order.paymentMethod === 'COD') return 'not_required';
  if (order.paymentStatus === 'paid') return 'paid';
  if (order.paymentStatus === 'expired') return 'expired';
  if (order.paymentStatus === 'awaiting_payment') {
    if (order.lastPaymentAttemptStatus === 'FAILED') return 'failed';
    if (order.lastPaymentAttemptStatus === 'USER_DROPPED') return 'dropped';
    if (order.lastPaymentAttemptStatus === 'PENDING') return 'confirming';
    return 'awaiting';
  }
  return order.paymentStatus || 'awaiting';
}

// Short, customer-facing copy — used on the account order list/detail.
export const CUSTOMER_PAYMENT_LABELS = {
  not_required: null, // COD — nothing to show
  paid: 'Paid',
  expired: 'Payment Expired',
  failed: 'Payment Failed',
  dropped: 'Payment Not Completed',
  confirming: 'Confirming Payment',
  awaiting: 'Awaiting Payment',
};

// A payment in this state can still be retried from the account pages
// (same rule the backend enforces: Online + still awaiting_payment + not
// past its expiry).
export function canRetryPayment(order) {
  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'awaiting_payment') return false;
  if (order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() < Date.now()) return false;
  return true;
}
