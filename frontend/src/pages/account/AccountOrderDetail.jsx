import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { orderService } from '../../services/orderService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { OrderStatusBadge } from '../../components/OrderStatusBadge';
import { OrderTimeline } from '../../components/OrderTimeline';
import { OrderSummary } from '../../components/OrderSummary';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import './Account.css';

export function AccountOrderDetail() {
  useDocumentMeta({ title: 'Order Details' });

  const { id } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    orderService
      .getById(id)
      .then(({ order: o }) => setOrder(o))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

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
      showToast(`Added ${addedCount} item(s) to cart`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <Loader label="Loading order…" />;

  const canCancel = order.status === 'Pending' || order.status === 'Confirmed';

  return (
    <div>
      <div className="account-page-header-row" style={{ marginBottom: 16 }}>
        <h1 className="text-headline-lg">Order #{order.orderId.slice(0, 8)}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="account-form" style={{ maxWidth: '100%', marginBottom: 24 }}>
        <OrderTimeline status={order.status} />
      </div>

      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <OrderSummary
          subtotal={order.subtotal}
          discountAmount={order.discountAmount}
          couponCode={order.couponCode}
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
        <p style={{ marginTop: 8 }}>{order.customer.phone} · {order.customer.email}</p>
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
