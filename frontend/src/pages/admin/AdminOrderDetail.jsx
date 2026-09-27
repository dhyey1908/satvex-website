import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import './Admin.css';

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export function AdminOrderDetail() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

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

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <Loader label="Loading order…" />;

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
        <p style={{ fontWeight: 700, marginTop: 12 }}>Total: ₹{order.total.toFixed(2)}</p>
      </div>

      <div className="admin-form-section">
        <h3>Customer</h3>
        <p>{order.customer.name}</p>
        <p>{order.customer.email} · {order.customer.phone}</p>
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
