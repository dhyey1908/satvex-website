import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart, Flower2, Star } from 'lucide-react';
import './OrderCelebration.css';

// Bigger and a touch longer than the coupon celebration (CouponCelebration)
// — a confirmed order is the biggest moment in the whole flow, and this
// page isn't time-pressured the way checkout is, so it can hold a second
// longer. Hearts + flowers alongside stars/confetti, rather than plain
// confetti, to read as SATVEX's own premium, feminine accessory brand
// rather than a generic "success!" burst.
const PARTICLE_COUNT = 42;
const COLORS = ['var(--color-accent)', 'var(--color-accent-gold)', 'var(--color-accent-light)', '#ffffff'];
const VISIBLE_MS = 2800;
const ICONS = { heart: Heart, flower: Flower2, star: Star };
const ICON_KEYS = Object.keys(ICONS);

function buildParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const burst = 90 + Math.random() * 200;
    const roll = Math.random();
    const shape = roll < 0.45 ? 'confetti' : roll < 0.68 ? 'sparkle' : 'icon';
    return {
      id: i,
      shape,
      icon: ICON_KEYS[i % ICON_KEYS.length],
      burstX: Math.cos(angle) * burst,
      burstY: Math.sin(angle) * burst * 0.55 - 40,
      fallY: 230 + Math.random() * 300,
      drift: (Math.random() - 0.5) * 70,
      rotateFrom: Math.random() * 360,
      rotateTo: Math.random() * 900 - 450,
      duration: 1.7 + Math.random() * 0.8,
      delay: Math.random() * 0.22,
      size: shape === 'confetti' ? 6 + Math.random() * 6 : shape === 'icon' ? 12 + Math.random() * 6 : 4 + Math.random() * 4,
      color: COLORS[i % COLORS.length],
    };
  });
}

// Full-screen, short-lived burst shown once a real order confirmation is
// reached (see OrderConfirmation.jsx — never for an awaiting/failed/
// expired payment state, only the final confirmed success view). `trigger`
// is a counter the caller increments exactly once per confirmed order; 0
// (the initial value) never shows anything.
export function OrderCelebration({ trigger }) {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const particles = useMemo(buildParticles, [trigger]);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (prefersReducedMotion) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="order-celebration"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="order-celebration-burst">
            {particles.map((p) => {
              const Icon = ICONS[p.icon];
              return (
                <motion.span
                  key={p.id}
                  className={`order-celebration-particle shape-${p.shape}`}
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
                    times: [0, 0.3, 1],
                    ease: ['easeOut', 'easeIn'],
                  }}
                >
                  {p.shape === 'icon' && <Icon size={p.size} fill="currentColor" strokeWidth={1} />}
                </motion.span>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
