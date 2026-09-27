import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Truck, Leaf, Package, ChevronDown, Loader2 } from 'lucide-react';
import { productService } from '../services/productService';
import { ProductGallery } from '../components/ProductGallery';
import { SellingOptionSelector } from '../components/SellingOptionSelector';
import { ComboColorSelector } from '../components/ComboColorSelector';
import { QuantitySelector } from '../components/QuantitySelector';
import { RatingDisplay } from '../components/RatingDisplay';
import { ProductReviews } from '../components/ProductReviews';
import { PriceDisplay } from '../components/PriceDisplay';
import { ProductGrid } from '../components/ProductGrid';
import { Loader } from '../components/Loader';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { useDocumentMeta, setProductStructuredData } from '../hooks/useDocumentMeta';
import { deriveSku } from '../utils/sku';
import './ProductDetail.css';

export function ProductDetail() {
  const { slug } = useParams();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const { isInWishlist, addItem: addWishlistItem, removeItem: removeWishlistItem } = useWishlist();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState(null);
  const [error, setError] = useState(null);
  const [sellingOptionId, setSellingOptionId] = useState(null);
  const [selectedColors, setSelectedColors] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [openInfo, setOpenInfo] = useState('materials');
  const [wishlistBurst, setWishlistBurst] = useState(false);

  useDocumentMeta({
    title: product?.name,
    description: product?.shortDescription,
    path: `/product/${slug}`,
  });

  useEffect(() => {
    setProductStructuredData(product);
    return () => setProductStructuredData(null);
  }, [product]);

  useEffect(() => {
    setProduct(null);
    setError(null);
    productService
      .getBySlug(slug)
      .then(({ product: p }) => {
        setProduct(p);
        const firstActive = p.sellingOptions.find((o) => o.isActive);
        setSellingOptionId(firstActive?.id ?? null);
        setSelectedColors([]);
        setQuantity(1);
      })
      .catch((err) => setError(err.message));

    productService
      .list()
      .then((data) => setRelatedProducts(data.products.filter((p) => p.slug !== slug && p.isActive)))
      .catch(() => setRelatedProducts([]));
  }, [slug]);

  if (error) return <ErrorState message={error} />;
  if (!product) return <Loader label="Loading product…" />;

  const sellingOption = product.sellingOptions.find((o) => o.id === sellingOptionId);
  const activeVariant =
    sellingOption?.quantity === 1 && selectedColors.length === 1
      ? product.variants.find((v) => v.id === selectedColors[0])
      : null;

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

  async function handleAddToCart({ redirectToCheckout } = {}) {
    if (!requireAuthOrRedirect()) return;
    if (!validSelection()) {
      showToast(`Select ${sellingOption.quantity} color(s) to continue.`, 'warning');
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

  const inWishlist = isInWishlist(product.productId);

  return (
    <div className="container section product-detail">
      <nav className="pdp-breadcrumb text-label-sm" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/shop">Shop</Link>
        <span>/</span>
        <span className="pdp-breadcrumb-current">{product.name}</span>
      </nav>

      <div className="product-detail-grid">
        <ProductGallery images={product.images} activeImage={activeVariant?.image} alt={product.name} />

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
            <div className="product-detail-section">
              <h3>
                {sellingOption.quantity === 1 ? 'Choose a color' : `Choose ${sellingOption.quantity} colors`}
              </h3>
              <ComboColorSelector
                variants={product.variants}
                requiredCount={sellingOption.quantity}
                allowDuplicateColors={sellingOption.allowDuplicateColors}
                selectedIds={selectedColors}
                onChange={setSelectedColors}
              />
            </div>
          )}

          <div className="product-detail-section">
            <h3>Quantity</h3>
            <QuantitySelector value={quantity} onChange={setQuantity} />
          </div>

          <div className="product-detail-actions">
            <motion.button
              type="button"
              className="btn btn-outline btn-block"
              onClick={toggleWishlist}
              whileTap={{ scale: 0.97 }}
            >
              <motion.span
                className="pdp-wishlist-icon"
                animate={wishlistBurst ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} />
              </motion.span>
              {inWishlist ? 'In Wishlist' : 'Add to Wishlist'}
            </motion.button>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={submitting || buyingNow || outOfStock}
              onClick={() => handleAddToCart({ redirectToCheckout: false })}
            >
              {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Add to Cart'}
            </button>
            <button
              type="button"
              className="btn btn-block buy-now-btn"
              disabled={submitting || buyingNow || outOfStock}
              onClick={() => handleAddToCart({ redirectToCheckout: true })}
            >
              {buyingNow ? <Loader2 size={16} className="btn-spinner" /> : 'Buy Now'}
            </button>
          </div>

          <div className="pdp-trust-row">
            <span><Truck size={16} />Free Pan-India Shipping</span>
            <span><Leaf size={16} />Skin-Friendly Materials</span>
            <span><Package size={16} />7-Day Easy Exchange</span>
          </div>
        </div>
      </div>

      <div className="product-detail-below">
        <h3 className="text-headline-sm pdp-below-heading">The Details</h3>

        <div className="pdp-accordion">
          {[
            { key: 'description', label: 'Description', body: product.description },
            product.howToWear ? { key: 'howToWear', label: 'How to Wear', body: product.howToWear } : null,
            { key: 'materials', label: 'Materials & Care', body: 'Crafted from premium, skin-friendly materials. Wipe clean with a soft, dry cloth. Avoid contact with water and perfume.' },
            { key: 'shipping', label: 'Shipping', body: 'Free shipping on all orders. Orders are typically processed within 1-2 business days.' },
            { key: 'returns', label: 'Returns', body: "Contact us within 7 days of delivery if there's an issue with your order — we're happy to help." },
          ].filter(Boolean).map((item) => {
            const isOpen = openInfo === item.key;
            return (
              <div key={item.key} className="pdp-accordion-item">
                <button
                  type="button"
                  className="pdp-accordion-trigger"
                  aria-expanded={isOpen}
                  onClick={() => setOpenInfo(isOpen ? null : item.key)}
                >
                  <span>{item.label}</span>
                  <motion.span
                    className="pdp-accordion-chevron"
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ChevronDown size={18} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="pdp-accordion-body-wrap"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="pdp-accordion-body"><p>{item.body}</p></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="product-detail-reviews">
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
  );
}
