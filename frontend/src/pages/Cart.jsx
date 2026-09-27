import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { CartItem } from '../components/CartItem';
import { OrderSummary } from '../components/OrderSummary';
import { CouponInput } from '../components/CouponInput';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Loader } from '../components/Loader';
import { CheckCircleIcon } from '../components/Icons';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Cart.css';

export function Cart() {
  useDocumentMeta({ title: 'Cart', path: '/cart' });

  const { items, savedItems, total, loading, updateItem, removeItem, setSavedForLater, appliedCoupon, applyCoupon, clearCoupon } =
    useCart();
  const { showToast } = useToast();
  const confirm = useConfirm();

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

  const discountAmount = appliedCoupon?.discountAmount || 0;
  const grandTotal = Number((total - discountAmount).toFixed(2));

  return (
    <div className="container section cart-page">
      <nav className="pdp-breadcrumb text-label-sm" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span className="pdp-breadcrumb-current">Your Cart</span>
      </nav>

      <PageHeader title="Shopping Bag" count={items.length} countLabel="items" />

      <div className="cart-free-shipping-banner">
        <CheckCircleIcon />
        <span>Every order ships free — no minimum required.</span>
      </div>

      <div className="cart-layout">
        <div className="cart-items">
          {items.length === 0 && (
            <EmptyState title="No items in your cart" message="Move something back from Saved for Later, or keep shopping." />
          )}
          {items.map((item) => (
            <CartItem
              key={item.cartItemId}
              item={item}
              onQuantityChange={(qty) => handleQuantityChange(item.cartItemId, qty)}
              onRemove={() => handleRemove(item.cartItemId)}
              onSaveForLater={() => handleSaveForLater(item.cartItemId)}
            />
          ))}

          {items.length > 0 && (
            <div className="cart-actions-row">
              <Link to="/shop" className="btn btn-ghost btn-sm">Continue Shopping</Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearCart}>Clear Cart</button>
            </div>
          )}

          {savedItems.length > 0 && (
            <div className="cart-saved-section">
              <h3>Saved for Later ({savedItems.length})</h3>
              {savedItems.map((item) => (
                <CartItem
                  key={item.cartItemId}
                  item={item}
                  onRemove={() => handleRemove(item.cartItemId)}
                  onMoveToCart={() => handleMoveToCart(item.cartItemId)}
                />
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-summary-col">
            <OrderSummary
              subtotal={total}
              discountAmount={discountAmount}
              couponCode={appliedCoupon?.code}
              total={grandTotal}
            >
              <CouponInput appliedCoupon={appliedCoupon} onApply={applyCoupon} onClear={clearCoupon} />
              <Link to="/checkout" className="btn btn-primary btn-block">
                Checkout
              </Link>
            </OrderSummary>
          </div>
        )}
      </div>
    </div>
  );
}
