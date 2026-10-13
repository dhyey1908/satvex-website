import { motion } from 'framer-motion';
import './OrderTimeline.css';

const STEPS = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered'];
const STEP_DELAY = 0.15;

export function OrderTimeline({ status }) {
  if (status === 'Cancelled') {
    return (
      <div className="order-timeline order-timeline-cancelled">
        <span className="order-timeline-dot" />
        <span>This order was cancelled.</span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);

  return (
    <div className="order-timeline-wrap">
      <div className="order-timeline">
        {STEPS.map((step, i) => {
          const done = i <= currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step} className={`order-timeline-step ${done ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
              <motion.span
                className="order-timeline-dot"
                initial={false}
                animate={done ? { scale: [0.6, 1.25, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, delay: done ? i * STEP_DELAY : 0, ease: [0.16, 1, 0.3, 1] }}
              />
              <span className="order-timeline-label">{step}</span>
              {i < STEPS.length - 1 && <span className="order-timeline-line" />}
            </div>
          );
        })}
      </div>
      {/* Below ~420px, five full-word labels in one row can't all fit
          without wrapping mid-word and visually colliding — the dots and
          connecting lines stay fully visible (CSS only hides the per-step
          text there), and this single readable line takes over as the
          "which stage am I on" answer instead. Hidden above that width,
          where the per-step labels already say the same thing. */}
      <p className="order-timeline-current-label">
        Current status: <strong>{status}</strong>
      </p>
    </div>
  );
}
