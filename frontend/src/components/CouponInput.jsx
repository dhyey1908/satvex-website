import { useState } from 'react';
import { Loader2, Tag, ChevronDown, X } from 'lucide-react';
import './CouponInput.css';

/**
 * Collapsed "Have a coupon code?" row that expands to a code field + APPLY and
 * one-tap chips for the codes in `chips`. An applied coupon is shown as a
 * success pill with a remove (x) button. Shared by Cart and Checkout.
 *
 * Deliberately not a <form>: Checkout wraps it in its own <form>, and a nested
 * submit would also place the order. onApply(code) must throw on failure.
 */
export function CouponInput({ appliedCoupon, onApply, onClear, chips = [] }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(null); // the code being applied

  async function apply(value) {
    const next = String(value).trim().toUpperCase();
    if (!next || applying) return;
    setError(null);
    setApplying(next);
    try {
      await onApply(next);
      setCode('');
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(null);
    }
  }

  if (appliedCoupon) {
    return (
      <div className="coupon-pill" role="status">
        <Tag size={14} aria-hidden="true" />
        <span>
          <strong>{appliedCoupon.code}</strong> applied — saved ₹{appliedCoupon.discountAmount.toFixed(2)}
        </span>
        <button type="button" className="coupon-pill-remove" onClick={onClear} aria-label={`Remove coupon ${appliedCoupon.code}`}>
          <X size={16} />
        </button>
      </div>
    );
  }

  const ready = code.trim().length > 0;

  return (
    <div className="coupon-collapsible">
      <button
        type="button"
        className="coupon-toggle"
        aria-expanded={open}
        aria-controls="coupon-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span><Tag size={16} aria-hidden="true" /> Have a coupon code?</span>
        <ChevronDown size={18} className={open ? 'rotated' : ''} aria-hidden="true" />
      </button>

      {open && (
        <div id="coupon-panel" className="coupon-panel">
          <div className="coupon-row">
            <div className={`coupon-input-field input-shell ${error ? 'invalid' : ''}`}>
              <input
                type="text"
                aria-label="Coupon code"
                aria-invalid={Boolean(error)}
                placeholder="Enter coupon code"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    apply(code);
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary coupon-apply"
              onClick={() => apply(code)}
              disabled={!ready || Boolean(applying)}
            >
              {applying && applying === code.trim().toUpperCase() ? <Loader2 size={16} className="btn-spinner" /> : 'Apply'}
            </button>
          </div>

          {chips.length > 0 && (
            <div className="coupon-chips" role="group" aria-label="Available coupons">
              {chips.map((chip) => (
                <button key={chip} type="button" className="coupon-chip" onClick={() => apply(chip)} disabled={Boolean(applying)}>
                  {applying === chip ? <Loader2 size={14} className="btn-spinner" /> : <Tag size={14} aria-hidden="true" />} {chip}
                </button>
              ))}
            </div>
          )}

          {error && <p className="field-error coupon-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
