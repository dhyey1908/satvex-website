import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, ShoppingBag, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthGate } from '../context/AuthGateContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { ImagePlaceholder } from './ImagePlaceholder';
import { PriceDisplay } from './PriceDisplay';
import './ProductCard.css';

export function ProductCard({ product }) {
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthGate();
  const { isInWishlist, addItem, removeItem } = useWishlist();
  const { addItem: addToCart, isInCart } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [justAdded, setJustAdded] = useState(false);

  const inWishlist = isInWishlist(product.productId);

  const activeOptions = (product.sellingOptions || []).filter((o) => o.isActive);
  const startingOption = activeOptions.reduce(
    (min, o) => (!min || o.price < min.price ? o : min),
    null
  );
  const singleOption = activeOptions.find((o) => o.quantity === 1);
  const startingPrice = startingOption?.price ?? product.basePrice;
  const compareAtPrice = startingOption?.compareAtPrice;
  // "From" only makes sense when the options genuinely span more than one
  // price point (e.g. Single vs Combo of 2) — a single-priced product just
  // shows its price plainly.
  const distinctPrices = new Set(activeOptions.map((o) => o.price));
  const showFrom = distinctPrices.size > 1;

  const activeVariants = (product.variants || []).filter((v) => v.isActive);
  const outOfStock = !product.isActive || activeOptions.length === 0 || activeVariants.length === 0;
  const canQuickAdd = !outOfStock && singleOption && activeVariants.length > 0;
  const quickAddInCart = canQuickAdd && isInCart(product.productId, singleOption.id, [activeVariants[0].id]);

  function quickAdd(e) {
    e.preventDefault();
    e.stopPropagation();

    // isAuthenticated inside a queued requireAuth callback would stay
    // permanently false — it's fixed at this render's closure, not updated
    // by the login that happens later. performQuickAdd skips that check
    // entirely, so it's safe to resume through.
    if (!isAuthenticated) {
      requireAuth(() => performQuickAdd());
      return;
    }
    performQuickAdd();
  }

  async function performQuickAdd() {
    if (quickAddInCart) {
      navigate('/cart');
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

  function toggleWishlist(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      requireAuth(() => performToggleWishlist());
      return;
    }
    performToggleWishlist();
  }

  async function performToggleWishlist() {
    try {
      if (inWishlist) {
        await removeItem(product.productId);
        showToast('Removed from wishlist');
      } else {
        await addItem(product.productId);
        showToast('Added to wishlist', 'success');
        setJustAdded(true);
        window.setTimeout(() => setJustAdded(false), 400);
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
        </div>

        <motion.button
          type="button"
          className={`wishlist-toggle ${inWishlist ? 'active' : ''}`}
          onClick={toggleWishlist}
          aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          whileTap={{ scale: 0.85 }}
          animate={justAdded ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} />
        </motion.button>

      </div>
      <div className="product-card-body">
        <div className="product-card-rating">
          {product.reviewCount > 0 ? (
            <>
              <Star size={14} fill="currentColor" />
              <span className="product-card-rating-value">{product.rating.toFixed(1)}</span>
              <span className="product-card-review-count">({product.reviewCount} reviews)</span>
            </>
          ) : (
            <span className="product-card-review-count">New — no reviews yet</span>
          )}
        </div>
        <h3>{product.name}</h3>
        <p className="product-card-desc">{product.shortDescription}</p>

        <div className="product-card-price">
          {showFrom && <span className="product-card-from">From</span>}
          <PriceDisplay price={startingPrice} compareAtPrice={compareAtPrice} size="md" />
        </div>

        {activeVariants.length > 0 && (
          <div className="product-card-swatches">
            {activeVariants.slice(0, 5).map((v) => (
              <span key={v.id} className="product-card-swatch-dot" style={{ background: v.colorCode }} />
            ))}
            {activeVariants.length > 5 && (
              <span className="product-card-swatch-more">+{activeVariants.length - 5}</span>
            )}
          </div>
        )}

        {canQuickAdd && (
          <button type="button" className="product-card-add-btn" onClick={quickAdd}>
            <ShoppingBag size={15} />
            <span>{quickAddInCart ? 'Go to Cart' : 'Add to Bag'}</span>
          </button>
        )}
      </div>
    </Link>
  );
}
