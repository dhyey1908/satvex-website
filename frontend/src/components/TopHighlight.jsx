import { Waves, ShieldCheck, Sparkles, Clock, Feather, Heart, Leaf, Star, CheckCircle2, Droplet, Sun, Truck } from 'lucide-react';
import { parseEmphasis } from '../utils/proofSection';
import './TopHighlight.css';

const ICONS = { flex: Waves, shield: ShieldCheck, sparkle: Sparkles, clock: Clock, feather: Feather, heart: Heart, leaf: Leaf, star: Star, check: CheckCircle2, droplet: Droplet, sun: Sun, truck: Truck };

export function HighlightIcon({ name, size = 14 }) {
  const Icon = ICONS[name] || Sparkles;
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
}

/**
 * The short feature headline above a product's image gallery.
 * `highlight` is the shopper-facing shape the API returns
 * ({ eyebrow, headline, subline, chips, style }). *Asterisk* words in the headline render
 * in the brand purple, italic. Chips scroll sideways on phones instead of wrapping.
 */
export function TopHighlight({ highlight }) {
  if (!highlight?.headline) return null;
  return (
    <section className={`top-highlight ${highlight.style === 'lavender' ? 'is-band' : ''}`} aria-label="Product highlight">
      {highlight.eyebrow && <p className="top-highlight-eyebrow">{highlight.eyebrow}</p>}
      <h2 className="top-highlight-headline">
        {parseEmphasis(highlight.headline).map((part, i) => (part.em ? <em key={i}>{part.text}</em> : <span key={i}>{part.text}</span>))}
      </h2>
      {highlight.subline && <p className="top-highlight-subline">{highlight.subline}</p>}
      {highlight.chips?.length > 0 && (
        <ul className="top-highlight-chips">
          {highlight.chips.map((chip) => (
            <li key={chip.id} className="top-highlight-chip">
              <HighlightIcon name={chip.icon} /> {chip.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
