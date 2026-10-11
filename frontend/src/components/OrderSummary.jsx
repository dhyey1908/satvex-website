import { Truck, BadgePercent } from 'lucide-react';
import './OrderSummary.css';

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
  itemsSlot,
  children,
}) {
  return (
    <div className="order-summary">
      <h3>Order Summary</h3>
      {itemsSlot}
      {savingsAmount > 0 && (
        <div className="order-summary-savings">
          <BadgePercent size={15} />
          <span>You're saving ₹{savingsAmount.toFixed(2)} on this order</span>
        </div>
      )}
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
            {shipping > 0 ? `₹${shipping.toFixed(2)}` : (<><Truck size={14} /> Free</>)}
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
        <span>₹{total.toFixed(2)}</span>
      </div>
      {children}
    </div>
  );
}
