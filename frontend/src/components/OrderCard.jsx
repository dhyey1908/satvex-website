import { Link } from 'react-router-dom';
import { XCircle, RotateCcw, ArrowRight, Star } from 'lucide-react';
import { OrderStatusBadge } from './OrderStatusBadge';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { formatDate } from '../utils/date';
import './OrderCard.css';

export function OrderCard({ order, onCancel, onReorder, reviewedProductIds }) {
  const canCancel = order.status === 'Pending' || order.status === 'Confirmed';
  const canReview = order.status === 'Delivered';

  return (
    <div className="order-card">
      <div className="order-card-top">
        <div>
          <p className="order-card-number">#{order.orderId.slice(0, 8)}</p>
          <p className="order-card-date">{formatDate(order.createdAt)}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge order={order} />
        </div>
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
              {canReview && item.productSlug && (
                <Link to={`/product/${item.productSlug}#reviews`} className="order-card-review-link">
                  <Star size={12} />
                  {reviewedProductIds?.has(item.productId) ? 'Edit Review' : 'Write Review'}
                </Link>
              )}
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
              <XCircle size={14} /> Cancel
            </button>
          )}
          {onReorder && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onReorder}>
              <RotateCcw size={14} /> Reorder
            </button>
          )}
          <Link to={`/account/orders/${order.orderId}`} className="btn btn-primary btn-sm">
            View Details <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
