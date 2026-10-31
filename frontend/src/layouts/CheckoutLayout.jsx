import { Outlet, Link, useSearchParams } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useSettings } from '../context/SettingsContext';
import './CheckoutLayout.css';

// Minimal frame for checkout: no announcement bar, search, wishlist or menu —
// just the logo, a "Secure checkout" label and a way back to the bag, with a
// slim legal footer. Nothing here competes with the payment form.
export function CheckoutLayout() {
  const { settings } = useSettings();
  // A Buy Now checkout is its own one-item checkout: the way back is the product, not the bag.
  const [params] = useSearchParams();
  const buyNow = params.get('mode') === 'buynow';
  const product = params.get('product');
  const backTo = buyNow ? (product ? `/product/${encodeURIComponent(product)}` : '/shop') : '/cart';

  return (
    <div className="app-shell checkout-shell">
      <header className="checkout-header">
        <div className="container checkout-header-inner">
          <Link to="/" className="brand-logo" aria-label="Satvex home">
            <BrandLogo height={36} cropTagline />
          </Link>
          <span className="checkout-header-secure">
            <Lock size={16} aria-hidden="true" /> Secure checkout
          </span>
          <Link to={backTo} className="checkout-header-back">
            <ArrowLeft size={16} aria-hidden="true" /> {buyNow ? 'Return to product' : 'Return to bag'}
          </Link>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="checkout-footer">
        <div className="container checkout-footer-inner">
          <nav aria-label="Legal">
            <Link to="/terms-conditions">Terms &amp; Conditions</Link>
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/returns-refunds">Returns &amp; Refunds</Link>
            <Link to="/contact">Contact Us</Link>
          </nav>
          <p>© {new Date().getFullYear()} {settings?.brandName || 'Satvex'}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
