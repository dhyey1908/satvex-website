import { useState } from 'react';
import './CouponInput.css';

export function CouponInput({ appliedCoupon, onApply, onClear }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleApply(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onApply(code.trim());
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (appliedCoupon) {
    return (
      <div className="coupon-input coupon-applied">
        <span>
          Coupon <strong>{appliedCoupon.code}</strong> applied — saved ₹{appliedCoupon.discountAmount.toFixed(2)}
        </span>
        <button type="button" className="btn-ghost btn-sm" onClick={onClear}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <form className="coupon-input" onSubmit={handleApply}>
      <input
        type="text"
        placeholder="Enter coupon code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <button type="submit" className="btn btn-outline btn-sm" disabled={submitting || !code.trim()}>
        {submitting ? 'Applying…' : 'Apply'}
      </button>
      {error && <p className="field-error coupon-error">{error}</p>}
    </form>
  );
}
