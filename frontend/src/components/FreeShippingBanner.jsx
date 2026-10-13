import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Truck } from 'lucide-react';
import { CouponCelebration } from './CouponCelebration';
import { EASE, DURATION } from '../motion';
import './FreeShippingBanner.css';

// Shared between Cart and Checkout — always driven by the backend's quote
// response (amountToFreeShipping/qualifiesForFreeShipping/
// freeShippingProgressPercent), never computed here — see
// src/checks/noClientSidePriceMath.test.js, which enforces that this file
// does zero arithmetic on its own props. Renders nothing until a quote has
// loaded, and nothing at all if the store has no free-shipping threshold
// configured (freeThreshold <= 0).
export function FreeShippingBanner({ quote }) {
  const qualifies = Boolean(quote?.qualifiesForFreeShipping);
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  // null = no quote observed yet. Distinguishing "never seen" from "seen,
  // didn't qualify" means a cart that's ALREADY above the threshold the
  // first time a quote loads doesn't retroactively fire the celebration —
  // only a genuine not-qualified -> qualified transition watched live
  // (e.g. raising quantity past the threshold) does.
  const prevQualifiesRef = useRef(null);

  useEffect(() => {
    if (!quote) return;
    if (prevQualifiesRef.current === null) {
      prevQualifiesRef.current = qualifies;
      return;
    }
    if (qualifies && !prevQualifiesRef.current) {
      setCelebrationTrigger((n) => n + 1);
    }
    prevQualifiesRef.current = qualifies;
  }, [quote, qualifies]);

  if (!quote || !quote.freeShippingThreshold) return null;

  return (
    <>
      <div className={`free-shipping-banner ${qualifies ? 'qualifies' : ''}`}>
        <div className="free-shipping-banner-message">
          {qualifies ? <CheckCircle2 size={18} /> : <Truck size={18} />}
          <span>
            {qualifies
              ? "🎉 Congratulations! You've unlocked FREE shipping!"
              : `Add ₹${quote.amountToFreeShipping.toFixed(2)} more for free shipping.`}
          </span>
        </div>
        <div className="free-shipping-progress-track">
          <div className="free-shipping-progress-fill-wrap">
            <motion.div
              className="free-shipping-progress-fill"
              initial={false}
              animate={{ width: `${quote.freeShippingProgressPercent}%` }}
              transition={{ duration: DURATION.slow, ease: EASE }}
            />
          </div>
          <motion.div
            className="free-shipping-progress-truck"
            initial={false}
            animate={{ left: `${quote.freeShippingProgressPercent}%` }}
            transition={{ duration: DURATION.slow, ease: EASE }}
          >
            <Truck size={12} />
          </motion.div>
        </div>
      </div>
      <CouponCelebration trigger={celebrationTrigger} message="🎉 You've unlocked FREE shipping!" />
    </>
  );
}
