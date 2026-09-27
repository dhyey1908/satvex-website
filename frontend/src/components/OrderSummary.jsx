import './OrderSummary.css';

export function OrderSummary({ subtotal, discountAmount = 0, couponCode, shipping = 0, total, itemsSlot, children }) {
  return (
    <div className="order-summary">
      <h3>Order Summary</h3>
      {itemsSlot}
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
      <div className="order-summary-row">
        <span>Shipping</span>
        <span>{shipping > 0 ? `₹${shipping.toFixed(2)}` : 'Free'}</span>
      </div>
      <div className="order-summary-row order-summary-total">
        <span>Total</span>
        <span>₹{total.toFixed(2)}</span>
      </div>
      {children}
    </div>
  );
}
