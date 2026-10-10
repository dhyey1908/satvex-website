import { effectivePaymentStatus, CUSTOMER_PAYMENT_LABELS } from '../utils/paymentStatus';
import './OrderStatusBadge.css';

const TONE_CLASS = {
  paid: 'status-delivered',
  expired: 'status-cancelled',
  failed: 'status-cancelled',
  dropped: 'status-cancelled',
  confirming: 'status-pending',
  awaiting: 'status-pending',
};

// Customer-facing payment-status pill — shown alongside the fulfilment
// OrderStatusBadge, not instead of it (they answer different questions:
// "where is my order" vs "did my payment go through"). Renders nothing for
// COD (not_required) — there's nothing to show.
export function PaymentStatusBadge({ order }) {
  const key = effectivePaymentStatus(order);
  const label = CUSTOMER_PAYMENT_LABELS[key];
  if (!label) return null;
  return <span className={`status-badge ${TONE_CLASS[key] || ''}`}>{label}</span>;
}
