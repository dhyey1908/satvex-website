import { CheckCircle2, Truck } from 'lucide-react';
import './FreeShippingBanner.css';

// Shared between Cart and Checkout — always driven by the backend's quote
// response (amountToFreeShipping/qualifiesForFreeShipping), never computed
// here. Renders nothing until a quote has loaded, and nothing at all if the
// store has no free-shipping threshold configured (freeThreshold <= 0).
export function FreeShippingBanner({ quote }) {
  if (!quote || !quote.freeShippingThreshold) return null;

  if (quote.qualifiesForFreeShipping) {
    return (
      <div className="free-shipping-banner qualifies">
        <CheckCircle2 size={16} />
        <span>Your order ships free.</span>
      </div>
    );
  }

  if (quote.amountToFreeShipping > 0) {
    return (
      <div className="free-shipping-banner">
        <Truck size={16} />
        <span>Add ₹{quote.amountToFreeShipping.toFixed(2)} more for free shipping.</span>
      </div>
    );
  }

  return null;
}
