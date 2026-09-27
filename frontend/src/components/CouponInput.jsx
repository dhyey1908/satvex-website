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
        <motion.form
          key="form"
          className="coupon-input"
          onSubmit={handleApply}
          initial={fade.initial}
          animate={fade.animate}
          exit={fade.exit}
        >
          <div className="coupon-input-field">
            <Tag size={14} />
            <input
              type="text"
              placeholder="Enter coupon code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <button type="submit" className="btn btn-outline btn-sm" disabled={submitting || !code.trim()}>
            {submitting ? <Loader2 size={14} className="btn-spinner" /> : 'Apply'}
          </button>
          {error && <p className="field-error coupon-error">{error}</p>}
        </motion.form>
      )}
    </AnimatePresence>
  );
}
