import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../services/productService';
import { contactService } from '../services/contactService';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { ProductGrid } from '../components/ProductGrid';
import { ImagePlaceholder } from '../components/ImagePlaceholder';
import { HeroBanner } from '../components/HeroBanner';
import { TruckIcon, GiftIcon, LeafIcon, InfinityIcon, BoxIcon, StarIcon, CheckCircleIcon, BagIcon, QuoteIcon } from '../components/Icons';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Home.css';

export function Home() {
  useDocumentMeta({
    title: 'Beauty & Fashion Accessories',
    description: 'SATVEX creates modern women-focused essentials designed around flexibility, comfort, durability and effortless style.',
    path: '/',
  });

  const { isAuthenticated } = useAuth();
  const { addItem: addToCart } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();

  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    productService
      .list()
      .then((data) => {
        setProducts(data.products);
        const first = data.products?.[0];
        const firstActiveVariant = first?.variants?.find((v) => v.isActive);
        if (firstActiveVariant) setSelectedVariantId(firstActiveVariant.id);
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
  const onSale = displayOption?.compareAtPrice && displayOption.compareAtPrice > displayOption.price;

  const heroImage = selectedVariant?.image || showcase?.images?.[0];
  const showcaseImage = selectedVariant?.image || showcase?.images?.[0];

  async function handleQuickAdd() {
    if (!isAuthenticated) {
      showToast('Please log in to add items to your bag', 'error');
      return;
    }
    if (!showcase || !singleOption || !selectedVariant) return;

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

  async function handleSubscribe(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribing(true);
    try {
      await contactService.submit({
        name: 'Newsletter subscriber',
        email: email.trim(),
        message: 'Please add me to the Satvex mailing list for new releases and drops.',
      });
      showToast("You're on the list — thank you!", 'success');
      setEmail('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <div className="home-page">
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="eyebrow-dot"><span>Satvex Collection</span></div>
            <h1 className="text-display-xl hero-heading">
              Designed for Her.<br />
              <em>Made to Move.</em>
            </h1>
            <p className="text-body-lg hero-lede">
              SATVEX creates modern women-focused essentials designed around flexibility, comfort,
              durability and effortless style.
            </p>
            <div className="hero-actions">
              <Link to="/shop" className="btn btn-primary">Shop the Collection</Link>
              <Link to="/about" className="hero-text-link">Discover Our Story →</Link>
            </div>
            <div className="hero-trust-row">
              <span className="hero-trust-item"><TruckIcon />Free Pan-India Shipping</span>
              <span className="hero-trust-sep">•</span>
              <span className="hero-trust-item"><GiftIcon />Ready to Gift</span>
              <span className="hero-trust-sep">•</span>
              <span className="hero-trust-item"><LeafIcon width={16} height={16} />Skin-Friendly Materials</span>
            </div>
          </div>
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
            <div className="showcase-header">
              <div className="eyebrow-dot"><span>Signature Spectrum</span></div>
              <h2 className="text-headline-lg">{activeVariants.length} Colors, One Signature Shape</h2>
              <p className="text-body-md showcase-subcopy">
                Every shade in the {showcase.name} collection, ready to explore.
              </p>
            </div>

            <div className="showcase-box">
              <div className="showcase-media">
                {showcaseImage ? (
                  <img src={showcaseImage} alt={selectedVariant?.colorName} />
                ) : (
                  <ImagePlaceholder />
                )}
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
                    <CheckCircleIcon />
                    {selectedVariant?.isActive ? 'In stock, ready to ship' : 'Currently out of stock'}
                  </p>
                </div>

                <div className="showcase-swatch-block">
                  <span className="text-label-sm showcase-swatch-label">Available Colors</span>
                  <div className="showcase-swatch-tray">
                    {activeVariants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`showcase-swatch ${v.id === selectedVariant?.id ? 'selected' : ''}`}
                        style={{ background: v.colorCode }}
                        aria-label={v.colorName}
                        onClick={() => setSelectedVariantId(v.id)}
                      />
                    ))}
                  </div>
                </div>

                {displayOption && (
                  <div className="showcase-pricing">
                    <div className="showcase-pricing-row">
                      <div>
                        <span className="showcase-price">₹{displayOption.price}</span>
                        {onSale && <span className="showcase-compare-price">₹{displayOption.compareAtPrice}</span>}
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
                    <button type="button" className="btn btn-primary" onClick={handleQuickAdd} disabled={adding}>
                      <BagIcon width={18} height={18} />
                      {adding ? 'Adding…' : `Quick Add · ₹${singleOption.price}`}
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

      {/* FEATURED COLLECTION */}
      <section className="section">
        <div className="container">
          <div className="collection-header">
            <div className="eyebrow-dot"><span>Featured</span></div>
            <h2 className="text-headline-lg">Shop the Collection</h2>
          </div>

          {error && <p className="field-error">{error}</p>}

          {!error && (
            <div className="home-product-grid">
              <ProductGrid products={featured.length > 0 ? featured : products} loading={!products} />
            </div>
          )}
        </div>
      </section>

      {/* TRUST PILLARS */}
      <section className="section why-satvex">
        <div className="container">
          <div className="eyebrow-dot"><span>Why Satvex</span></div>
          <div className="why-grid">
            <div className="why-card">
              <div className="why-icon"><InfinityIcon /></div>
              <h3 className="text-title-md">Flexible</h3>
              <p className="text-body-sm">Moves comfortably with your everyday needs.</p>
            </div>
            <div className="why-card">
              <div className="why-icon"><LeafIcon /></div>
              <h3 className="text-title-md">Comfortable</h3>
              <p className="text-body-sm">Lightweight designs created for effortless everyday use.</p>
            </div>
            <div className="why-card">
              <div className="why-icon"><BoxIcon /></div>
              <h3 className="text-title-md">Durable</h3>
              <p className="text-body-sm">Made to deliver dependable performance and lasting usability.</p>
            </div>
            <div className="why-card">
              <div className="why-icon"><StarIcon width={22} height={22} /></div>
              <h3 className="text-title-md">Stylish</h3>
              <p className="text-body-sm">Modern aesthetics designed for today&apos;s women.</p>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE BANNER */}
      <section className="section quote-section">
        <div className="container">
          <div className="quote-banner">
            <div className="quote-banner-content">
              <QuoteIcon />
              <blockquote className="text-headline-lg">
                Wear a little wonder, every day.
              </blockquote>
              <p className="text-label-md quote-attribution">— The Satvex Promise</p>
            </div>
            <div className="quote-banner-glow quote-banner-glow-1" />
            <div className="quote-banner-glow quote-banner-glow-2" />
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="section newsletter-section">
        <div className="container">
          <div className="newsletter-card">
            <div>
              <div className="eyebrow-dot"><span>Join the List</span></div>
              <h3 className="text-headline-sm">Receive New Releases Before Public Drops</h3>
              <p className="text-body-sm newsletter-copy">
                Be first to know about new colors, combos, and limited drops.
              </p>
            </div>
            <form className="newsletter-form" onSubmit={handleSubscribe}>
              <input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={subscribing}>
                {subscribing ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
