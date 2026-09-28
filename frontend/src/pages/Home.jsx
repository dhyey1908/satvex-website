import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, Gift, Leaf, Infinity as InfinityIcon, Package, Star, CheckCircle2, XCircle, ShoppingBag, Quote } from 'lucide-react';
import { productService } from '../services/productService';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { ProductGrid } from '../components/ProductGrid';
import { ColorSwatch } from '../components/ColorSwatch';
import { ImagePlaceholder } from '../components/ImagePlaceholder';
import { PriceDisplay } from '../components/PriceDisplay';
import { HeroBanner } from '../components/HeroBanner';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { usePreloadedImage } from '../hooks/usePreloadedImage';
import { staggerContainer, fadeUp, revealOnScroll, crossfade } from '../motion';
import './Home.css';

const WHY_PILLAR_ICONS = [InfinityIcon, Leaf, Package, Star];
const DEFAULT_WHY_PILLARS = [
  { title: 'Flexible', description: 'Moves comfortably with your everyday needs.' },
  { title: 'Comfortable', description: 'Lightweight designs created for effortless everyday use.' },
  { title: 'Durable', description: 'Made to deliver dependable performance and lasting usability.' },
  { title: 'Stylish', description: 'Modern aesthetics designed for today’s women.' },
];

export function Home() {
  useDocumentMeta({
    title: 'Beauty & Fashion Accessories',
    description: 'SATVEX creates modern women-focused essentials designed around flexibility, comfort, durability and effortless style.',
    path: '/',
  });

  const { isAuthenticated } = useAuth();
  const { addItem: addToCart, isInCart } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    productService
      .list()
      .then((data) => {
        setProducts(data.products);
        const first = data.products?.[0];
        const activeVariants = (first?.variants || []).filter((v) => v.isActive);
        // Prefer an in-stock color as the default preview so the page never
        // lands on an unselectable swatch; fall back to the first active one
        // if every color happens to be out of stock.
        const defaultVariant = activeVariants.find((v) => v.inStock !== false) || activeVariants[0];
        if (defaultVariant) setSelectedVariantId(defaultVariant.id);
      })
      .catch((err) => setError(err.message));
  }, []);

  const featured = products?.filter((p) => p.isFeatured) ?? [];
  const showcase = products?.[0];
  const activeVariants = (showcase?.variants || []).filter((v) => v.isActive);
  const selectedVariant = activeVariants.find((v) => v.id === selectedVariantId) || activeVariants[0];
  const selectedIndex = activeVariants.findIndex((v) => v.id === selectedVariant?.id);

  const activeOptions = (showcase?.sellingOptions || []).filter((o) => o.isActive);
  const singleOption = activeOptions.find((o) => o.quantity === 1);
  const cheapestOption = activeOptions.reduce((min, o) => (!min || o.price < min.price ? o : min), null);
  const displayOption = singleOption || cheapestOption;

  const heroImage = selectedVariant?.image || showcase?.images?.[0];
  const showcaseImageTarget = selectedVariant?.image || showcase?.images?.[0];
  // Keeps the previous swatch's photo on screen until the newly-selected
  // one has actually loaded, instead of swapping the instant it's clicked.
  const showcaseImage = usePreloadedImage(showcaseImageTarget);
  const isSingleProduct = (products?.length ?? 0) <= 1;

  const quickAddInCart =
    showcase && singleOption && selectedVariant && isInCart(showcase.productId, singleOption.id, [selectedVariant.id]);

  async function handleQuickAdd() {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }
    if (!showcase || !singleOption || !selectedVariant) return;
    if (quickAddInCart) {
      navigate('/cart');
      return;
    }
    if (selectedVariant.inStock === false) {
      showToast('This color is out of stock.', 'error');
      return;
    }

    setAdding(true);
    try {
      await addToCart({
        productId: showcase.productId,
        sellingOptionId: singleOption.id,
        selectedColors: [selectedVariant.id],
        quantity: 1,
      });
      showToast('Added to bag', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="home-page">
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner">
          <motion.div
            className="hero-copy"
            variants={staggerContainer(0.1)}
            initial="initial"
            animate="animate"
          >
            <motion.div className="eyebrow-dot" variants={fadeUp}><span>Satvex Collection</span></motion.div>
            <motion.h1 className="text-display-xl hero-heading" variants={fadeUp}>
              Designed for Her.<br />
              <em>Made to Move.</em>
            </motion.h1>
            <motion.p className="text-body-lg hero-lede" variants={fadeUp}>
              SATVEX creates modern women-focused essentials designed around flexibility, comfort,
              durability and effortless style.
            </motion.p>
            <motion.div className="hero-actions" variants={fadeUp}>
              <Link to="/shop" className="btn btn-primary">{isSingleProduct ? 'Shop Now' : 'Shop the Collection'}</Link>
              <Link to="/about" className="hero-text-link">Discover Our Story →</Link>
            </motion.div>
            <motion.div className="hero-trust-row" variants={fadeUp}>
              <span className="hero-trust-item"><Gift size={16} />Ready to Gift</span>
              <span className="hero-trust-sep">•</span>
              <span className="hero-trust-item"><Leaf size={16} />Skin-Friendly Materials</span>
            </motion.div>
          </motion.div>
          <HeroBanner
            banners={settings?.heroBanners}
            fallback={
              <div className="hero-image">
                {heroImage ? (
                  <>
                    <img src={heroImage} alt={showcase?.name} />
                    <div className="hero-image-overlay" />
                    {selectedVariant && (
                      <div className="hero-image-badge">
                        <span className="hero-image-badge-dot" />
                        <div>
                          <p>{showcase?.name}</p>
                          <p>Shade: {selectedVariant.colorName}</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <ImagePlaceholder label="Satvex — image coming soon" />
                )}
              </div>
            }
          />
        </div>
      </section>

      {/* INTERACTIVE COLOR SHOWCASE */}
      {showcase && (
        <section className="section showcase-section">
          <div className="container">
            <motion.div
              className="showcase-header"
              initial={revealOnScroll.initial}
              whileInView={revealOnScroll.whileInView}
              viewport={{ once: true, margin: '-80px' }}
            >
              <div className="eyebrow-dot"><span>Choose Your Shade</span></div>
              <h2 className="text-headline-lg">{activeVariants.length} Colors, One Signature Shape</h2>
              <p className="text-body-md showcase-subcopy">
                Every shade in the {showcase.name} collection, ready to explore.
              </p>
            </motion.div>

            <div className="showcase-box">
              <div className="showcase-media">
                <AnimatePresence>
                  {showcaseImage ? (
                    <motion.img
                      key={showcaseImage}
                      src={showcaseImage}
                      alt={selectedVariant?.colorName}
                      initial={crossfade.initial}
                      animate={crossfade.animate}
                      exit={crossfade.exit}
                    />
                  ) : (
                    <ImagePlaceholder />
                  )}
                </AnimatePresence>
                {selectedVariant && (
                  <div className="showcase-media-badge">
                    <span className="showcase-media-badge-dot" />
                    <span>Viewing: {selectedVariant.colorName}</span>
                  </div>
                )}
                <div className="showcase-media-hint">Tap a color to preview</div>
              </div>

              <div className="showcase-panel">
                <div>
                  <div className="showcase-panel-top">
                    <span className="text-label-sm showcase-panel-label">Select a Color</span>
                    {activeVariants.length > 0 && (
                      <span className="text-label-sm showcase-panel-count">{selectedIndex + 1} of {activeVariants.length}</span>
                    )}
                  </div>
                  <h3 className="text-headline-sm showcase-variant-name">{selectedVariant?.colorName}</h3>
                  <p className="showcase-stock-line">
                    {selectedVariant?.inStock === false ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                    {selectedVariant?.inStock === false ? 'Currently out of stock' : 'In stock, ready to ship'}
                  </p>
                </div>

                <div className="showcase-swatch-block">
                  <span className="text-label-sm showcase-swatch-label">Available Colors</span>
                  <div className="showcase-swatch-tray">
                    {activeVariants.map((v) => (
                      <ColorSwatch
                        key={v.id}
                        colorCode={v.colorCode}
                        colorName={v.colorName}
                        selected={v.id === selectedVariant?.id}
                        outOfStock={v.inStock === false}
                        onClick={() => setSelectedVariantId(v.id)}
                      />
                    ))}
                  </div>
                </div>

                {displayOption && (
                  <div className="showcase-pricing">
                    <div className="showcase-pricing-row">
                      <div>
                        <PriceDisplay price={displayOption.price} compareAtPrice={displayOption.compareAtPrice} size="lg" />
                      </div>
                      <span className="text-label-sm showcase-pricing-note">Free Shipping</span>
                    </div>
                    {activeOptions.length > 1 && (
                      <div className="showcase-option-pills">
                        {activeOptions.map((o) => (
                          <span key={o.id} className={`showcase-option-pill ${o.id === singleOption?.id ? '' : 'accent'}`}>
                            {o.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="showcase-cta-row">
                  {singleOption && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleQuickAdd}
                      disabled={adding || (!quickAddInCart && selectedVariant?.inStock === false)}
                    >
                      <ShoppingBag size={18} />
                      {adding ? 'Adding…' : quickAddInCart ? 'Go to Cart' : `Quick Add · ₹${singleOption.price}`}
                    </button>
                  )}
                  <Link to={`/product/${showcase.slug}`} className="btn showcase-view-btn">
                    View Product
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FEATURED COLLECTION — hidden when there's only one product, since the
          Interactive Showcase above already spotlights it; this grid earns
          its place back automatically once a 2nd product exists. */}
      {(!products || products.length > 1) && (
        <section className="section">
          <div className="container">
            <motion.div
              className="collection-header"
              initial={revealOnScroll.initial}
              whileInView={revealOnScroll.whileInView}
              viewport={{ once: true, margin: '-80px' }}
            >
              <div className="eyebrow-dot"><span>Featured</span></div>
              <h2 className="text-headline-lg">Shop the Collection</h2>
            </motion.div>

            {error && <p className="field-error">{error}</p>}

            {!error && (
              <div className="home-product-grid">
                <ProductGrid products={featured.length > 0 ? featured : products} loading={!products} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* TRUST PILLARS */}
      <section className="section why-satvex">
        <div className="container">
          <div className="eyebrow-dot"><span>Why Satvex</span></div>
          <motion.div
            className="why-grid"
            variants={staggerContainer(0.08)}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-80px' }}
          >
            {(settings?.whyPillars || DEFAULT_WHY_PILLARS).map((pillar, i) => {
              const Icon = WHY_PILLAR_ICONS[i];
              return (
                <motion.div className="why-card" variants={fadeUp} key={pillar.title}>
                  <div className="why-icon"><Icon size={i === 3 ? 22 : 20} /></div>
                  <h3 className="text-title-md">{pillar.title}</h3>
                  <p className="text-body-sm">{pillar.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* QUOTE BANNER */}
      <section className="section quote-section">
        <div className="container">
          <motion.div
            className="quote-banner"
            initial={revealOnScroll.initial}
            whileInView={revealOnScroll.whileInView}
            viewport={{ once: true, margin: '-80px' }}
          >
            <div className="quote-banner-content">
              <Quote size={28} fill="currentColor" />
              <blockquote className="text-headline-lg">
                Wear a little wonder, every day.
              </blockquote>
              <p className="text-label-md quote-attribution">— The Satvex Promise</p>
            </div>
            <div className="quote-banner-glow quote-banner-glow-1" />
            <div className="quote-banner-glow quote-banner-glow-2" />
          </motion.div>
        </div>
      </section>

      {/* BRAND STATEMENT */}
      <motion.section
        className="section brand-statement"
        initial={revealOnScroll.initial}
        whileInView={revealOnScroll.whileInView}
        viewport={{ once: true, margin: '-80px' }}
      >
        <p>Thoughtfully designed. Quietly luxurious. Made for the woman who notices the details.</p>
      </motion.section>

      {/* FINAL CTA */}
      <section className="section">
        <div className="container">
          <motion.div
            className="final-cta"
            initial={revealOnScroll.initial}
            whileInView={revealOnScroll.whileInView}
            viewport={{ once: true, margin: '-80px' }}
          >
            <h2 className="text-headline-lg">Ready to Find Your Shade?</h2>
            <p>Discover the Satvex piece designed to move with you, every day.</p>
            <Link to="/shop" className="btn btn-primary">{isSingleProduct ? 'Shop Now' : 'Shop the Collection'}</Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
