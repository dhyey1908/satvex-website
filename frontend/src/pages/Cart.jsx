import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { orderService } from '../services/orderService';
import { addressService } from '../services/addressService';
import { CartItem } from '../components/CartItem';
import { OrderSummary } from '../components/OrderSummary';
import { FreeShippingBanner } from '../components/FreeShippingBanner';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Loader } from '../components/Loader';
import { ArrowLeft, Trash2, Bookmark, ShieldCheck, RotateCcw, Lock, Sparkles } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Cart.css';

export function Cart() {
  useDocumentMeta({ title: 'Cart', path: '/cart', noindex: true });

  const { items, savedItems, total, loading, updateItem, removeItem, setSavedForLater, appliedCoupon } = useCart();
  const { showToast } = useToast();
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
      .catch(() => {
        if (cancelled) return;
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

  if (loading && items.length === 0 && savedItems.length === 0) return <Loader label="Loading your cart…" />;

  if (items.length === 0 && savedItems.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          title="Your cart is empty."
          action={
            <Link to="/shop" className="btn btn-primary">
              Continue Shopping
            </Link>
          }
        />
      </div>
    );
  }

  const discountAmount = quote?.discountAmount ?? appliedCoupon?.discountAmount ?? 0;
  const grandTotal = quote?.total ?? Number((total - discountAmount).toFixed(2));
  // Until the server's quote for THIS cart arrives, grandTotal is just the
  // item subtotal - without GST/shipping - so it must not be shown as "Total".
  const quoteIsCurrent = Boolean(quote) && quoteKey === cartQuoteKey;
  const productSavings = items.reduce(
    (sum, item) => sum + (item.compareAtPrice > item.unitPrice ? (item.compareAtPrice - item.unitPrice) * item.quantity : 0),
    0
  );
  const savingsAmount = productSavings + discountAmount;

  return (
    <div className="container section cart-page">
      <nav className="pdp-breadcrumb text-label-sm" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span className="pdp-breadcrumb-current">Your Cart</span>
      </nav>

      <PageHeader title="Shopping Bag" count={items.length} countLabel="items" />

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
                onQuantityChange={(qty) => handleQuantityChange(item.cartItemId, qty)}
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
            <OrderSummary
              subtotal={quote?.subtotal ?? total}
              discountAmount={discountAmount}
              couponCode={appliedCoupon?.code}
              gstPercent={quote?.gstPercent}
              gstAmount={quote?.gstAmount}
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
              <div className="cart-trust-item">
                <ShieldCheck size={16} />
                <span>100% Secure Checkout</span>
              </div>
              <div className="cart-trust-item">
                <Lock size={16} />
                <span>Your payment details are safe</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="cart-mobile-bar">
          <div className="cart-mobile-bar-total">
            <span className="cart-mobile-bar-amount">{quoteIsCurrent ? `₹${grandTotal.toFixed(2)}` : '…'}</span>
            {savingsAmount > 0 && <span className="cart-mobile-bar-savings">Saved ₹{savingsAmount.toFixed(2)}</span>}
          </div>
          <Link to="/checkout" className="btn btn-primary cart-mobile-bar-cta">
            Proceed to Buy
          </Link>
        </div>
      )}
    </div>
  );
}
