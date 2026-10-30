import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, GripVertical, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Switch } from './admin/Switch';
import { TopHighlight, HighlightIcon } from './TopHighlight';
import { HIGHLIGHT_ICONS, HIGHLIGHT_LIMITS, HIGHLIGHT_STYLES, MAX_CHIPS, previewHighlight } from '../utils/topHighlight';
import './ProofSectionEditor.css';

let localCounter = 0;
const newChipId = () => `chip_local_${Date.now()}_${localCounter++}`;

/**
 * Admin card "Top Highlight (above gallery)": the short headline strip shown between the
 * breadcrumb and the product photos. `value` / `onChange` are the product form's own state - it
 * saves with the product's Save button. `errors` comes from checkTopHighlight().
 */
export function TopHighlightEditor({ value, onChange, errors = {} }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState('mobile');
  const [dragFrom, setDragFrom] = useState(null);

  const chips = value.chips || [];
  const set = (patch) => onChange({ ...value, ...patch });
  const patchChip = (index, patch) => set({ chips: chips.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  function moveChip(from, to) {
    if (from === to || to < 0 || to >= chips.length) return;
    const next = [...chips];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ chips: next });
  }
  const shown = previewHighlight(value);

  return (
    <div className="admin-form-section pse">
      <div className="pse-head">
        <h3>Top Highlight (above gallery)</h3>
        <Switch checked={Boolean(value.enabled)} onChange={(on) => set({ enabled: on })} label="Show on the product page" />
      </div>
      <p className="field-hint">
        A short headline strip on the product page, between the breadcrumb and the <strong>photos</strong>. Off by default.
        (The percentage boxes above the Reviews are a different card: Proof Stats.)
      </p>

      <div className="pse-source-grid">
        <div className="field">
          <label htmlFor="th-eyebrow">Eyebrow (optional)</label>
          <input id="th-eyebrow" maxLength={HIGHLIGHT_LIMITS.eyebrow} value={value.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} placeholder="THE SATVEX BUTTERFLY" />
          <p className="field-hint">{(value.eyebrow || '').length}/{HIGHLIGHT_LIMITS.eyebrow}</p>
          {errors.eyebrow && <p className="field-error" role="alert">{errors.eyebrow}</p>}
        </div>
        <div className="field">
          <label htmlFor="th-style">Style</label>
          <select id="th-style" value={value.style || 'plain'} onChange={(e) => set({ style: e.target.value })}>
            {HIGHLIGHT_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="th-headline">Headline {value.enabled && <b aria-hidden="true" style={{ color: 'var(--color-error)' }}>*</b>}</label>
        <input id="th-headline" maxLength={HIGHLIGHT_LIMITS.headline} value={value.headline || ''} onChange={(e) => set({ headline: e.target.value })} placeholder="Bends, *won't break*." />
        <p className="field-hint">Put *asterisks* around words to show them in purple italics. {(value.headline || '').length}/{HIGHLIGHT_LIMITS.headline}</p>
        {errors.headline && <p className="field-error" role="alert">{errors.headline}</p>}
      </div>

      <div className="field">
        <label htmlFor="th-subline">Subline (optional)</label>
        <input id="th-subline" maxLength={HIGHLIGHT_LIMITS.subline} value={value.subline || ''} onChange={(e) => set({ subline: e.target.value })} placeholder="A claw clip that flexes with your hair instead of snapping." />
        <p className="field-hint">{(value.subline || '').length}/{HIGHLIGHT_LIMITS.subline}</p>
        {errors.subline && <p className="field-error" role="alert">{errors.subline}</p>}
      </div>

      <div className="pse-stats-head">
        <span className="pse-label">Feature chips ({chips.length}/{MAX_CHIPS})</span>
      </div>
      <ul className="pse-stats">
        {chips.map((chip, i) => (
          <li
            key={chip.id || i}
            className={`pse-stat pse-chip ${dragFrom === i ? 'is-dragging' : ''}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => dragFrom !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) moveChip(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
          >
            <div className="pse-stat-bar">
              <GripVertical size={16} aria-hidden="true" className="pse-grip" />
              <strong>Chip {i + 1}</strong>
              <span className="pse-spacer" />
              <button type="button" className="ui-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveChip(i, i - 1)}><ArrowUp size={15} /></button>
              <button type="button" className="ui-icon-btn" aria-label="Move down" disabled={i === chips.length - 1} onClick={() => moveChip(i, i + 1)}><ArrowDown size={15} /></button>
              <button type="button" className="ui-icon-btn" aria-label={`Remove chip ${i + 1}`} onClick={() => set({ chips: chips.filter((_, n) => n !== i) })}><Trash2 size={15} /></button>
            </div>
            <div className="field">
              <span className="pse-label">Icon</span>
              <div className="th-icons" role="radiogroup" aria-label={`Icon for chip ${i + 1}`}>
                {HIGHLIGHT_ICONS.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    role="radio"
                    aria-checked={chip.icon === icon.id}
                    aria-label={icon.label}
                    title={icon.label}
                    className={`th-icon ${chip.icon === icon.id ? 'is-on' : ''}`}
                    onClick={() => patchChip(i, { icon: icon.id })}
                  >
                    <HighlightIcon name={icon.id} size={16} />
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor={`th-chip-${i}`}>Label</label>
              <input id={`th-chip-${i}`} maxLength={HIGHLIGHT_LIMITS.chip} value={chip.label} placeholder="Flexible" onChange={(e) => patchChip(i, { label: e.target.value })} />
              <p className="field-hint pse-counter">{chip.label.length}/{HIGHLIGHT_LIMITS.chip}</p>
            </div>
            {errors.chipRows?.[i] && <p className="field-error" role="alert">{errors.chipRows[i]}</p>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" disabled={chips.length >= MAX_CHIPS} onClick={() => set({ chips: [...chips, { id: newChipId(), icon: 'flex', label: '' }] })}>
        <Plus size={14} /> Add a chip
      </button>

      <div>
        <button type="button" className="btn btn-outline" onClick={() => setPreviewOpen(true)} disabled={!shown.headline}>
          <Eye size={16} /> Preview
        </button>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Top Highlight preview">
        <div className="pse-preview-tabs" role="group" aria-label="Preview size">
          <button type="button" className={`btn btn-sm ${previewMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>
            <Monitor size={14} /> Desktop
          </button>
          <button type="button" className={`btn btn-sm ${previewMode === 'mobile' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>
            <Smartphone size={14} /> Mobile
          </button>
        </div>
        <div className={`pse-preview-frame th-preview is-${previewMode}`}>
          <TopHighlight highlight={shown} />
        </div>
        {!value.enabled && <p className="field-hint">The highlight is switched off, so shoppers don't see it yet.</p>}
      </Modal>
    </div>
  );
}
