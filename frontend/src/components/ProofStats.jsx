import { useEffect, useRef, useState } from 'react';
import { Feather, Sparkles, Heart, ShieldCheck, Leaf, Wind, Sun, Smile, Star, Zap } from 'lucide-react';
import { parseEmphasis } from '../utils/proofSection';
import './ProofStats.css';

// Older boxes may still carry an icon; new ones are a number or a word.
const ICONS = { feather: Feather, sparkles: Sparkles, heart: Heart, shield: ShieldCheck, leaf: Leaf, wind: Wind, sun: Sun, smile: Smile, star: Star, zap: Zap };
const COUNT_MS = 1400;

// "the *satvex* difference." -> plain words, *emphasised* words in <strong>.
export function Emphasis({ text }) {
  return parseEmphasis(text).map((part, i) => (part.em ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>));
}

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Counts from 0 to `value` once the box scrolls into view. Screen readers get the final value
// straight away (the moving digits are hidden from them).
function CountUp({ value, suffix, run }) {
  const target = Number(value);
  const decimals = (String(value).split('.')[1] || '').length;
  const [shown, setShown] = useState(run ? target : 0);

  useEffect(() => {
    if (!run) return undefined;
    if (reducedMotion()) {
      setShown(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      setShown(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, target]);

  return (
    <>
      <span className="visually-hidden">{`${value}${suffix}`}</span>
      <span aria-hidden="true">
        {shown.toFixed(decimals)}
        {suffix}
      </span>
    </>
  );
}

function Value({ stat, inView }) {
  if (stat.valueType === 'number') return <CountUp value={stat.value} suffix={stat.suffix} run={inView} />;
  if (stat.valueType === 'icon') {
    const Icon = ICONS[stat.value] || Sparkles;
    return <Icon size={30} strokeWidth={1.6} aria-hidden="true" />;
  }
  return stat.value;
}

/**
 * The "Proof Stats" block above the reviews: a title and stacked boxes of text + value, in one of
 * four colour themes. `section` is the shopper-facing shape the API returns
 * ({ header, theme, stats, footnote }). Sizes follow the width of the block itself (container
 * queries), so the admin's phone preview lays out exactly like a real phone.
 */
export function ProofStats({ section, preview = false }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (preview || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview]);

  if (!section || !section.stats?.length) return null;

  return (
    <section
      ref={ref}
      className={`proof-stats proof-theme-${section.theme || 'lavender'}`}
      aria-labelledby={section.header ? 'proof-stats-heading' : undefined}
      aria-label={section.header ? undefined : 'Why customers love it'}
    >
      <div className="proof-stats-inner">
        {section.header && (
          <h2 id="proof-stats-heading" className="proof-stats-header">
            <Emphasis text={section.header} />
          </h2>
        )}
        <ul className="proof-stats-list">
          {section.stats.map((stat) => (
            <li key={stat.id} className="proof-stat">
              <div className={`proof-stat-value is-${stat.valueType}`}>
                <Value stat={stat} inView={inView} />
              </div>
              {/* one wrapper: the <p> is a flex box, which would otherwise drop the spaces around bold words */}
              <p className="proof-stat-text">
                <span>
                  <Emphasis text={stat.statement} />
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
