import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { OrderSummary } from '../../components/OrderSummary';
import { effectivePaymentStatus } from '../../utils/paymentStatus';
import './Admin.css';

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

// Admin's own, more detailed labels for the same underlying classification
// the customer-facing pages use (utils/paymentStatus.js's
// effectivePaymentStatus) — same source of truth, kept consistent across
// the whole app, just worded for an internal audience here.
const ADMIN_PAYMENT_LABELS = {
  not_required: 'N/A (Cash on Delivery)',
  paid: 'Paid',
  expired: 'Expired — Unpaid',
  failed: 'Awaiting Payment — last attempt Failed',
  dropped: 'Awaiting Payment — last attempt Dropped',
  confirming: 'Awaiting Payment — confirming with bank',
  awaiting: 'Awaiting Payment',
};

function paymentStatusLabel(order) {
  return ADMIN_PAYMENT_LABELS[effectivePaymentStatus(order)] || order.paymentStatus;
}

export function AdminOrderDetail() {
  const { id } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [retryingShipment, setRetryingShipment] = useState(false);

  function load() {
    setError(null);
    adminService
      .order(id)
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  async function handleStatusChange(status) {
    setUpdating(true);
    try {
      await adminService.updateOrderStatus(id, status);
      showToast('Order status updated', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  async function handleRefund() {
    const ok = await confirm({
      title: 'Refund this order?',
      message: `This issues a full refund of ₹${order.total.toFixed(2)} via Cashfree. This cannot be undone.`,
      confirmLabel: 'Refund',
      danger: true,
    });
    if (!ok) return;
    setRefunding(true);
    try {
      await adminService.refundOrder(id);
      showToast('Refund initiated', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRefunding(false);
    }
  }

  async function handleRetryShipment() {
    setRetryingShipment(true);
    try {
      await adminService.retryShipment(id);
      showToast('Shipment retry succeeded', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetryingShipment(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <Loader label="Loading order…" />;

  const canRefund =
    order.paymentMethod === 'Online' &&
    order.paymentStatus === 'paid' &&
    order.refundStatus !== 'pending' &&
    order.refundStatus !== 'success';

  return (
    <div>
      <div className="admin-page-header">
        <h1>Order #{order.orderId.slice(0, 8)}</h1>
        <select value={order.status} disabled={updating} onChange={(e) => handleStatusChange(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {order.needsReview && (
        <div className="admin-alert-banner">
          <AlertTriangle size={18} />
          <span>Needs review — {order.needsReviewReason || 'flagged for manual attention'}</span>
        </div>
      )}

      <div className="admin-form-section">
        <h3>Items</h3>
        {order.items.map((item, i) => (
          <div key={i} className="repeatable-row">
            <span style={{ flex: 2 }}>
              {item.productName} · {item.sellingOptionName} × {item.quantity}
            </span>
            <span>₹{item.subtotal.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="admin-form-section" style={{ maxWidth: 420 }}>
        <OrderSummary
          subtotal={order.subtotal}
          discountAmount={order.discountAmount}
          couponCode={order.couponCode}
          gstPercent={order.gstPercent}
          gstAmount={order.gstAmount}
          shipping={order.shipping}
          codCharge={order.codCharge}
          prepaidDiscount={order.prepaidDiscount}
          total={order.total}
        />
      </div>

      <div className="admin-form-section">
        <h3>Customer</h3>
        <p>{order.customer.name}</p>
        <p>{order.customer.email} · {order.customer.phone}</p>
        <p>
          Payment Method: <strong>{order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online Payment'}</strong>
        </p>
        {order.paymentMethod === 'Online' && (
          <>
            <p>
              Payment Status:{' '}
              <span className={`pill ${order.paymentStatus === 'paid' ? 'pill-active' : 'pill-inactive'}`}>
                {paymentStatusLabel(order)}
              </span>
            </p>
            {order.paymentAttemptCount > 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {order.paymentAttemptCount} payment attempt{order.paymentAttemptCount === 1 ? '' : 's'}
                {order.lastPaymentAttemptAt ? ` · last at ${new Date(order.lastPaymentAttemptAt).toLocaleString()}` : ''}
              </p>
            )}
            {order.refundStatus && order.refundStatus !== 'none' && (
              <p>
                Refund Status: <strong>{order.refundStatus}</strong>
                {order.refundAmount ? ` — ₹${Number(order.refundAmount).toFixed(2)}` : ''}
              </p>
            )}
            {canRefund && (
              <button type="button" className="btn btn-danger btn-sm" onClick={handleRefund} disabled={refunding}>
                {refunding ? 'Processing…' : 'Refund Order'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="admin-form-section">
        <h3>Shipment</h3>
        <p>
          Status: <strong>{order.shipmentStatus || 'not_created'}</strong>
        </p>
        {order.awbCode && (
          <p>
            AWB: <strong>{order.awbCode}</strong> {order.courierName ? `(${order.courierName})` : ''}
          </p>
        )}
        {order.labelUrl && (
          <p>
            <a href={order.labelUrl} target="_blank" rel="noreferrer">
              Download Label
            </a>
          </p>
        )}
        {order.invoiceUrl && (
          <p>
            <a href={order.invoiceUrl} target="_blank" rel="noreferrer">
              Download Invoice
            </a>
          </p>
        )}
        {order.lastTrackingStatus && (
          <p>
            Last Tracking Update: <strong>{order.lastTrackingStatus}</strong>
          </p>
        )}
        {order.shipmentStatus !== 'label_generated' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleRetryShipment} disabled={retryingShipment}>
            {retryingShipment ? 'Retrying…' : 'Retry Shipment'}
          </button>
        )}
      </div>

      <div className="admin-form-section">
        <h3>Shipping Address</h3>
        <p>{order.address.line1}</p>
        <p>
          {order.address.city}, {order.address.state} {order.address.pincode}
        </p>
        <p>{order.address.country}</p>
      </div>
    </div>
  );
}
