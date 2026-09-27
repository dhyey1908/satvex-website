import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { ImagePlaceholder } from './ImagePlaceholder';
import { HeartIcon, BagIcon, StarIcon } from './Icons';
import './ProductCard.css';

export function ProductCard({ product }) {
  const { isAuthenticated } = useAuth();
  const { isInWishlist, addItem, removeItem } = useWishlist();
  const { addItem: addToCart } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const inWishlist = isInWishlist(product.productId);

  const activeOptions = (product.sellingOptions || []).filter((o) => o.isActive);
  const startingOption = activeOptions.reduce(
    (min, o) => (!min || o.price < min.price ? o : min),
    null
  );
  const singleOption = activeOptions.find((o) => o.quantity === 1);
  const startingPrice = startingOption?.price ?? product.basePrice;
  const compareAtPrice = startingOption?.compareAtPrice;
  const onSale = compareAtPrice && compareAtPrice > startingPrice;

  const activeVariants = (product.variants || []).filter((v) => v.isActive);
  const outOfStock = !product.isActive || activeOptions.length === 0 || activeVariants.length === 0;
  const canQuickAdd = !outOfStock && singleOption && activeVariants.length > 0;

  async function quickAdd(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }

    try {
      await addToCart({
        productId: product.productId,
        sellingOptionId: singleOption.id,
        selectedColors: [activeVariants[0].id],
        quantity: 1,
      });
      showToast('Added to bag', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function toggleWishlist(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }

    try {
      if (inWishlist) {
        await removeItem(product.productId);
        showToast('Removed from wishlist');
      } else {
        await addItem(product.productId);
        showToast('Added to wishlist', 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Link to={`/product/${product.slug}`} className="product-card">
      <div className="product-card-image">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} loading="lazy" />
        ) : (
          <ImagePlaceholder />
        )}

        <div className="product-card-badges">
          {outOfStock && <span className="badge-pill badge-outofstock">Out of Stock</span>}
          {!outOfStock && onSale && <span className="badge-pill badge-sale">Sale</span>}
        </div>

        <button
          type="button"
          className={`wishlist-toggle ${inWishlist ? 'active' : ''}`}
          onClick={toggleWishlist}
          aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <HeartIcon fill={inWishlist ? 'currentColor' : 'none'} />
        </button>

        {canQuickAdd && (
          <button type="button" className="product-card-quick-add" onClick={quickAdd}>
            <BagIcon width={16} height={16} />
            <span>Add to Bag</span>
          </button>
        )}
      </div>
      <div className="product-card-body">
        <div className="product-card-rating">
          <StarIcon />
          <span className="product-card-rating-value">{product.rating?.toFixed(1) ?? '4.8'}</span>
          {product.reviewCount > 0 && <span className="product-card-review-count">({product.reviewCount} reviews)</span>}
        </div>
        <h3>{product.name}</h3>
        <p className="product-card-desc">{product.shortDescription}</p>

        <div className="product-card-price-row">
          <span className="product-card-price">From ₹{startingPrice}</span>
          {onSale && <span className="product-card-compare-price">₹{compareAtPrice}</span>}
          {activeVariants.length > 0 && (
            <span className="product-card-swatches">
              {activeVariants.slice(0, 4).map((v) => (
                <span key={v.id} className="product-card-swatch-dot" style={{ background: v.colorCode }} />
              ))}
              {activeVariants.length > 4 && (
                <span className="product-card-swatch-more">+{activeVariants.length - 4}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
