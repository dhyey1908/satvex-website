import { useState } from 'react';
import { Images } from 'lucide-react';
import { Modal } from './Modal';
import './ColourPreview.css';
import { SmartImage } from './SmartImage';

const primaryFirst = (images = []) => [...images].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));

// Phone-only. The gallery is far above the colour swatches, so picking a colour used
// to mean scrolling up to see it. This shows the photos of EVERY colour picked right here:
// a thumbnail strip, and a sheet with the full-size photos (grouped by colour) to scroll through.
export function ColourPreview({ variants = [], productName }) {
  const [open, setOpen] = useState(false);
  // Each picked colour once (a combo can repeat a colour), in the order it was picked; colours without photos have nothing to show.
  const groups = variants
    .filter((v, i) => v && variants.findIndex((x) => x?.id === v.id) === i)
    .map((v) => ({ variant: v, photos: primaryFirst(v.images) }))
    .filter((g) => g.photos.length > 0);
  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => sum + g.photos.length, 0);
  const names = groups.map((g) => g.variant.colorName).join(' + ');
  // One colour: its first photos. Several: the lead photo of each colour, so every pick is visible.
  const thumbs = groups.length === 1 ? groups[0].photos.slice(0, 3) : groups.map((g) => g.photos[0]).slice(0, 4);
  const title = `${names} photos`;

  return (
    <div className="colour-preview">
      <button type="button" className="colour-preview-open" onClick={() => setOpen(true)} aria-label={`View ${title}`}>
        <span className="colour-preview-thumbs">
          {thumbs.map((p) => (
            <SmartImage key={p.url} src={p.url} alt="" loading="lazy" decoding="async" />
          ))}
        </span>
        <span className="colour-preview-text">
          <strong>{names}</strong>
          <span>
            <Images size={13} aria-hidden="true" /> View {total} photo{total === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="colour-preview-sheet">
          {groups.map(({ variant, photos }) => (
            <section key={variant.id} className="colour-preview-group">
              {groups.length > 1 && <h4 className="colour-preview-group-title">{variant.colorName}</h4>}
              {photos.map((p) => (
                <SmartImage key={p.url} src={p.url} alt={p.alt || `SATVEX ${productName} – ${variant.colorName}`} loading="lazy" decoding="async" />
              ))}
            </section>
          ))}
        </div>
      </Modal>
    </div>
  );
}
