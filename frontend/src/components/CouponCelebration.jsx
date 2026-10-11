import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import './CouponCelebration.css';

const PARTICLE_COUNT = 22;
const COLORS = ['var(--color-accent)', 'var(--color-accent-gold)', 'var(--color-accent-light)', '#ffffff'];
const VISIBLE_MS = 1800;

function buildParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.1 + Math.random() * 0.7,
    drift: (Math.random() - 0.5) * 60,
    rotate: (Math.random() - 0.5) * 540,
    size: i % 3 === 0 ? 5 + Math.random() * 4 : 7 + Math.random() * 6,
    color: COLORS[i % COLORS.length],
    sparkle: i % 3 === 0,
  }));
}

// Full-screen, short-lived celebration shown only after the backend confirms
// a coupon actually applied (see Checkout.jsx) — never for an invalid code,
// a repeated click, or a failed request. `trigger` is a counter the caller
// increments on each successful apply; 0 (the initial value) never shows
// anything.
export function CouponCelebration({ trigger, message = 'You unlocked an exclusive offer!' }) {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const particles = useMemo(buildParticles, [trigger]);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="coupon-celebration"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {!prefersReducedMotion &&
            particles.map((p) => (
              <motion.span
                key={p.id}
                className={`coupon-celebration-particle ${p.sparkle ? 'is-sparkle' : ''}`}
                style={{
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  color: p.color,
                }}
                initial={{ y: '-10vh', x: 0, opacity: 0, rotate: 0 }}
                animate={{ y: '100vh', x: p.drift, opacity: [0, 1, 1, 0], rotate: p.rotate }}
                transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
              />
            ))}

          <motion.div
            className="coupon-celebration-message"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Sparkles size={16} className="coupon-celebration-icon" />
            <span>{message}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
