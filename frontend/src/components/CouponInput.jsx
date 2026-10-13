import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Tag } from 'lucide-react';
import { fade } from '../motion';
import './CouponInput.css';

export function CouponInput({ appliedCoupon, onApply, onClear }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleApply(e) {
    // Called from a plain button click and from Enter-in-the-input, never
    // from an actual form submit — this must never be a real <form> (see
    // below), since it's used inside Checkout's own single outer <form>,
    // and a nested <form>'s submit event would bubble up and also trigger
    // the outer form's onSubmit (order placement).
    e?.preventDefault?.();
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

  return (
    <AnimatePresence mode="wait">
      {appliedCoupon ? (
        <motion.div
          key="applied"
          className="coupon-input coupon-applied"
          initial={fade.initial}
          animate={fade.animate}
          exit={fade.exit}
        >
          <span>
            <Tag size={14} /> Coupon <strong>{appliedCoupon.code}</strong> applied — saved ₹{appliedCoupon.discountAmount.toFixed(2)}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
            Remove
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="form"
          className="coupon-input"
          initial={fade.initial}
          animate={fade.animate}
          exit={fade.exit}
        >
          <div className={`coupon-input-field input-shell ${error ? 'invalid' : ''}`}>
            <Tag size={14} />
            <input
              type="text"
              aria-invalid={Boolean(error)}
              placeholder="Enter coupon code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApply(e);
              }}
            />
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={handleApply} disabled={submitting || !code.trim()}>
            {submitting ? <Loader2 size={14} className="btn-spinner" /> : 'Apply'}
          </button>
          {error && <p className="field-error coupon-error">{error}</p>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
