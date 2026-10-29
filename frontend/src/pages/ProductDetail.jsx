import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Loader2, CheckCircle2, XCircle, ShoppingBag, Zap, ArrowLeft, BadgeCheck, Share2 } from 'lucide-react';
import { productService } from '../services/productService';
import { ProductGallery } from '../components/ProductGallery';
import { ColourPreview } from '../components/ColourPreview';
import { SellingOptionSelector } from '../components/SellingOptionSelector';
import { ComboColorSelector } from '../components/ComboColorSelector';
import { QuantitySelector } from '../components/QuantitySelector';
import { RatingDisplay } from '../components/RatingDisplay';
import { ProductReviews } from '../components/ProductReviews';
import { ProductVideoSlider } from '../components/ProductVideoSlider';
import { PriceDisplay } from '../components/PriceDisplay';
import { PincodeCheck } from '../components/PincodeCheck';
import { Accordion } from '../components/Accordion';
import { TrustRow } from '../components/TrustRow';
import { ProductGrid } from '../components/ProductGrid';
import { SearchOverlay } from '../components/SearchOverlay';
import { Loader } from '../components/Loader';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import { useAuthGate } from '../context/AuthGateContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { useDocumentMeta, setProductStructuredData } from '../hooks/useDocumentMeta';
import { deriveSku } from '../utils/sku';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import { colourSlug, defaultColourId, galleryFor, variantForUrl } from '../utils/colourGallery';
import { STOREFRONT } from '../config/storefront';
import './ProductDetail.css';

const DEFAULT_HIGHLIGHTS = [
  { title: 'Flexible', description: 'Moves comfortably with your everyday needs.' },
  { title: 'Comfortable', description: 'Lightweight designs created for effortless everyday use.' },
  { title: 'Durable', description: 'Made to deliver dependable performance and lasting usability.' },
  { title: 'Stylish', description: 'Modern aesthetics designed for today’s women.' },
];

export function ProductDetail() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthGate();
  const { addItem, isInCart, items: cartItems, itemCount: cartCount } = useCart();
  const { isInWishlist, addItem: addWishlistItem, removeItem: removeWishlistItem } = useWishlist();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [product, setProduct] = useState(null);
  const holdLoader = useMinimumLoading(!product);
  const [relatedProducts, setRelatedProducts] = useState(null);
  const [error, setError] = useState(null);
  const [sellingOptionId, setSellingOptionId] = useState(null);
  const [selectedColors, setSelectedColors] = useState([]);
  // For combos, which of the selected colors the main image currently
  // shows. Single-color options don't need this — there's only ever one
  // selected color, so the image just follows it directly.
  const [previewColorId, setPreviewColorId] = useState(null);
  // The URL ProductGallery is actually showing right now, reported back up
  // via onImageChange. Now that the gallery's own image set is built from
  // variant photos (see galleryImages below), this is a reliable exact
  // match back to a variant — covers browsing the gallery's own thumbnails
  // directly, not just an explicit color pick in the selector.
  const [displayedImage, setDisplayedImage] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [wishlistBurst, setWishlistBurst] = useState(false);
  // Inline "please pick your colours" message shown under the swatches, plus
  // the section the page scrolls to when Add to Cart / Buy Now is tapped early.
  const [colorError, setColorError] = useState(null);
  const colorSectionRef = useRef(null);
  // Real-review summary reported up by ProductReviews (for structured data).
  const [reviewSummary, setReviewSummary] = useState(null);
  // Sticky mobile bar: hidden while the footer is on screen, and its height is
  // published as --pdp-bar-h so the page can reserve exactly that much room.
  const [footerInView, setFooterInView] = useState(false);
  const mobileBarRef = useRef(null);
  const recentSlugs = useRecentlyViewed(slug);
  // Whether the sticky gallery is currently pinned to the bottom of its
  // column instead of sticking under the header — see the scroll-driven
  // effect below and the CSS comment on .pdp-gallery-sticky for why this
  // can't be done with pure CSS position:sticky.
  const [galleryPinnedBottom, setGalleryPinnedBottom] = useState(false);
  const galleryColRef = useRef(null);
  const galleryStickyRef = useRef(null);

  // Heading/title use the full product name ("Butterfly Claw Clip"); the
  // stored name stays "Butterfly" (the design name).
  const displayName = product
    ? /claw clip/i.test(product.name) ? product.name : `${product.name} ${STOREFRONT.productTitleSuffix}`
    : undefined;

  useDocumentMeta({
    title: displayName,
    description: product?.shortDescription,
    path: `/product/${slug}`,
    image: product?.images?.[0] || product?.variants?.find((v) => v.image)?.image,
    type: 'product',
  });

  useEffect(() => {
    setProductStructuredData(product && { ...product, name: displayName }, { reviewSummary });
    return () => setProductStructuredData(null);
  }, [product, displayName, reviewSummary]);

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
  const previousSelectionLength = useRef(0);
  useEffect(() => {
    if (selectedColors.length === 0) {
      previousSelectionLength.current = 0;
      setPreviewColorId(null);
      return;
    }
    // The gallery follows the MOST RECENTLY picked colour: a pick adds to the end of the
    // list, so the last entry is the newest; removing one falls back to whatever is last.
    const grew = selectedColors.length > previousSelectionLength.current;
    previousSelectionLength.current = selectedColors.length;
    if (grew || !selectedColors.includes(previewColorId)) {
      setPreviewColorId(selectedColors[selectedColors.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColors]);

  // The error clears itself as soon as the selection is complete again (or the
  // pack changes).
  useEffect(() => {
    setColorError(null);
  }, [selectedColors, sellingOptionId]);

  // Mobile buy bar: slide it away while the footer is visible (so footer
  // links/contact details are never covered) and keep --pdp-bar-h in sync with
  // its real height for the page's bottom padding.
  useEffect(() => {
    if (!product) return undefined;
    const footer = document.querySelector('.site-footer');
    let io;
    if (footer && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([entry]) => setFooterInView(entry.isIntersecting), { threshold: 0 });
      io.observe(footer);
    }
    const bar = mobileBarRef.current;
    let ro;
    if (bar && 'ResizeObserver' in window) {
      ro = new ResizeObserver(() => {
        document.documentElement.style.setProperty('--pdp-bar-h', `${bar.offsetHeight}px`);
      });
      ro.observe(bar);
    }
    return () => {
      io?.disconnect();
      ro?.disconnect();
      document.documentElement.style.removeProperty('--pdp-bar-h');
    };
    // holdLoader: the page body (and so the bar) only mounts once the minimum
    // loader time has passed, which can be after `product` itself is set.
  }, [product, holdLoader]);

  // Keeps the sticky gallery visually "stuck" under the header for as long
  // as there's room, then pins it to the bottom of its column (see the CSS
  // comment on .pdp-gallery-sticky for why plain position:sticky alone
  // can't do this without either overlapping Reviews or leaving a dead gap
  // above it). Desktop-only — mobile never uses sticky/pinned-bottom at all
  // (CSS resets .pdp-gallery-sticky to position:static there), so this is
  // gated on viewport width rather than running pointless measurements on
  // every mobile scroll.
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 861px)');
    let rafId = null;

    function measure() {
      rafId = null;
      const col = galleryColRef.current;
      const sticky = galleryStickyRef.current;
      if (!col || !sticky || !desktopQuery.matches) {
        setGalleryPinnedBottom(false);
        return;
      }
      const rootStyles = getComputedStyle(document.documentElement);
      const headerHeight = parseFloat(rootStyles.getPropertyValue('--header-height')) || 68;
      const space5 = parseFloat(rootStyles.getPropertyValue('--space-5')) || 32;
      const stickyTopOffset = headerHeight + space5;

      const colRect = col.getBoundingClientRect();
      // Room left between the sticky line and this column's own bottom
      // edge, in viewport coordinates. Once the image no longer fits in
      // that room, pin it to the column's bottom instead of letting it
      // detach mid-air and leave a gap.
      const roomBelowStickyLine = colRect.bottom - stickyTopOffset;
      setGalleryPinnedBottom(roomBelowStickyLine < sticky.offsetHeight);
    }

    function scheduleMeasure() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    desktopQuery.addEventListener('change', scheduleMeasure);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      desktopQuery.removeEventListener('change', scheduleMeasure);
    };
    // Re-measure whenever the product (and therefore gallery/purchase
    // content height) changes — a different product can make the two
    // columns' relative heights completely different.
  }, [product]);

  // Picking a colour puts it in the link (?color=pink) without a reload, so a shared link
  // opens on that colour; and its photos are fetched ahead of the swap.
  // (previewColorId already follows the most recently picked colour, for single packs and combos alike.)
  const pickedColourId = product ? previewColorId : null;
  useEffect(() => {
    if (!product || !pickedColourId) return;
    const v = product.variants.find((x) => x.id === pickedColourId);
    if (!v) return;
    const next = colourSlug(v.colorName);
    if (searchParams.get('color') !== next) {
      const params = new URLSearchParams(searchParams);
      params.set('color', next);
      setSearchParams(params, { replace: true, state: { keepScroll: true } }); // ScrollToTop leaves the page where it is
    }
    (v.images || []).forEach((p) => {
      const img = new Image();
      img.src = p.url;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedColourId, product]);

  if (error) return <ErrorState message={error} />;
  if (!product || holdLoader) return <Loader label="Loading product…" />;

  const sellingOption = product.sellingOptions.find((o) => o.id === sellingOptionId);
  // Single-color options: selectedColors[0] is the only possible choice.
  // Combos: previewColorId (kept in sync above) picks which of the several
  // selected colors the main image currently shows.
  const previewVariantId = sellingOption?.quantity === 1 ? selectedColors[0] : previewColorId;
  const activeVariant = previewVariantId ? product.variants.find((v) => v.id === previewVariantId) : null;
  // The colour whose photos the gallery shows: the one the customer picked (for a combo, the
  // most recently picked), else the one in the link (?color=lavender), else the first colour in stock.
  const galleryColorId = previewVariantId || defaultColourId(product.variants, searchParams.get('color'));

  const activeOptions = product.sellingOptions.filter((o) => o.isActive);
  const activeVariants = product.variants.filter((v) => v.isActive);
  const outOfStock = !product.isActive || activeOptions.length === 0 || activeVariants.length === 0;
  // A derived SKU ending in the placeholder "-XX" (no colour picked yet) is
  // not a real SKU — don't show it.
  const rawSku = deriveSku(product.productId, activeVariant?.id);
  const sku = rawSku && !/-XX$/.test(rawSku) ? rawSku : '';

  // Gallery = the selected colour's photos (primary first) + the common photos.
  const { urls: galleryImages, altByUrl: galleryAlts } = galleryFor({ ...product, displayName }, galleryColorId);

  function handleSellingOptionSelect(option) {
    setSellingOptionId(option.id);
    setSelectedColors([]);
  }

  function validSelection() {
    if (!sellingOption) return false;
    return selectedColors.length === sellingOption.quantity;
  }

  function hasOutOfStockSelection() {
    const variantsById = new Map(product.variants.map((v) => [v.id, v]));
    return selectedColors.some((id) => variantsById.get(id)?.inStock === false);
  }

  // Why the current selection can't be bought yet, or null when it can.
  function selectionProblem() {
    if (!sellingOption) return 'Please choose a pack.';
    const needed = sellingOption.quantity;
    if (selectedColors.length < needed) {
      return needed === 1 ? 'Please select a colour.' : `Please select ${needed} colours.`;
    }
    if (hasOutOfStockSelection()) return 'One of your selected colours is out of stock — please choose another.';
    return null;
  }

  // Stops an incomplete selection before anything else happens (login prompt,
  // cart call): explains it inline and scrolls the colour picker into view.
  function blockIfIncomplete() {
    const problem = selectionProblem();
    if (!problem) return false;
    setColorError(problem);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    colorSectionRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    return true;
  }

  function handleAddToCart(opts = {}) {
    if (blockIfIncomplete()) return;
    if (!isAuthenticated) {
      // Resuming via the SAME function (checking isAuthenticated again)
      // would re-fail here: the callback requireAuth stores is this
      // render's closure, permanently bound to isAuthenticated=false from
      // the moment it was captured — it never sees the post-login value no
      // matter when it's actually invoked. performAddToCart has no auth
      // check at all, so resuming through it is safe.
      requireAuth(() => performAddToCart(opts));
      return;
    }
    performAddToCart(opts);
  }

  async function performAddToCart({ redirectToCheckout } = {}) {
    // Guard again here: this is also what runs after a login prompt resumes.
    if (blockIfIncomplete()) return;

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

  function toggleWishlist() {
    if (!isAuthenticated) {
      requireAuth(() => performToggleWishlist());
      return;
    }
    performToggleWishlist();
  }

  async function performToggleWishlist() {
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

  // Products this visitor opened before (this browser), excluding this one;
  // empty (so the row is hidden) while the store has only one product.
  const recentlyViewed = (relatedProducts || []).filter((p) => recentSlugs.includes(p.slug));

  const highlights = settings?.whyPillars || DEFAULT_HIGHLIGHTS;
  // Which image is genuinely on screen right now, reported up from
  // ProductGallery and matched back to a variant by its own image URL. With
  // the gallery now built from variant photos whenever they exist
  // (galleryImages above), this match is exact and reliable — it tracks the
  // real photo through every way it can change, including just browsing the
  // gallery's own thumbnails (not only an explicit color pick).
  const displayedVariant = displayedImage ? variantForUrl(product.variants, displayedImage) : null;
  // Always follows whatever photo is genuinely on screen, not which color
  // was last explicitly selected — ProductGallery's own manualOverride
  // (browsing away via the nav arrows/swipe/thumbnails) means the visible
  // photo and the "selected" color can now legitimately diverge, and the
  // badge needs to agree with the former, same as the gallery itself does.
  // When activeVariant has no image of its own, the main image simply never
  // changes to it, so displayedVariant correctly keeps showing whatever
  // real photo was already on screen instead of going stale.
  const badgeColorName = displayedVariant?.colorName ?? null;
  const isComboPreview =
    Boolean(displayedVariant) && (sellingOption?.quantity ?? 1) > 1 && selectedColors.includes(displayedVariant.id);

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
        <span className="pdp-breadcrumb-current">{displayName}</span>
      </nav>

      <div className="product-detail-grid">
        <div className="pdp-gallery-wrap" ref={galleryColRef}>
          <div
            className={`pdp-gallery-sticky ${galleryPinnedBottom ? 'pdp-gallery-pinned-bottom' : ''} ${
              galleryImages.length > 1 || product.videoUrl ? 'pdp-has-thumbs' : ''
            }`}
            ref={galleryStickyRef}
          >
            <ProductGallery
              images={galleryImages}
              altByUrl={galleryAlts}
              resetKey={galleryColorId}
              activeImage={null}
              videoUrl={product.videoUrl}
              lifestyleImages={product.lifestyleImages}
              alt={displayName}
              onImageChange={setDisplayedImage}
            />
            <AnimatePresence>
              {badgeColorName && (
                <motion.span
                  key={displayedVariant?.id ?? badgeColorName}
                  className="pdp-color-badge"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {badgeColorName}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="pdp-head">
          <div className="pdp-title-row">
            <h1 className="text-headline-lg">{displayName}</h1>
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
          {/* Once the review list has loaded, show ITS figures (the reviews a visitor can
              actually read) rather than the product's stored aggregate. */}
          <RatingDisplay
            rating={reviewSummary ? reviewSummary.average : product.rating}
            reviewCount={reviewSummary ? reviewSummary.count : product.reviewCount}
            size="lg"
          />
          <p className="product-detail-desc">{product.shortDescription}</p>

          <div className="product-detail-price-row">
            <PriceDisplay
              price={sellingOption?.price ?? product.basePrice}
              compareAtPrice={sellingOption?.compareAtPrice}
              offer={sellingOption?.offer}
              showPerPiece={(sellingOption?.quantity ?? 1) > 1}
              size="lg"
            />
            <span className={`stock-pill ${outOfStock ? 'out' : 'in'}`}>
              {outOfStock ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
              {outOfStock ? 'Out of Stock' : 'In Stock'}
            </span>
          </div>

          {settings?.tax?.pricesIncludeGst && <p className="pdp-tax-note">Inclusive of all taxes</p>}

          {sellingOption?.offer?.priceAfterCoupon != null && (
            <p className="pdp-coupon-price">
              Price after code <strong>{sellingOption.offer.couponCode}</strong>: <strong>₹{sellingOption.offer.priceAfterCoupon}</strong>
            </p>
          )}

          {sku && <p className="product-detail-sku">SKU: {sku}</p>}
        </div>

        <div className="pdp-purchase">
          <div className="product-detail-section">
            <h3>Selling Option</h3>
            <SellingOptionSelector
              options={product.sellingOptions}
              selectedId={sellingOptionId}
              onSelect={handleSellingOptionSelect}
            />
          </div>

          {sellingOption && (
            <div className="product-detail-section pdp-color-section" ref={colorSectionRef}>
              <div className="pdp-color-section-header">
                <h3>{sellingOption.quantity === 1 ? 'Select a Colour' : `Select ${sellingOption.quantity} Colours`}</h3>
                {sellingOption.quantity > 1 && (
                  <span className="pdp-color-count">
                    {selectedColors.length} / {sellingOption.quantity} selected
                  </span>
                )}
              </div>
              <ComboColorSelector
                variants={product.variants}
                requiredCount={sellingOption.quantity}
                allowDuplicateColors={sellingOption.allowDuplicateColors}
                selectedIds={selectedColors}
                onChange={setSelectedColors}
                onBlocked={setColorError}
              />
              <ColourPreview variant={activeVariant} productName={displayName} />
              {colorError && (
                <p className="pdp-color-error" role="alert">
                  {colorError}
                </p>
              )}
            </div>
          )}

          <div className="product-detail-section">
            <h3>Number of combos</h3>
            <QuantitySelector value={quantity} onChange={setQuantity} label="number of combos" />
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

          <TrustRow />

          <Accordion
            idPrefix="pdp-details"
            items={[
              ...(product.description ? [{ id: 'details', title: 'Product Details', body: product.description }] : []),
              // From the product form's "How to Wear / Fit Notes"; no notes, no section.
              ...(product.howToWear?.trim() ? [{ id: 'how-to-use', title: 'How to Use & Care', body: product.howToWear.trim() }] : []),
              {
                id: 'shipping-returns',
                title: 'Shipping & Returns',
                body: (
                  <>
                    <p>Delivery times, shipping charges and our return and refund terms are set out in our policies.</p>
                    <p>
                      <Link to="/shipping-policy">Shipping &amp; Delivery policy</Link>
                      {' · '}
                      <Link to="/returns-refunds">Returns &amp; Refunds policy</Link>
                    </p>
                  </>
                ),
              },
            ]}
          />
        </div>

        {/* Its own grid area (see ProductDetail.css) controls width/
            position — full-width, last, on both desktop and mobile. Placed
            here in the DOM (after .pdp-purchase) so visual order and
            keyboard/tab order agree. */}
        {/* Customer video testimonials — its own grid area directly above
            Reviews (see ProductDetail.css). Renders nothing when the product
            has no videos, so the page is unchanged for those. */}
        {product.testimonialVideos?.length > 0 && (
          <div className="product-detail-videos">
            <ProductVideoSlider videos={product.testimonialVideos} productName={product.name} />
          </div>
        )}

        <div className="product-detail-reviews" id="reviews">
          <h3 className="text-headline-sm">Reviews</h3>
          <ProductReviews productId={product.productId} onSummary={setReviewSummary} />
        </div>
      </div>

      {/* Mobile-only sticky buy bar — CSS-hidden on desktop. Calls the exact
          same handler as the inline buttons above, so behavior (auth
          redirect, validation, loading state) is identical either way. */}
      <div className={`pdp-mobile-bar ${footerInView ? 'is-hidden' : ''}`} ref={mobileBarRef} aria-hidden={footerInView}>
        <div className="pdp-mobile-bar-summary">
          <span className="pdp-mobile-bar-name">{sellingOption?.name ?? product.name}</span>
          <span className="pdp-mobile-bar-price">
            ₹{sellingOption?.price ?? product.basePrice}
            {sellingOption?.quantity > 1 && sellingOption?.offer?.perPiece > 0 && (
              <small> · ₹{sellingOption.offer.perPiece} / piece</small>
            )}
          </span>
        </div>
        <div className="pdp-mobile-bar-actions">
          <button
            type="button"
            className="btn btn-outline pdp-mobile-bar-cart"
            disabled={submitting || buyingNow || outOfStock}
            onClick={handleAddOrGoToCart}
            tabIndex={footerInView ? -1 : 0}
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
            tabIndex={footerInView ? -1 : 0}
          >
            {buyingNow ? <Loader2 size={16} className="btn-spinner" /> : (<><Zap size={16} /> Buy Now</>)}
          </button>
        </div>
      </div>

      {relatedProducts && relatedProducts.length > 0 && (
        <section className="section product-detail-related">
          <h2>You may also like</h2>
          <ProductGrid products={relatedProducts} />
        </section>
      )}

      {recentlyViewed.length > 0 && (
        <section className="section product-detail-related">
          <h2>Recently viewed</h2>
          <ProductGrid products={recentlyViewed} />
        </section>
      )}
      </div>
    </>
  );
}
