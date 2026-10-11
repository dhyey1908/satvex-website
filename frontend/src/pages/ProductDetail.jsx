import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Loader2, CheckCircle2, XCircle, ShoppingBag, Zap, ArrowLeft, ChevronDown, BadgeCheck, Share2 } from 'lucide-react';
import { productService } from '../services/productService';
import { ProductGallery } from '../components/ProductGallery';
import { SellingOptionSelector } from '../components/SellingOptionSelector';
import { ComboColorSelector } from '../components/ComboColorSelector';
import { QuantitySelector } from '../components/QuantitySelector';
import { RatingDisplay } from '../components/RatingDisplay';
import { ProductReviews } from '../components/ProductReviews';
import { PriceDisplay } from '../components/PriceDisplay';
import { PincodeCheck } from '../components/PincodeCheck';
import { ProductGrid } from '../components/ProductGrid';
import { SearchOverlay } from '../components/SearchOverlay';
import { Loader } from '../components/Loader';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { useDocumentMeta, setProductStructuredData } from '../hooks/useDocumentMeta';
import { deriveSku } from '../utils/sku';
import './ProductDetail.css';

const DEFAULT_HIGHLIGHTS = [
  { title: 'Flexible', description: 'Moves comfortably with your everyday needs.' },
  { title: 'Comfortable', description: 'Lightweight designs created for effortless everyday use.' },
  { title: 'Durable', description: 'Made to deliver dependable performance and lasting usability.' },
  { title: 'Stylish', description: 'Modern aesthetics designed for today’s women.' },
];

export function ProductDetail() {
  const { slug } = useParams();
  const { isAuthenticated } = useAuth();
  const { addItem, isInCart, items: cartItems, itemCount: cartCount } = useCart();
  const { isInWishlist, addItem: addWishlistItem, removeItem: removeWishlistItem } = useWishlist();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState(null);
  const [error, setError] = useState(null);
  const [sellingOptionId, setSellingOptionId] = useState(null);
  const [selectedColors, setSelectedColors] = useState([]);
  // For combos, which of the selected colors the main image currently
  // shows. Single-color options don't need this — there's only ever one
  // selected color, so the image just follows it directly.
  const [previewColorId, setPreviewColorId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [wishlistBurst, setWishlistBurst] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  useDocumentMeta({
    title: product?.name,
    description: product?.shortDescription,
    path: `/product/${slug}`,
  });

  useEffect(() => {
    setProductStructuredData(product);
    return () => setProductStructuredData(null);
  }, [product]);

  // Kept in a ref (not a dependency) so the product-load effect below can
  // read the latest cart contents without re-running every time the cart
  // changes — it should only decide the initial selection once per product
  // navigation, not fight the customer's own in-progress picks afterward.
  const cartItemsRef = useRef(cartItems);
  useEffect(() => {
    cartItemsRef.current = cartItems;
  }, [cartItems]);

  useEffect(() => {
    setProduct(null);
    setError(null);
    productService
      .getBySlug(slug)
      .then(({ product: p }) => {
        setProduct(p);
        setQuantity(1);
        // If this exact product is already in the cart, restore that
        // selection instead of defaulting to the first option — otherwise
        // navigating back to the PDP always shows "Add to Cart" again even
        // though the item is already there, until the customer re-picks
        // the same colors by hand.
        const existing = cartItemsRef.current.find((i) => i.productId === p.productId);
        if (existing) {
          setSellingOptionId(existing.sellingOptionId);
          setSelectedColors(existing.selectedColors || []);
        } else {
          const firstActive = p.sellingOptions.find((o) => o.isActive);
          setSellingOptionId(firstActive?.id ?? null);
          setSelectedColors([]);
        }
      })
      .catch((err) => setError(err.message));

    productService
      .list()
      .then((data) => setRelatedProducts(data.products.filter((p) => p.slug !== slug && p.isActive)))
      .catch(() => setRelatedProducts([]));
  }, [slug]);

  useEffect(() => {
    if (!product || location.hash !== '#reviews') return;
    const el = document.getElementById('reviews');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [product, location.hash]);

  // Keeps the main-image preview target in sync with selectedColors,
  // covering every way selectedColors can change (combo swatch pick,
  // removing a chip, switching selling option, loading a different
  // product/cart item) without needing a reset at each call site. Newly
  // adding a color previews that one immediately; removing the previewed
  // one falls back to whichever selection is now last.
  useEffect(() => {
    if (selectedColors.length === 0) {
      setPreviewColorId(null);
      return;
    }
    if (!selectedColors.includes(previewColorId)) {
      setPreviewColorId(selectedColors[selectedColors.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColors]);

  if (error) return <ErrorState message={error} />;
  if (!product) return <Loader label="Loading product…" />;

  const sellingOption = product.sellingOptions.find((o) => o.id === sellingOptionId);
  // Single-color options: selectedColors[0] is the only possible choice.
  // Combos: previewColorId (kept in sync above) picks which of the several
  // selected colors the main image currently shows.
  const previewVariantId = sellingOption?.quantity === 1 ? selectedColors[0] : previewColorId;
  const activeVariant = previewVariantId ? product.variants.find((v) => v.id === previewVariantId) : null;

  const activeOptions = product.sellingOptions.filter((o) => o.isActive);
  const activeVariants = product.variants.filter((v) => v.isActive);
  const outOfStock = !product.isActive || activeOptions.length === 0 || activeVariants.length === 0;
  const sku = deriveSku(product.productId, activeVariant?.id);

  function handleSellingOptionSelect(option) {
    setSellingOptionId(option.id);
    setSelectedColors([]);
  }

  function requireAuthOrRedirect() {
    if (isAuthenticated) return true;
    navigate('/login', { state: { from: location } });
    return false;
  }

  function validSelection() {
    if (!sellingOption) return false;
    return selectedColors.length === sellingOption.quantity;
  }

  function hasOutOfStockSelection() {
    const variantsById = new Map(product.variants.map((v) => [v.id, v]));
    return selectedColors.some((id) => variantsById.get(id)?.inStock === false);
  }

  async function handleAddToCart({ redirectToCheckout } = {}) {
    if (!requireAuthOrRedirect()) return;
    if (!validSelection()) {
      showToast(`Select ${sellingOption.quantity} color(s) to continue.`, 'warning');
      return;
    }
    if (hasOutOfStockSelection()) {
      showToast('One or more selected colors are out of stock.', 'error');
      return;
    }

    if (redirectToCheckout) setBuyingNow(true);
    else setSubmitting(true);
    try {
      await addItem({
        productId: product.productId,
        sellingOptionId: sellingOption.id,
        selectedColors,
        quantity,
      });
      showToast('Added to cart', 'success');
      if (redirectToCheckout) navigate('/checkout');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setBuyingNow(false);
    }
  }

  async function toggleWishlist() {
    if (!requireAuthOrRedirect()) return;
    try {
      if (isInWishlist(product.productId)) {
        await removeWishlistItem(product.productId);
        showToast('Removed from wishlist');
      } else {
        await addWishlistItem(product.productId);
        showToast('Added to wishlist', 'success');
        setWishlistBurst(true);
        window.setTimeout(() => setWishlistBurst(false), 400);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleShareProduct() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: product.shortDescription, url });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  }

  const inWishlist = isInWishlist(product.productId);
  // "Go to Cart" only replaces "Add to Cart" for the exact combination
  // currently selected — switching to a different color/combo of the same
  // product still shows "Add to Cart" for that new combination.
  const alreadyInCart = validSelection() && isInCart(product.productId, sellingOption?.id, selectedColors);

  function handleAddOrGoToCart() {
    if (alreadyInCart) {
      navigate('/cart');
      return;
    }
    handleAddToCart({ redirectToCheckout: false });
  }

  const highlights = settings?.whyPillars || DEFAULT_HIGHLIGHTS;
  const selectedShadeName = activeVariant?.colorName ?? null;

  return (
    <>
      {/* Compact contextual mobile header — replaces the global site header
          on this route at mobile widths only (see Header.jsx/.css). Desktop
          keeps the normal site header untouched. */}
      <div className="pdp-mobile-header">
        <button type="button" className="pdp-mobile-header-back" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={20} />
        </button>
        <div className="pdp-mobile-header-search">
          <SearchOverlay />
        </div>
        <Link to="/cart" className="pdp-mobile-header-cart" aria-label={`Cart (${cartCount} items)`}>
          <ShoppingBag size={20} />
          {cartCount > 0 && <span className="badge">{cartCount}</span>}
        </Link>
      </div>

      <div className="container section product-detail">
      <nav className="pdp-breadcrumb text-label-sm" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/shop">Shop</Link>
        <span>/</span>
        <span className="pdp-breadcrumb-current">{product.name}</span>
      </nav>

      <div className="product-detail-grid">
        <div className="pdp-gallery-wrap">
          <ProductGallery images={product.images} activeImage={activeVariant?.image} videoUrl={product.videoUrl} alt={product.name} />
          <div className="pdp-gallery-actions">
            <button
              type="button"
              className="pdp-gallery-share"
              onClick={handleShareProduct}
              aria-label="Share this product"
            >
              <Share2 size={17} />
            </button>
            <motion.button
              type="button"
              className={`pdp-gallery-wishlist ${inWishlist ? 'active' : ''}`}
              onClick={toggleWishlist}
              whileTap={{ scale: 0.9 }}
              aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <motion.span
                animate={wishlistBurst ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-flex' }}
              >
                <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} />
              </motion.span>
            </motion.button>
          </div>
        </div>

        <div className="product-detail-info">
          <h1 className="text-headline-lg">{product.name}</h1>
          <RatingDisplay rating={product.rating} reviewCount={product.reviewCount} size="lg" />
          <p className="product-detail-desc">{product.shortDescription}</p>

          <div className="product-detail-price-row">
            <PriceDisplay
              price={sellingOption?.price ?? product.basePrice}
              compareAtPrice={sellingOption?.compareAtPrice}
              size="lg"
            />
            <span className={`stock-pill ${outOfStock ? 'out' : 'in'}`}>
              {outOfStock ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
              {outOfStock ? 'Out of Stock' : 'In Stock'}
            </span>
          </div>

          {sku && <p className="product-detail-sku">SKU: {sku}</p>}

          <div className="product-detail-section">
            <h3>Selling Option</h3>
            <SellingOptionSelector
              options={product.sellingOptions}
              selectedId={sellingOptionId}
              onSelect={handleSellingOptionSelect}
            />
          </div>

          {sellingOption && (
            <div className="product-detail-section pdp-color-section">
              <h3>
                {sellingOption.quantity === 1 ? 'Select a Color' : `Select ${sellingOption.quantity} Colors`}
                {selectedShadeName && (
                  <span className="pdp-selected-shade">
                    {' '}
                    — {sellingOption.quantity === 1 ? selectedShadeName : `Previewing ${selectedShadeName}`}
                  </span>
                )}
              </h3>
              <ComboColorSelector
                variants={product.variants}
                requiredCount={sellingOption.quantity}
                allowDuplicateColors={sellingOption.allowDuplicateColors}
                selectedIds={selectedColors}
                onChange={setSelectedColors}
                previewId={previewColorId}
                onPreview={setPreviewColorId}
              />
            </div>
          )}

          <div className="product-detail-section">
            <h3>Quantity</h3>
            <QuantitySelector value={quantity} onChange={setQuantity} />
          </div>

          {highlights.length > 0 && (
            <div className="pdp-highlights">
              {highlights.slice(0, 4).map((h) => (
                <span key={h.title} className="pdp-highlight-pill">
                  <BadgeCheck size={13} /> {h.title}
                </span>
              ))}
            </div>
          )}

          <PincodeCheck />

          <div className="product-detail-actions">
            <div className="pdp-primary-row">
              <button
                type="button"
                className="btn btn-outline pdp-add-to-cart"
                disabled={submitting || buyingNow || outOfStock}
                onClick={handleAddOrGoToCart}
              >
                {submitting ? (
                  <Loader2 size={16} className="btn-spinner" />
                ) : (
                  <><ShoppingBag size={16} /> {alreadyInCart ? 'Go to Cart' : 'Add to Cart'}</>
                )}
              </button>
              <motion.button
                type="button"
                className={`pdp-wishlist-btn ${inWishlist ? 'active' : ''}`}
                onClick={toggleWishlist}
                whileTap={{ scale: 0.92 }}
                aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <motion.span
                  className="pdp-wishlist-icon"
                  animate={wishlistBurst ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Heart size={20} fill={inWishlist ? 'currentColor' : 'none'} />
                </motion.span>
              </motion.button>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={submitting || buyingNow || outOfStock}
              onClick={() => handleAddToCart({ redirectToCheckout: true })}
            >
              {buyingNow ? <Loader2 size={16} className="btn-spinner" /> : (<><Zap size={16} /> Buy Now</>)}
            </button>
          </div>

          {product.description && (
            <div className="pdp-description-accordion">
              <button
                type="button"
                className="pdp-description-trigger"
                aria-expanded={descOpen}
                onClick={() => setDescOpen((v) => !v)}
              >
                <span>Product Details</span>
                <motion.span animate={{ rotate: descOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown size={18} />
                </motion.span>
              </button>
              {descOpen && (
                <div className="pdp-description-body">
                  {product.description.split(/\n+/).filter(Boolean).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile-only sticky buy bar — CSS-hidden on desktop. Calls the exact
          same handler as the inline buttons above, so behavior (auth
          redirect, validation, loading state) is identical either way. */}
      <div className="pdp-mobile-bar">
        <button
          type="button"
          className="btn btn-outline pdp-mobile-bar-cart"
          disabled={submitting || buyingNow || outOfStock}
          onClick={handleAddOrGoToCart}
        >
          {submitting ? (
            <Loader2 size={16} className="btn-spinner" />
          ) : (
            <><ShoppingBag size={16} /> {alreadyInCart ? 'Go to Cart' : 'Add to Cart'}</>
          )}
        </button>
        <button
          type="button"
          className="btn btn-primary pdp-mobile-bar-buy"
          disabled={submitting || buyingNow || outOfStock}
          onClick={() => handleAddToCart({ redirectToCheckout: true })}
        >
          {buyingNow ? <Loader2 size={16} className="btn-spinner" /> : (<><Zap size={16} /> Buy Now</>)}
        </button>
      </div>

      <div className="product-detail-below">
        <div className="product-detail-reviews" id="reviews">
          <h3 className="text-headline-sm">Reviews</h3>
          <RatingDisplay rating={product.rating} reviewCount={product.reviewCount} size="lg" />
          <ProductReviews productId={product.productId} />
        </div>
      </div>

      {relatedProducts && relatedProducts.length > 0 && (
        <section className="section product-detail-related">
          <h2>You may also like</h2>
          <ProductGrid products={relatedProducts} />
        </section>
      )}
      </div>
    </>
  );
}
