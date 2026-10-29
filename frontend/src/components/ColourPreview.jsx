import { useState } from 'react';
import { Images } from 'lucide-react';
import { Modal } from './Modal';
import './ColourPreview.css';

// Phone-only. The gallery is far above the colour swatches, so picking a colour used
// to mean scrolling up to see it. This shows the picked colour's photos right here:
// a thumbnail strip, and a sheet with the full-size photos to scroll through.
export function ColourPreview({ variant, productName }) {
  const [open, setOpen] = useState(false);
  const photos = [...(variant?.images || [])].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));
  if (photos.length === 0) return null;
  const title = `${variant.colorName} photos`;

  return (
    <div className="colour-preview">
      <button type="button" className="colour-preview-open" onClick={() => setOpen(true)} aria-label={`View ${title}`}>
        <span className="colour-preview-thumbs">
          {photos.slice(0, 3).map((p) => (
            <img key={p.url} src={p.url} alt="" loading="lazy" decoding="async" />
          ))}
        </span>
        <span className="colour-preview-text">
          <strong>{variant.colorName}</strong>
          <span>
            <Images size={13} aria-hidden="true" /> View {photos.length} photo{photos.length === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="colour-preview-sheet">
          {photos.map((p) => (
            <img key={p.url} src={p.url} alt={p.alt || `SATVEX ${productName} – ${variant.colorName}`} loading="lazy" decoding="async" />
          ))}
        </div>
      </Modal>
    </div>
  );
}
