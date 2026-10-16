import { useState } from 'react';
import { Truck, BadgePercent, ChevronDown } from 'lucide-react';
import './OrderSummary.css';
import { BrandDots } from './BrandLoader';

// Shown in place of a total/shipping figure that is still being worked out.
function CalculatingDots() {
  return (
    <span className="calc-dots">
      <BrandDots size="sm" />
      <span className="visually-hidden">Calculating…</span>
    </span>
  );
}

export function OrderSummary({
  subtotal = 0,
  discountAmount = 0,
  couponCode,
  gstPercent = 0,
  gstAmount = 0,
  shippingEnabled = true,
  shipping = 0,
  codCharge = 0,
  prepaidDiscount = 0,
  total = 0,
  savingsAmount = 0,
  itemCount,
  itemsSlot,
  // Cart/OrderConfirmation/AccountOrderDetail keep their current
  // always-expanded behavior unless they opt in; Checkout passes false so
  // it starts as just the compact Total row.
  defaultExpanded = true,
  // True while the server's quote for the CURRENT inputs hasn't arrived yet:
  // the amounts above are then stale or a fallback, so they're replaced with
  // "Calculating…" instead of showing a wrong total (or a wrong "Free").
  pending = false,
  children,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="order-summary">
      <h3>Order Summary</h3>

      <button
        type="button"
        className="order-summary-collapsed-row"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="order-summary-expanded"
      >
        <span className="order-summary-collapsed-left">
          <span className="order-summary-collapsed-label">Total</span>
          {typeof itemCount === 'number' && (
            <span className="order-summary-collapsed-count">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span className="order-summary-collapsed-right">
          <span className="order-summary-collapsed-amount">{pending ? <CalculatingDots /> : `₹${total.toFixed(2)}`}</span>
          <ChevronDown size={18} className={expanded ? 'rotated' : ''} />
        </span>
      </button>

      {expanded && (
        <div id="order-summary-expanded" className="order-summary-expanded">
          {itemsSlot}
          {savingsAmount > 0 && (
            <div className="order-summary-savings">
              <BadgePercent size={15} />
              <span>You're saving ₹{savingsAmount.toFixed(2)} on this order</span>
            </div>
          )}
          <div className="order-summary-breakdown">
            <div className="order-summary-row">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="order-summary-row order-summary-discount">
                <span>Discount {couponCode && `(${couponCode})`}</span>
                <span>−₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div className="order-summary-row">
                <span>GST ({gstPercent}%)</span>
                <span>₹{gstAmount.toFixed(2)}</span>
              </div>
            )}
            {shippingEnabled && (
              <div className="order-summary-row">
                <span>Shipping</span>
                <span className="order-summary-shipping">
                  {pending ? <CalculatingDots /> : shipping > 0 ? `₹${shipping.toFixed(2)}` : (<><Truck size={14} /> Free</>)}
                </span>
              </div>
            )}
            {codCharge > 0 && (
              <div className="order-summary-row">
                <span>COD Charge</span>
                <span>₹{codCharge.toFixed(2)}</span>
              </div>
            )}
            {prepaidDiscount > 0 && (
              <div className="order-summary-row order-summary-discount">
                <span>Prepaid Discount</span>
                <span>−₹{prepaidDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="order-summary-row order-summary-total">
              <span>Total</span>
              <span>{pending ? <CalculatingDots /> : `₹${total.toFixed(2)}`}</span>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
