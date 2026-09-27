import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orderService } from '../services/orderService';
import { OrderSummary } from '../components/OrderSummary';
import { Loader } from '../components/Loader';
import { ErrorState } from '../components/ErrorState';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './OrderConfirmation.css';

export function OrderConfirmation() {
  useDocumentMeta({ title: 'Order Confirmed' });

  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    orderService
      .getById(id)
      .then(({ order: o }) => setOrder(o))
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!order) return <Loader label="Loading order…" />;

  return (
    <div className="container section order-confirmation">
      <div className="order-confirmation-badge">✓</div>
      <h1>Order Confirmed</h1>
      <p className="order-confirmation-thanks">
        Thank you, {order.customer.name.split(' ')[0]}! Your order has been placed successfully.
      </p>
      <p className="order-confirmation-number">
        Order Number: <strong>SATVEX-{order.orderId.slice(0, 8).toUpperCase()}</strong>
      </p>

      <div className="order-confirmation-grid">
        <OrderSummary
          subtotal={order.subtotal}
          discountAmount={order.discountAmount}
          couponCode={order.couponCode}
          total={order.total}
          itemsSlot={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {order.items.map((item, i) => (
                <div key={i} className="checkout-summary-item">
                  <span>
                    {item.productName} · {item.sellingOptionName} × {item.quantity}
                  </span>
                  <span>₹{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
          }
        />

        <div className="card order-confirmation-address">
          <h3>Shipping To</h3>
          <p style={{ margin: 0 }}>{order.customer.name}</p>
          <p style={{ margin: 0 }}>{order.address.line1}</p>
          <p style={{ margin: 0 }}>
            {order.address.city}, {order.address.state} {order.address.pincode}
          </p>
          <p style={{ margin: 0 }}>{order.address.country}</p>
          <p className="order-confirmation-processing">
            Your order is <strong>{order.status}</strong> and will be processed within 1-2 business days.
          </p>
        </div>
      </div>

      <div className="order-confirmation-actions">
        <Link to="/account/orders" className="btn btn-outline">
          View My Orders
        </Link>
        <Link to="/shop" className="btn btn-primary">
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
