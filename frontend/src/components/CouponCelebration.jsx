import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Sparkles, Star, Sparkle } from 'lucide-react';
import './CouponCelebration.css';

const PARTICLE_COUNT = 30;
const COLORS = ['var(--color-accent)', 'var(--color-accent-gold)', 'var(--color-accent-light)', '#ffffff'];
const VISIBLE_MS = 2200;
const ICONS = { star: Star, sparkle: Sparkle };

// A burst from center (not a straight top-down rain) reads as a genuine
// "pop" — particles fly outward at a random angle, arc slightly, then fall
// with gravity, same shape real confetti cannons use.
function buildParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const burst = 70 + Math.random() * 160;
    const roll = Math.random();
    const shape = roll < 0.55 ? 'confetti' : roll < 0.8 ? 'sparkle' : 'icon';
    return {
      id: i,
      shape,
      icon: Math.random() < 0.5 ? 'star' : 'sparkle',
      burstX: Math.cos(angle) * burst,
      burstY: Math.sin(angle) * burst * 0.55 - 30,
      fallY: 200 + Math.random() * 260,
      drift: (Math.random() - 0.5) * 60,
      rotateFrom: Math.random() * 360,
      rotateTo: Math.random() * 900 - 450,
      duration: 1.5 + Math.random() * 0.7,
      delay: Math.random() * 0.18,
      size: shape === 'confetti' ? 6 + Math.random() * 5 : shape === 'icon' ? 10 + Math.random() * 5 : 4 + Math.random() * 4,
      color: COLORS[i % COLORS.length],
    };
  });
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
          {!prefersReducedMotion && (
            <div className="coupon-celebration-burst">
              {particles.map((p) => {
                const Icon = ICONS[p.icon];
                return (
                  <motion.span
                    key={p.id}
                    className={`coupon-celebration-particle shape-${p.shape}`}
                    style={{
                      width: p.size,
                      height: p.shape === 'confetti' ? p.size * 0.5 : p.size,
                      background: p.shape === 'confetti' ? p.color : undefined,
                      color: p.color,
                    }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: p.rotateFrom }}
                    animate={{
                      x: [0, p.burstX, p.burstX + p.drift],
                      y: [0, p.burstY, p.burstY + p.fallY],
                      opacity: [0, 1, 1, 0],
                      scale: [0.3, 1, 0.85],
                      rotate: p.rotateTo,
                    }}
                    transition={{
                      duration: p.duration,
                      delay: p.delay,
                      times: [0, 0.32, 1],
                      ease: ['easeOut', 'easeIn'],
                    }}
                  >
                    {p.shape === 'icon' && <Icon size={p.size} fill="currentColor" strokeWidth={1} />}
                  </motion.span>
                );
              })}
            </div>
          )}

          <motion.div
            className="coupon-celebration-message"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.6, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={prefersReducedMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 360, damping: 18 }}
          >
            {!prefersReducedMotion && (
              <motion.span
                className="coupon-celebration-glow"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.6, 0], scale: [0.6, 1.4, 1.8] }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              />
            )}
            <motion.span
              className="coupon-celebration-icon"
              animate={prefersReducedMotion ? undefined : { rotate: [0, -12, 12, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.9, delay: 0.15, ease: 'easeInOut' }}
            >
              <Sparkles size={16} />
            </motion.span>
            <span>{message}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
