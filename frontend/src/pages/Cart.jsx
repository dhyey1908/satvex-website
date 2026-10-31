import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { useConfirm } from '../context/ConfirmContext';
import { orderService } from '../services/orderService';
import { addressService } from '../services/addressService';
import { CartItem } from '../components/CartItem';
import { OrderSummary } from '../components/OrderSummary';
import { FreeShippingBanner } from '../components/FreeShippingBanner';
import { CouponInput } from '../components/CouponInput';
import { TrustRow } from '../components/TrustRow';
import { ProductGrid } from '../components/ProductGrid';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useCatalog } from '../hooks/useCatalog';
import { useStickyBarHeight } from '../hooks/useStickyBarHeight';
import { estimateWindow } from '../utils/deliveryEstimate';
import { useCouponChips } from '../hooks/useCouponChips';
import { Loader } from '../components/Loader';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { ArrowLeft, Trash2, Bookmark, Sparkles, Truck, Heart } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Cart.css';

export function Cart() {
  useDocumentMeta({ title: 'Cart', path: '/cart', noindex: true });

  const couponChips = useCouponChips();
  const { items, savedItems, itemCount, loading, updateItem, removeItem, setSavedForLater, appliedCoupon, applyCoupon, clearCoupon } = useCart();
  const catalog = useCatalog();
  const mobileBarRef = useRef(null);
  useStickyBarHeight(mobileBarRef);
  const cartLoading = loading && items.length === 0 && savedItems.length === 0;
  const holdLoader = useMinimumLoading(cartLoading);
  const { showToast } = useToast();
  const { settings } = useSettings();
  const confirm = useConfirm();

  // Live, backend-computed preview of GST/shipping/total — the Cart page
  // never computes these itself. Payment method isn't chosen yet at this
  // stage, so the preview intentionally omits any COD charge (quoted as
  // "Online") — Checkout shows the real total once a payment method is picked.
  const [quote, setQuote] = useState(null);
  // The inputs `quote` was computed for - see Checkout.jsx for why a quote
  // that doesn't match the current cart must not be displayed.
  const [quoteKey, setQuoteKey] = useState(null);
  // Default/first saved address's pincode, if any — lets the real
  // Shiprocket-rate shipping charge show as early as the cart page, not
  // just at checkout. Without a saved address, the quote still works, just
  // using the flat fallback charge until a pincode is known.
  const [defaultPincode, setDefaultPincode] = useState(null);

  useEffect(() => {
    addressService
      .list()
      .then(({ addresses }) => {
        const def = addresses.find((a) => a.isDefault) || addresses[0];
        if (def) setDefaultPincode(def.pincode);
      })
      .catch(() => {});
  }, []);

  const cartQuoteKey = JSON.stringify([
    items.map((i) => `${i.cartItemId}:${i.quantity}:${i.sellingOptionId}`),
    appliedCoupon?.code || '',
    defaultPincode || '',
  ]);

  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const key = cartQuoteKey;
    orderService
      .quote({ couponCode: appliedCoupon?.code, paymentMethod: 'Online', pincode: defaultPincode || undefined })
      .then((data) => {
        if (cancelled) return;
        setQuote(data);
        setQuoteKey(key);
      })
      .catch((err) => {
        if (cancelled) return;
        // A coupon that no longer qualifies (e.g. the cart dropped below its
        // minimum order value) is removed, with the reason.
        if (/^(COUPON_|INVALID_COUPON)/.test(err.code || '')) {
          clearCoupon();
          showToast(`${err.message} The coupon was removed.`, 'warning');
        }
        setQuote(null);
        setQuoteKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [items, appliedCoupon, defaultPincode]);

  async function handleQuantityChange(cartItemId, quantity) {
    try {
      await updateItem(cartItemId, { quantity });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleEditColours(cartItemId, selectedColors) {
    // The backend re-validates the pack size, stock and duplicates; an error
    // is shown inside the Edit colours dialog.
    await updateItem(cartItemId, { selectedColors });
  }

  async function handleRemove(cartItemId) {
    try {
      await removeItem(cartItemId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleSaveForLater(cartItemId) {
    try {
      await setSavedForLater(cartItemId, true);
      showToast('Saved for later');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleMoveToCart(cartItemId) {
    try {
      await setSavedForLater(cartItemId, false);
      showToast('Moved to cart', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleClearCart() {
    const ok = await confirm({
      title: 'Clear your cart?',
      message: 'This will remove all items from your cart. This cannot be undone.',
      confirmLabel: 'Clear Cart',
      danger: true,
    });
    if (!ok) return;
    try {
      await Promise.all(items.map((item) => removeItem(item.cartItemId)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (cartLoading || holdLoader) return <Loader label="Loading your cart…" />;

  if (items.length === 0 && savedItems.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          title="Your cart is empty."
          message="Pick your colours and they will show up here."
          action={
            <div className="cart-empty-actions">
              <Link to="/shop" className="btn btn-primary">
                Continue shopping
              </Link>
              <Link to="/wishlist" className="cart-empty-wishlist">
                <Heart size={16} aria-hidden="true" /> View your wishlist
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  // Everything below is shown exactly as the backend quote returned it.
  const discountAmount = quote?.discountAmount ?? appliedCoupon?.discountAmount ?? 0;
  // Until the server's quote for THIS cart arrives, there is no total to show.
  const quoteIsCurrent = Boolean(quote) && quoteKey === cartQuoteKey;
  const grandTotal = quote?.total ?? 0;
  const savingsAmount = quote?.savingsAmount ?? 0;
  const alsoLike = (catalog || []).filter((p) => !items.some((i) => i.productId === p.productId));

  return (
    <div className="container section cart-page">
      <nav className="pdp-breadcrumb text-label-sm" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span className="pdp-breadcrumb-current">Your Cart</span>
      </nav>

      <PageHeader title="Shopping Bag" count={itemCount} countLabel="items" />

      <FreeShippingBanner quote={quote} />

      <div className="cart-layout">
        <div className="cart-items">
          {items.length === 0 && (
            <EmptyState title="No items in your cart" message="Move something back from Saved for Later, or keep shopping." />
          )}
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <CartItem
                key={item.cartItemId}
                item={item}
                catalog={catalog}
                onQuantityChange={(qty) => handleQuantityChange(item.cartItemId, qty)}
                onEditColours={(colors) => handleEditColours(item.cartItemId, colors)}
                onRemove={() => handleRemove(item.cartItemId)}
                onSaveForLater={() => handleSaveForLater(item.cartItemId)}
              />
            ))}
          </AnimatePresence>

          {items.length > 0 && (
            <div className="cart-actions-row">
              <Link to="/shop" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Continue Shopping</Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearCart}><Trash2 size={14} /> Clear Cart</button>
            </div>
          )}

          {savedItems.length > 0 && (
            <div className="cart-saved-section">
              <h3><Bookmark size={16} /> Saved for Later ({savedItems.length})</h3>
              <AnimatePresence initial={false}>
                {savedItems.map((item) => (
                  <CartItem
                    key={item.cartItemId}
                    item={item}
                    catalog={catalog}
                    onRemove={() => handleRemove(item.cartItemId)}
                    onMoveToCart={() => handleMoveToCart(item.cartItemId)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-summary-col">
            <div className="cart-coupon-card">
              <CouponInput
                appliedCoupon={appliedCoupon}
                onApply={applyCoupon}
                onClear={clearCoupon}
                chips={couponChips}
              />
            </div>

            <p className="cart-delivery-estimate">
              <Truck size={16} aria-hidden="true" /> Estimated delivery: {estimateWindow(settings?.shipping)}
            </p>

            <OrderSummary
              subtotal={quote?.subtotal ?? 0}
              discountAmount={discountAmount}
              couponCode={appliedCoupon?.code}
              gstPercent={quote?.gstPercent}
              gstAmount={quote?.gstAmount}
              pricesIncludeGst={quote?.pricesIncludeGst}
              shippingEnabled={quote?.shippingEnabled}
              shipping={quote?.shipping}
              prepaidDiscount={quote?.prepaidDiscount}
              total={grandTotal}
              pending={!quoteIsCurrent}
              savingsAmount={savingsAmount}
            >
              {/* Server-computed (quote.prepaidOffer) — present only when
                  online payment is available and prepaid is actually
                  cheaper, so this never advertises a saving that isn't
                  real. */}
              {quote?.prepaidOffer?.savings > 0 && (
                <div className="prepaid-offer-note">
                  <Sparkles size={16} />
                  <p>
                    <strong>Pay online and save ₹{quote.prepaidOffer.savings.toFixed(2)}</strong>
                    {quote.prepaidOffer.codCharge > 0 && ` — no ₹${quote.prepaidOffer.codCharge.toFixed(2)} COD charge`}
                    {quote.prepaidOffer.prepaidDiscount > 0 && `, plus ₹${quote.prepaidOffer.prepaidDiscount.toFixed(2)} prepaid offer`}.
                  </p>
                </div>
              )}
              <Link to="/checkout" className="btn btn-primary btn-block">
                Checkout
              </Link>
            </OrderSummary>

            <div className="cart-trust-section">
              <TrustRow omit={['cod']} />
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && alsoLike.length > 0 && (
        <section className="cart-also-like" aria-labelledby="cart-also-like-title">
          <h2 id="cart-also-like-title" className="text-headline-sm">You may also like</h2>
          <ProductGrid products={alsoLike} />
        </section>
      )}

      {items.length > 0 && (
        <div className="cart-mobile-bar" ref={mobileBarRef}>
          <div className="cart-mobile-bar-total">
            <span className="cart-mobile-bar-amount">{quoteIsCurrent ? `₹${grandTotal.toFixed(2)}` : '…'}</span>
            {savingsAmount > 0 && <span className="cart-mobile-bar-savings">Saved ₹{savingsAmount.toFixed(2)}</span>}
          </div>
          <Link to="/checkout" className="btn btn-primary cart-mobile-bar-cta">
            Checkout
          </Link>
        </div>
      )}
    </div>
  );
}
