import { Link } from 'react-router-dom';
import { OrderStatusBadge } from './OrderStatusBadge';
import './OrderCard.css';

export function OrderCard({ order, onCancel, onReorder }) {
  const canCancel = order.status === 'Pending' || order.status === 'Confirmed';

  return (
    <div className="order-card">
      <div className="order-card-top">
        <div>
          <p className="order-card-number">#{order.orderId.slice(0, 8)}</p>
          <p className="order-card-date">{new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="order-card-items">
        {order.items.slice(0, 2).map((item, i) => (
          <div key={i} className="order-card-item">
            <img src={item.productImage} alt={item.productName} loading="lazy" />
            <div>
              <p className="order-card-item-name">{item.productName}</p>
              <p className="order-card-item-meta">
                {item.sellingOptionName} × {item.quantity}
              </p>
            </div>
          </div>
        ))}
        {order.items.length > 2 && <p className="order-card-more">+{order.items.length - 2} more</p>}
      </div>

      <div className="order-card-bottom">
        <span className="order-card-total">₹{order.total.toFixed(2)}</span>
        <div className="order-card-actions">
          {canCancel && onCancel && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          {onReorder && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onReorder}>
              Reorder
            </button>
          )}
          <Link to={`/account/orders/${order.orderId}`} className="btn btn-primary btn-sm">
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
