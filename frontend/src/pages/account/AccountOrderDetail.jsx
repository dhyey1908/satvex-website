import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, Loader2, RefreshCw, Truck } from 'lucide-react';
import { orderService } from '../../services/orderService';
import { reviewService } from '../../services/reviewService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useCart } from '../../context/CartContext';
import { OrderStatusBadge } from '../../components/OrderStatusBadge';
import { PaymentStatusBadge } from '../../components/PaymentStatusBadge';
import { OrderTimeline } from '../../components/OrderTimeline';
import { OrderSummary } from '../../components/OrderSummary';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { redirectToPayuCheckout } from '../../utils/payu';
import { canRetryPayment } from '../../utils/paymentStatus';
import { formatDateTime } from '../../utils/date';
import './Account.css';

export function AccountOrderDetail() {
  useDocumentMeta({ title: 'Order Details' });

  const { id } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [reviewedProductIds, setReviewedProductIds] = useState(new Set());
  const [retrying, setRetrying] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState(false);

  function load() {
    setError(null);
    orderService
      .getById(id)
      .then(({ order: o }) => setOrder(o))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    reviewService
      .listMine()
      .then((data) => setReviewedProductIds(new Set(data.reviews.map((r) => r.productId))))
      .catch(() => {});
  }, []);

  async function handleCancel() {
    const ok = await confirm({
      title: 'Cancel this order?',
      message: 'This will cancel your order. This cannot be undone.',
      confirmLabel: 'Cancel Order',
      cancelLabel: 'Keep Order',
      danger: true,
    });
    if (!ok) return;
    try {
      await orderService.cancel(id);
      showToast('Order cancelled', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleReorder() {
    try {
      const { addedCount } = await orderService.reorder(id);
      await refreshCart();
      showToast(`Added ${addedCount} item(s) to cart`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleRetryPayment() {
    setRetrying(true);
    try {
      const { payuParams, alreadyPaid } = await orderService.retryPayment(id);
      if (alreadyPaid) {
        showToast('Good news — this order is already paid.', 'success');
        load();
        return;
      }
      await redirectToPayuCheckout(payuParams);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetrying(false);
    }
  }

  async function handleRefreshTracking() {
    setRefreshingTracking(true);
    try {
      const { order: updated } = await orderService.refreshTracking(id);
      setOrder(updated);
      showToast('Tracking updated', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRefreshingTracking(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <Loader label="Loading order…" />;

  const canCancel = order.status === 'Pending' || order.status === 'Confirmed';
  const showRetryPayment = canRetryPayment(order);

  return (
    <div>
      <div className="account-page-header-row" style={{ marginBottom: 16 }}>
        <h1 className="text-headline-lg">Order #{order.orderId.slice(0, 8)}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge order={order} />
        </div>
      </div>

      <div className="account-form" style={{ maxWidth: '100%', marginBottom: 24 }}>
        <OrderTimeline status={order.status} />
      </div>

      {order.awbCode && (
        <div className="account-form" style={{ maxWidth: '100%', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <Truck size={18} /> Shipment Tracking
            </h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleRefreshTracking} disabled={refreshingTracking}>
              {refreshingTracking ? (
                <Loader2 size={14} className="btn-spinner" />
              ) : (
                <>
                  <RefreshCw size={14} /> Refresh
                </>
              )}
            </button>
          </div>
          <p style={{ margin: '12px 0 0' }}>
            Status: <strong>{order.lastTrackingStatus || 'Shipment Created'}</strong>
          </p>
          <p style={{ margin: '4px 0 0' }}>
            Courier: <strong>{order.courierName || '—'}</strong> &nbsp;·&nbsp; AWB: <strong>{order.awbCode}</strong>
          </p>
          {order.estimatedDeliveryDate && (
            <p style={{ margin: '4px 0 0' }}>
              Estimated Delivery: <strong>{order.estimatedDeliveryDate}</strong>
            </p>
          )}
          {order.trackingEvents && order.trackingEvents.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {order.trackingEvents
                .slice()
                .reverse()
                .map((ev, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9rem' }}>
                    <span>{ev.status}{ev.courierName ? ` — ${ev.courierName}` : ''}</span>
                    <span className="field-hint">{formatDateTime(ev.timestamp)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Shown independent of the tracking block above (which needs a real
          AWB) so an invoice is never hidden from a customer just because
          some other shipment field happens to be missing. */}
      {order.invoiceUrl && (
        <div className="account-form" style={{ maxWidth: '100%', marginBottom: 20 }}>
          <a href={order.invoiceUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            Download Invoice
          </a>
        </div>
      )}

      <p className="field-hint" style={{ marginBottom: showRetryPayment ? 8 : 20 }}>
        Payment Method: <strong>{order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online Payment'}</strong>
      </p>

      {showRetryPayment && (
        <div style={{ marginBottom: 20 }}>
          <p className="field-hint" style={{ marginBottom: 8 }}>
            {order.lastPaymentAttemptStatus === 'FAILED' && 'Your last payment attempt failed — nothing was charged.'}
            {order.lastPaymentAttemptStatus === 'USER_DROPPED' && 'Your last payment attempt was not completed — nothing was charged.'}
            {!order.lastPaymentAttemptStatus && 'This order is still awaiting payment.'}{' '}
            You can pay again below.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleRetryPayment} disabled={retrying}>
            {retrying ? <Loader2 size={16} className="btn-spinner" /> : 'Retry Payment'}
          </button>
        </div>
      )}

      <div style={{ maxWidth: 480, marginBottom: 20 }}>
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
          itemsSlot={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {order.items.map((item, i) => (
                <div key={i} className="order-card-item" style={{ padding: '6px 0' }}>
                  <img src={item.productImage} alt={item.productName} />
                  <div style={{ flex: 1 }}>
                    <p className="order-card-item-name">{item.productName}</p>
                    <p className="order-card-item-meta">
                      {item.sellingOptionName} × {item.quantity}
                    </p>
                    {order.status === 'Delivered' && item.productSlug && (
                      <Link to={`/product/${item.productSlug}#reviews`} className="order-card-review-link">
                        <Star size={12} />
                        {reviewedProductIds.has(item.productId) ? 'Edit Review' : 'Write Review'}
                      </Link>
                    )}
                  </div>
                  <span style={{ fontWeight: 600 }}>₹{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
          }
        />
      </div>

      <div className="account-form" style={{ maxWidth: '100%', marginBottom: 20 }}>
        <h3>Shipping Address</h3>
        <p style={{ margin: 0 }}>{order.customer.name}</p>
        <p style={{ margin: 0 }}>{order.address.line1}</p>
        <p style={{ margin: 0 }}>
          {order.address.city}, {order.address.state} {order.address.pincode}
        </p>
        <p style={{ margin: 0 }}>{order.address.country}</p>
        <p style={{ marginTop: 8 }}>{order.customer.phone}{order.customer.email ? ` · ${order.customer.email}` : ''}</p>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {canCancel && (
          <button type="button" className="btn btn-outline" onClick={handleCancel}>
            Cancel Order
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={handleReorder}>
          Reorder
        </button>
      </div>
    </div>
  );
}
