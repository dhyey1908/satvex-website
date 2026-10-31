import { useState } from 'react';
import { GripVertical, Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import './PhotoGrid.css';
import { SmartImage } from './SmartImage';

/**
 * A grid of ~120px thumbnails for one list of photos (a colour's, or the common
 * ones). Reorder by dragging the handle (or the arrow buttons - keyboard friendly),
 * set the alt text, remove with a confirmation, and - when `primary` - star the
 * photo that represents the colour. Common photos can be moved to a colour.
 *
 * Controlled: `photos` is [{ url, alt, isPrimary }] and every change goes out
 * through onChange(nextPhotos). Nothing is saved until the page's own Save.
 */
export function PhotoGrid({ photos, onChange, primary = false, moveTargets = [], onMoveToColour, label = 'photo' }) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  if (photos.length === 0) return null;

  function reorder(from, to) {
    if (from === to || to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  async function remove(index) {
    const ok = await confirm({
      title: `Remove this ${label}?`,
      message: 'It disappears from this product when you save. The file itself stays in storage.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    const next = photos.filter((_, i) => i !== index);
    // Removing the primary hands the star to the first photo left.
    if (primary && photos[index].isPrimary && next.length > 0) next[0] = { ...next[0], isPrimary: true };
    onChange(next);
    showToast('Photo removed — save the product to apply.', 'success');
  }

  function setAlt(index, alt) {
    onChange(photos.map((p, i) => (i === index ? { ...p, alt } : p)));
  }

  function makePrimary(index) {
    onChange(photos.map((p, i) => ({ ...p, isPrimary: i === index })));
  }

  return (
    <ul className="photo-grid">
      {photos.map((p, i) => (
        <li
          key={p.url}
          className={`photo-card ${dragIndex === i ? 'is-dragging' : ''} ${overIndex === i && dragIndex !== null && dragIndex !== i ? 'is-over' : ''}`}
          draggable
          onDragStart={(e) => {
            setDragIndex(i);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) reorder(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
        >
          <div className="photo-thumb">
            <SmartImage src={p.url} alt={p.alt || ''} loading="lazy" draggable={false} />
            <span className="photo-handle" title="Drag to reorder" aria-hidden="true"><GripVertical size={16} /></span>
            {primary && (
              <button
                type="button"
                className={`photo-star ${p.isPrimary ? 'on' : ''}`}
                onClick={() => makePrimary(i)}
                aria-pressed={p.isPrimary}
                aria-label={p.isPrimary ? 'Primary photo' : 'Make this the primary photo'}
                title={p.isPrimary ? 'Primary photo' : 'Make primary'}
              >
                <Star size={16} fill={p.isPrimary ? 'currentColor' : 'none'} />
              </button>
            )}
            <button type="button" className="photo-remove" onClick={() => remove(i)} aria-label={`Remove ${label} ${i + 1}`}>
              <Trash2 size={14} />
            </button>
          </div>
          <div className="photo-order">
            <button type="button" onClick={() => reorder(i, i - 1)} disabled={i === 0} aria-label="Move earlier"><ChevronLeft size={14} /></button>
            <span>{i + 1}</span>
            <button type="button" onClick={() => reorder(i, i + 1)} disabled={i === photos.length - 1} aria-label="Move later"><ChevronRight size={14} /></button>
          </div>
          <input
            className="photo-alt"
            type="text"
            value={p.alt || ''}
            maxLength={160}
            placeholder="Alt text (optional)"
            aria-label={`Alt text for ${label} ${i + 1}`}
            onChange={(e) => setAlt(i, e.target.value)}
          />
          {moveTargets.length > 0 && onMoveToColour && (
            <select
              className="photo-move"
              value=""
              aria-label={`Move ${label} ${i + 1} to a colour`}
              onChange={(e) => e.target.value && onMoveToColour(i, e.target.value)}
            >
              <option value="">Move to colour…</option>
              {moveTargets.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          )}
        </li>
      ))}
    </ul>
  );
}
