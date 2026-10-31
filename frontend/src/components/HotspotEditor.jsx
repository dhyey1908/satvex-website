import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Monitor, Plus, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import { UploadZone } from './UploadZone';
import { Switch } from './admin/Switch';
import { FeatureHotspots } from './FeatureHotspots';
import { Emphasis } from './ProofStats';
import {
  DEFAULT_ASPECT,
  LABEL_POSITIONS,
  LIMITS,
  MAX_HOTSPOTS,
  PLACEMENTS,
  STARTER_HOTSPOTS,
  loadImageAspect,
  percentFromPoint,
  previewHotspotSection,
} from '../utils/hotspots';
import './ProofSectionEditor.css';
import './HotspotEditor.css';

let localCounter = 0;
const newId = () => `hs_local_${Date.now()}_${localCounter++}`;
const isPlaced = (h) => h.pointX !== null && h.pointX !== undefined && h.pointX !== '' && h.pointY !== null && h.pointY !== undefined && h.pointY !== '';

/**
 * Admin card "Feature Hotspots": a visual editor for the product page's annotated photo.
 * Click the photo to place a marker, drag markers to adjust (arrow keys nudge a focused one),
 * edit the selected feature in the side panel, reorder the list, and check the result in the live
 * preview. `value` / `onChange` are the product form's own state - it saves with the product's
 * Save button. `errors` comes from checkHotspotSection().
 */
export function HotspotEditor({ value, onChange, errors = {} }) {
  const [selectedId, setSelectedId] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [dragFrom, setDragFrom] = useState(null);
  const canvasRef = useRef(null);
  const dragging = useRef(null);

  const spots = value.hotspots || [];
  const selectedIndex = spots.findIndex((h, i) => (h.id || i) === selectedId);
  const selected = selectedIndex >= 0 ? spots[selectedIndex] : null;
  const set = (patch) => onChange({ ...value, ...patch });
  const patchSpot = (index, patch) => set({ hotspots: spots.map((h, i) => (i === index ? { ...h, ...patch } : h)) });
  const idOf = (h, i) => h.id || i;

  // the photo shown in the editor is the selected feature's own photo when it has one
  const canvasSrc = selected?.imageUrl || value.imageUrl;
  const canvasAspect = (selected?.imageUrl ? selected.imageAspect : value.imageAspect) || DEFAULT_ASPECT;

  function place(e) {
    if (!canvasSrc || dragging.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { x, y } = percentFromPoint(e.clientX, e.clientY, rect);
    // a selected feature that is not on the photo yet gets this click; otherwise it adds a new one
    if (selected && !isPlaced(selected)) {
      patchSpot(selectedIndex, { pointX: x, pointY: y });
      return;
    }
    if (spots.length >= MAX_HOTSPOTS) return;
    const id = newId();
    set({ hotspots: [...spots, { id, pointX: x, pointY: y, labelPosition: 'auto', title: '', description: '', imageUrl: '', active: true }] });
    setSelectedId(id);
  }

  function startDrag(e, index) {
    e.stopPropagation();
    setSelectedId(idOf(spots[index], index));
    dragging.current = { index, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function moveDrag(e) {
    const d = dragging.current;
    if (!d) return;
    d.moved = true;
    const { x, y } = percentFromPoint(e.clientX, e.clientY, canvasRef.current.getBoundingClientRect());
    patchSpot(d.index, { pointX: x, pointY: y });
  }
  function endDrag(e) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // the click that follows a drag must not place a new marker
    window.setTimeout(() => { dragging.current = null; }, 0);
  }
  function nudge(e, index) {
    const step = e.shiftKey ? 5 : 1;
    const h = spots[index];
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta || !isPlaced(h)) return;
    e.preventDefault();
    const clamp = (n) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));
    patchSpot(index, { pointX: clamp(Number(h.pointX) + delta[0]), pointY: clamp(Number(h.pointY) + delta[1]) });
  }

  function moveSpot(from, to) {
    if (from === to || to < 0 || to >= spots.length) return;
    const next = [...spots];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ hotspots: next });
  }
  function removeSpot(index) {
    set({ hotspots: spots.filter((_, i) => i !== index) });
    setSelectedId(null);
  }
  function useStarter() {
    set({ title: value.title || 'every detail, *thought through*.', hotspots: STARTER_HOTSPOTS.map((h) => ({ ...h, id: newId() })) });
    setSelectedId(null);
  }

  async function mainUploaded(url) {
    const imageAspect = await loadImageAspect(url);
    set({ imageUrl: url, imageAspect });
  }
  async function ownUploaded(url) {
    const imageAspect = await loadImageAspect(url);
    patchSpot(selectedIndex, { imageUrl: url, imageAspect });
  }

  const preview = previewHotspotSection(value);

  return (
    <div className="admin-form-section hse">
      <div className="pse-head">
        <h3>Feature Hotspots</h3>
        <Switch checked={Boolean(value.enabled)} onChange={(on) => set({ enabled: on })} label="Show on the product page" />
      </div>
      <p className="field-hint">
        One big photo of the product with up to {MAX_HOTSPOTS} numbered feature points; shoppers step through them with arrows or swipes. Off by default. It appears on the product page between the product info and the Proof Stats (you can move it to just before the reviews).
      </p>

      <div className="field">
        <label htmlFor="hse-title">Section title (optional)</label>
        <input id="hse-title" maxLength={LIMITS.sectionTitle} value={value.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="every detail, *thought through*." />
        <p className="field-hint">Put *asterisks* around words to emphasise them. {(value.title || '').length}/{LIMITS.sectionTitle}</p>
        {value.title && <p className="pse-header-preview" aria-label="Title preview"><Emphasis text={value.title} /></p>}
      </div>

      <div className="field">
        <span className="pse-label">Main photo</span>
        <p className="field-hint">Use a clear PNG with a transparent or white background, at least 1600px wide.</p>
        {value.imageUrl ? (
          <div className="hse-main-chosen">
            <img src={value.imageUrl} alt="" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ imageUrl: '', imageAspect: null })}>
              <Trash2 size={14} /> Remove photo
            </button>
          </div>
        ) : (
          <UploadZone folder="products" multiple={false} maxFiles={1} label="Drop the main photo here or click to upload" hint="PNG (transparent) or JPG · at least 1600px wide" onUploaded={mainUploaded} />
        )}
        {errors.image && <p className="field-error" role="alert">{errors.image}</p>}
      </div>

      {value.imageUrl && (
        <div className="hse-editor">
          <div className="hse-canvas-col">
            <span className="pse-label">Click the photo to place a feature · drag a marker to adjust it</span>
            <div className="hse-canvas" ref={canvasRef} style={{ aspectRatio: canvasAspect }} onClick={place} role="application" aria-label="Photo editor: click to place a feature marker">
              <img src={canvasSrc} alt="" draggable={false} />
              {spots.map((h, i) =>
                isPlaced(h) ? (
                  <button
                    key={idOf(h, i)}
                    type="button"
                    className={`hse-marker ${idOf(h, i) === selectedId ? 'is-selected' : ''} ${h.active === false ? 'is-off' : ''}`}
                    style={{ left: `${h.pointX}%`, top: `${h.pointY}%` }}
                    onPointerDown={(e) => startDrag(e, i)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => nudge(e, i)}
                    aria-label={`Feature ${i + 1}: ${h.title || 'untitled'} (arrow keys move it)`}
                  >
                    {i + 1}
                  </button>
                ) : null
              )}
            </div>
            {spots.length >= MAX_HOTSPOTS && <p className="field-hint">That is the maximum of {MAX_HOTSPOTS} features.</p>}
          </div>

          <div className="hse-panel">
            {selected ? (
              <>
                <div className="hse-panel-head">
                  <strong>Feature {selectedIndex + 1}</strong>
                  <Switch checked={selected.active !== false} onChange={(on) => patchSpot(selectedIndex, { active: on })} label="Active" />
                  <button type="button" className="ui-icon-btn" aria-label={`Delete feature ${selectedIndex + 1}`} onClick={() => removeSpot(selectedIndex)}><Trash2 size={15} /></button>
                </div>
                {!isPlaced(selected) && <p className="field-hint hse-unplaced">Not on the photo yet: click the photo to place it.</p>}
                <div className="field">
                  <label htmlFor="hse-f-title">Title</label>
                  <input id="hse-f-title" maxLength={LIMITS.title} value={selected.title} onChange={(e) => patchSpot(selectedIndex, { title: e.target.value })} placeholder="flexible body" />
                  <p className="field-hint pse-counter">{selected.title.length}/{LIMITS.title}</p>
                </div>
                <div className="field">
                  <label htmlFor="hse-f-desc">Description</label>
                  <textarea id="hse-f-desc" rows={3} maxLength={LIMITS.description} value={selected.description} onChange={(e) => patchSpot(selectedIndex, { description: e.target.value })} placeholder="bends and bounces back instead of snapping." />
                  <p className="field-hint pse-counter">{selected.description.length}/{LIMITS.description}</p>
                </div>
                <div className="field">
                  <span className="pse-label">Label position</span>
                  <div className="hse-positions" role="radiogroup" aria-label="Where the text sits">
                    {LABEL_POSITIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={(selected.labelPosition || 'auto') === p.id}
                        className={`hse-position ${(selected.labelPosition || 'auto') === p.id ? 'is-on' : ''}`}
                        onClick={() => patchSpot(selectedIndex, { labelPosition: p.id })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">
                    {(selected.labelPosition || 'auto') === 'auto'
                      ? 'The text goes in the space beside the photo on the side nearest this marker, level with it. The preview below shows exactly where it lands.'
                      : 'You pinned this one. Choose Auto to let the page pick the side nearest the marker.'}
                  </p>
                </div>
                <div className="field">
                  <span className="pse-label">Own photo (optional)</span>
                  {selected.imageUrl ? (
                    <div className="hse-main-chosen">
                      <img src={selected.imageUrl} alt="" />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchSpot(selectedIndex, { imageUrl: '', imageAspect: null })}><Trash2 size={14} /> Use the main photo</button>
                    </div>
                  ) : (
                    <UploadZone folder="products" multiple={false} maxFiles={1} label="Use a different photo for this feature" hint="Optional · else the main photo is used" onUploaded={ownUploaded} />
                  )}
                </div>
                {errors.rows?.[selectedIndex] && <p className="field-error" role="alert">{errors.rows[selectedIndex]}</p>}
              </>
            ) : (
              <p className="field-hint">Click a marker or a feature in the list to edit it.</p>
            )}
          </div>
        </div>
      )}

      <div className="pse-stats-head">
        <span className="pse-label">Features, in slide order ({spots.length}/{MAX_HOTSPOTS})</span>
        {spots.length === 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={useStarter}>
            <Sparkles size={14} /> Use the SATVEX starter features
          </button>
        )}
      </div>
      {errors.hotspots && <p className="field-error" role="alert">{errors.hotspots}</p>}
      {errors.rows?.some(Boolean) && (
        <ul className="hse-errors" role="alert">
          {errors.rows.map((msg, i) => (msg ? <li key={idOf(spots[i], i)}>Feature {i + 1}{spots[i].title ? ` (${spots[i].title})` : ''}: {msg}</li> : null))}
        </ul>
      )}
      <ul className="pse-stats hse-list">
        {spots.map((h, i) => (
          <li
            key={idOf(h, i)}
            className={`pse-stat hse-item ${idOf(h, i) === selectedId ? 'is-selected' : ''} ${dragFrom === i ? 'is-dragging' : ''} ${h.active === false ? 'is-off' : ''}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => dragFrom !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) moveSpot(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
          >
            <GripVertical size={16} aria-hidden="true" className="pse-grip" />
            <button type="button" className="hse-item-main" onClick={() => setSelectedId(idOf(h, i))}>
              <span className="hse-item-n">{i + 1}</span>
              <span className="hse-item-title">{h.title || 'Untitled feature'}</span>
              {!isPlaced(h) && <em className="hse-badge">not placed</em>}
              {h.active === false && <em className="hse-badge">off</em>}
            </button>
            <button type="button" className="ui-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveSpot(i, i - 1)}><ArrowUp size={15} /></button>
            <button type="button" className="ui-icon-btn" aria-label="Move down" disabled={i === spots.length - 1} onClick={() => moveSpot(i, i + 1)}><ArrowDown size={15} /></button>
            <button type="button" className="ui-icon-btn" aria-label={`Delete feature ${i + 1}`} onClick={() => removeSpot(i)}><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={spots.length >= MAX_HOTSPOTS}
        onClick={() => {
          const id = newId();
          set({ hotspots: [...spots, { id, pointX: null, pointY: null, labelPosition: 'auto', title: '', description: '', imageUrl: '', active: true }] });
          setSelectedId(id);
        }}
      >
        <Plus size={14} /> Add a feature
      </button>

      <div className="hse-settings">
        <Switch checked={value.loop !== false} onChange={(on) => set({ loop: on })} label="Loop the arrows (last goes back to first)" />
        <Switch checked={value.autoplay === true} onChange={(on) => set({ autoplay: on })} label="Autoplay every 5 seconds (pauses on hover / touch)" />
        <div className="field">
          <label htmlFor="hse-placement">Where it appears</label>
          <select id="hse-placement" value={value.placement || 'after_info'} onChange={(e) => set({ placement: e.target.value })}>
            {PLACEMENTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="hse-preview">
        <div className="hse-preview-bar">
          <span className="pse-label">Live preview</span>
          <div className="pse-preview-tabs" role="group" aria-label="Preview size">
            <button type="button" className={`btn btn-sm ${previewMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>
              <Monitor size={14} /> Desktop
            </button>
            <button type="button" className={`btn btn-sm ${previewMode === 'mobile' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>
              <Smartphone size={14} /> Mobile
            </button>
          </div>
        </div>
        {preview.hotspots.length > 0 && preview.imageUrl ? (
          <div className={`pse-preview-frame hse-preview-frame is-${previewMode}`}>
            <FeatureHotspots section={{ ...preview, autoplay: false }} preview />
          </div>
        ) : (
          <p className="field-hint">The preview shows once there is a main photo and at least one active feature with a title, a description and a place on the photo.</p>
        )}
        {!value.enabled && <p className="field-hint">The section is switched off, so shoppers don't see it yet.</p>}
      </div>
    </div>
  );
}
