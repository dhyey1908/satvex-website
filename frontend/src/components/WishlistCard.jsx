import { Link } from 'react-router-dom';
import { ImagePlaceholder } from './ImagePlaceholder';
import './WishlistCard.css';

export function WishlistCard({ item, onAddToCart, onRemove }) {
  return (
    <div className="wishlist-card">
      <Link to={`/product/${item.slug}`} className="wishlist-card-image">
        {item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <ImagePlaceholder />}
      </Link>
      <div className="wishlist-card-body">
        <Link to={`/product/${item.slug}`}>
          <h3>{item.name}</h3>
        </Link>
        <p className="wishlist-card-price">₹{item.basePrice}</p>
        {!item.isActive && <p className="wishlist-card-unavailable">No longer available</p>}
        <div className="wishlist-card-actions">
          {item.isActive && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onAddToCart}>
              Add to Cart
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
