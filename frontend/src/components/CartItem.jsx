import { Link } from 'react-router-dom';
import './CartItem.css';

export function CartItem({ item, onQuantityChange, onRemove, onSaveForLater, onMoveToCart }) {
  return (
    <div className="cart-item">
      <Link to={`/product/${item.productSlug}`} className="cart-item-image">
        <img src={item.productImage} alt={item.productName} loading="lazy" />
      </Link>

      <div className="cart-item-info">
        <Link to={`/product/${item.productSlug}`}>
          <h4>{item.productName}</h4>
        </Link>
        <p className="cart-item-option">{item.sellingOptionName}</p>
        {item.selectedColorDetails?.length > 0 ? (
          <div className="cart-item-colors">
            {item.selectedColorDetails.map((c, i) => (
              <span key={c.id + i} className="cart-item-color-chip">
                <span className="cart-item-color-dot" style={{ background: c.colorCode }} />
                {c.colorName}
              </span>
            ))}
          </div>
        ) : (
          <p className="cart-item-colors">{item.selectedColors?.length} color(s) selected</p>
        )}

        <div className="cart-item-controls">
          {onQuantityChange && (
            <div className="qty-stepper">
              <button type="button" onClick={() => onQuantityChange(Math.max(1, item.quantity - 1))} aria-label="Decrease quantity">
                −
              </button>
              <span>{item.quantity}</span>
              <button type="button" onClick={() => onQuantityChange(item.quantity + 1)} aria-label="Increase quantity">
                +
              </button>
            </div>
          )}
          {onSaveForLater && (
            <button type="button" className="btn-ghost btn-sm" onClick={onSaveForLater}>
              Save for later
            </button>
          )}
          {onMoveToCart && (
            <button type="button" className="btn-ghost btn-sm" onClick={onMoveToCart}>
              Move to cart
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div className="cart-item-price">₹{item.subtotal.toFixed(2)}</div>
    </div>
  );
}
