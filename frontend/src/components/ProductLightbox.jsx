import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { SmartImage } from './SmartImage';
import './ProductLightbox.css';

// How far the picture zooms: under the mouse on a computer, by pinch / double-tap on a touch screen.
export const HOVER_ZOOM = 2.5;
export const DOUBLE_TAP_ZOOM = 2.5;
export const MAX_ZOOM = 4;
const SWIPE_PX = 50;
const SWIPE_DOWN_PX = 80;
const TAP_MS = 300;
const HINT_MS = 2000;

/**
 * The picture to show in the lightbox. Uploads are stored once, at their original size (nothing makes smaller copies),
 * so the sharp version IS the file the gallery already shows. If resized copies are ever made (a ~2400px "zoom" one),
 * return its URL here and the lightbox will use it; the neighbours are preloaded with the same function.
 */
export const lightboxSrc = (src) => src;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function useMatch(query) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

/**
 * Full-size viewer for the product photos (and video) - the same list the gallery shows, opened at `startIndex`.
 *   Computer: a white panel over a dimmed page. Hovering the picture zooms it where the cursor is (transform only: the
 *             image's own size never changes), click locks the zoom, arrows / thumbnails / keyboard move between photos.
 *   Phone:    a full-screen black viewer. Pinch to zoom, double-tap to zoom to the tapped spot, drag to pan (never past the
 *             picture's edge), swipe sideways to change photo, swipe down to close.
 * Everything that moves is clipped inside the viewer (overflow hidden), so zooming can never give the page a scrollbar.
 * `slides` is [{ type: 'image' | 'video', src, alt }]; onClose(lastIndex) lets the gallery land on the photo last viewed.
 */
export function ProductLightbox({ open, slides, startIndex = 0, onClose }) {
  if (!open || !slides?.length) return null;
  return createPortal(<Lightbox slides={slides} startIndex={startIndex} onClose={onClose} />, document.body);
}

function Lightbox({ slides, startIndex, onClose }) {
  const [index, setIndex] = useState(clamp(startIndex, 0, slides.length - 1));
  const compact = useMatch('(max-width: 767px)');
  const fine = useMatch('(hover: hover) and (pointer: fine)');
  const slide = slides[index];
  const isImage = slide.type === 'image';

  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const stageRef = useRef(null);
  const zoomRef = useRef(null);
  const boxRef = useRef(null);
  const thumbsRef = useRef(null);

  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({}); // src -> { w, h }
  const [hint, setHint] = useState(true);

  // The zoom state lives in a ref and is written straight to the DOM (no React render per frame).
  const view = useRef({ s: 1, tx: 0, ty: 0, ox: 50, oy: 50, locked: false, hover: false, suppress: false, mode: fine ? 'hover' : 'touch' });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(null);
  const raf = useRef(0);
  const lastMouse = useRef(null);
  const lastPointerType = useRef('mouse');

  // ---- size of the picture box --------------------------------------------------------------------------------
  // On a computer the box is the picture itself (so zooming never shows the white around it); on a phone it is the whole
  // screen area (black around the picture, zoomed along with it).
  const nat = natural[slide.src];
  const fit = useMemo(() => {
    if (compact || !nat || !stage.w || !stage.h) return { w: stage.w, h: stage.h };
    const k = Math.min(stage.w / nat.w, stage.h / nat.h);
    return { w: Math.round(nat.w * k), h: Math.round(nat.h * k) };
  }, [compact, nat, stage]);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isImage, compact]);

  // ---- applying the zoom ------------------------------------------------------------------------------------
  const apply = useCallback(() => {
    const el = zoomRef.current;
    const box = boxRef.current;
    if (!el) return;
    const v = view.current;
    const zoomed = v.s > 1.001;
    el.style.willChange = zoomed ? 'transform' : '';
    if (v.mode === 'hover') {
      el.style.transformOrigin = `${v.ox}% ${v.oy}%`;
      el.style.transform = `scale(${v.s})`;
    } else {
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate3d(${v.tx}px, ${v.ty}px, 0) scale(${v.s})`;
    }
    if (box) box.dataset.zoom = v.locked ? 'locked' : zoomed ? 'on' : 'off';
  }, []);

  const resetZoom = useCallback(() => {
    const v = view.current;
    Object.assign(v, { s: 1, tx: 0, ty: 0, ox: 50, oy: 50, locked: false, hover: false, suppress: false });
    apply();
  }, [apply]);

  // A different photo starts un-zoomed.
  useEffect(() => {
    resetZoom();
  }, [index, resetZoom]);

  // Where the picture box sits on the screen (the layout rect: unaffected by the zoom transform).
  const boxRect = () => {
    const r = stageRef.current.getBoundingClientRect();
    const { w, h } = fitRef.current;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, w, h };
  };

  // Keep the picture covering its box: its edge never comes inside.
  const clampPan = () => {
    const v = view.current;
    const { w, h } = fitRef.current;
    v.tx = clamp(v.tx, w * (1 - v.s), 0);
    v.ty = clamp(v.ty, h * (1 - v.s), 0);
  };

  // ---- computer: zoom where the cursor is -----------------------------------------------------------------------
  const followMouse = () => {
    raf.current = 0;
    const m = lastMouse.current;
    if (!m || !boxRef.current) return;
    const v = view.current;
    const r = boxRect();
    v.mode = 'hover';
    v.ox = clamp(((m.x - r.left) / r.w) * 100, 0, 100);
    v.oy = clamp(((m.y - r.top) / r.h) * 100, 0, 100);
    v.s = v.locked || (v.hover && !v.suppress) ? Math.max(v.s, HOVER_ZOOM) : 1;
    apply();
  };
  const scheduleFollow = (e) => {
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (!raf.current) raf.current = requestAnimationFrame(followMouse);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onBoxEnter = (e) => {
    if (e.pointerType !== 'mouse') return;
    const v = view.current;
    v.hover = true;
    v.suppress = false;
    scheduleFollow(e);
  };
  const onBoxMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    view.current.hover = true;
    scheduleFollow(e);
  };
  const onBoxLeave = (e) => {
    if (e.pointerType !== 'mouse') return;
    const v = view.current;
    v.hover = false;
    v.suppress = false;
    if (!v.locked) v.s = 1;
    apply();
  };
  // Click: lock the zoom on (it stays zoomed and keeps following the mouse), click again to zoom out.
  const onBoxClick = () => {
    if (lastPointerType.current !== 'mouse') return;
    const v = view.current;
    v.mode = 'hover';
    if (!v.locked) {
      v.locked = true;
      v.s = HOVER_ZOOM;
    } else {
      v.locked = false;
      v.suppress = true; // stay zoomed out until the mouse leaves and comes back
      v.s = 1;
    }
    apply();
  };

  // ---- touch: pinch, double-tap, pan, swipe ---------------------------------------------------------------------
  const point = (e) => {
    const r = boxRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const setGesturing = (on) => zoomRef.current?.classList.toggle('is-gesturing', on);

  const zoomAbout = (ns, cx, cy) => {
    const v = view.current;
    v.tx = cx - (cx - v.tx) * (ns / v.s);
    v.ty = cy - (cy - v.ty) * (ns / v.s);
    v.s = ns;
    clampPan();
  };

  const doubleTap = (e) => {
    const v = view.current;
    v.mode = 'touch';
    setGesturing(false); // animated
    if (v.s > 1.001) {
      Object.assign(v, { s: 1, tx: 0, ty: 0 });
    } else {
      const p = point(e);
      zoomAbout(DOUBLE_TAP_ZOOM, p.x, p.y);
    }
    apply();
  };

  const onStageDown = (e) => {
    lastPointerType.current = e.pointerType;
    if (e.pointerType === 'mouse' || !isImage) return;
    if (e.target.closest?.('button')) return;
    stageRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current;
    v.mode = 'touch';
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = boxRect();
      gesture.current = { kind: 'pinch', d0: dist(a, b), c0: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, s0: v.s, tx0: v.tx, ty0: v.ty };
      setGesturing(true);
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: 'one', x0: e.clientX, y0: e.clientY, t0: performance.now(), tx0: v.tx, ty0: v.ty, moved: false };
      if (v.s > 1.001) setGesturing(true);
    }
  };

  const onStageMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const v = view.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const r = boxRect();
      const c = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      const ns = clamp((g.s0 * dist(a, b)) / g.d0, 1, MAX_ZOOM);
      // the spot between the fingers stays between the fingers
      v.s = ns;
      v.tx = c.x - (g.c0.x - g.tx0) * (ns / g.s0);
      v.ty = c.y - (g.c0.y - g.ty0) * (ns / g.s0);
      clampPan();
      apply();
    } else if (g.kind === 'one') {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
      if (v.s > 1.001) {
        v.tx = g.tx0 + dx;
        v.ty = g.ty0 + dy;
        clampPan();
        apply();
      }
    }
  };

  const onStageUp = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const v = view.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      const rest = [...pointers.current.values()][0];
      if (rest) {
        gesture.current = { kind: 'one', x0: rest.x, y0: rest.y, t0: performance.now(), tx0: v.tx, ty0: v.ty, moved: true };
      } else {
        gesture.current = null;
        setGesturing(false);
      }
      if (v.s < 1.05) {
        Object.assign(v, { s: 1, tx: 0, ty: 0 });
        apply();
      }
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    setGesturing(false);
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const now = performance.now();
    if (e.type === 'pointercancel') return;
    if (!g.moved && now - g.t0 < TAP_MS) {
      const prev = lastTap.current;
      if (prev && now - prev.t < TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
        lastTap.current = null;
        doubleTap(e);
      } else {
        lastTap.current = { x: e.clientX, y: e.clientY, t: now };
      }
      return;
    }
    if (v.s <= 1.001) {
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
      else if (dy > SWIPE_DOWN_PX && Math.abs(dy) > Math.abs(dx) * 1.2) onClose(index);
    }
  };

  // ---- moving between photos ----------------------------------------------------------------------------------
  const go = useCallback(
    (offset) => {
      if (slides.length <= 1) return;
      setIndex((i) => (i + offset + slides.length) % slides.length);
    },
    [slides.length]
  );

  // Keyboard: arrows change photo, Esc closes, + / - zoom, Tab stays inside.
  useEffect(() => {
    const keyZoom = (dir) => {
      if (!isImage) return;
      const v = view.current;
      const ns = clamp(v.s + dir * 0.5, 1, MAX_ZOOM);
      if (v.mode === 'hover') {
        v.s = ns;
        v.locked = ns > 1;
        v.suppress = false;
      } else {
        const { w, h } = fitRef.current;
        zoomAbout(ns, w / 2, h / 2);
      }
      apply();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(index);
      } else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') keyZoom(1);
      else if (e.key === '-' || e.key === '_') keyZoom(-1);
      else if (e.key === 'Tab') {
        const items = [...dialogRef.current.querySelectorAll('button, video[controls], [href], [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isImage, go, onClose, apply]);

  // Page behind: locked in place while open (and put back at the same scroll position on close); focus goes into the
  // popup and returns to whatever opened it.
  useEffect(() => {
    const { body } = document;
    const y = window.scrollY;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      Object.assign(body.style, prev);
      window.scrollTo({ top: y, behavior: 'instant' });
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  // The hint ("Hover to zoom" / "Double-tap to zoom") fades after 2 seconds.
  useEffect(() => {
    const t = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, []);

  // The next and previous photos are fetched ahead of time.
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const s = slides[(i + slides.length) % slides.length];
      if (s?.type === 'image') new Image().src = lightboxSrc(s.src);
    });
  }, [index, slides]);

  // Keep the active thumbnail in view (inside the strip only - never scrolls the page).
  useEffect(() => {
    const strip = thumbsRef.current;
    const active = strip?.querySelector('[aria-current="true"]');
    if (strip && active) strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
  }, [index]);

  const label = `${slide.type === 'video' ? 'Video' : 'Image'} ${index + 1} of ${slides.length}`;

  return (
    <div className="lb-overlay" onClick={(e) => !compact && e.target === e.currentTarget && onClose(index)}>
      <div className="lb-panel" role="dialog" aria-modal="true" aria-label={label} ref={dialogRef} tabIndex={-1}>
        <header className="lb-header">
          <span className="lb-counter" aria-live="polite">{label}</span>
          <button type="button" className="lb-close" onClick={() => onClose(index)} aria-label="Close" ref={closeRef}>
            <X size={20} />
          </button>
        </header>

        <div
          className="lb-stage"
          ref={stageRef}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
        >
          {isImage ? (
            <div
              className="lb-box"
              ref={boxRef}
              data-zoom="off"
              style={{ width: fit.w || undefined, height: fit.h || undefined }}
              onPointerEnter={onBoxEnter}
              onPointerMove={onBoxMove}
              onPointerLeave={onBoxLeave}
              onClick={onBoxClick}
            >
              <div className="lb-zoom" ref={zoomRef}>
                <SmartImage
                  key={slide.src}
                  className="lb-img"
                  src={lightboxSrc(slide.src)}
                  alt={slide.alt || ''}
                  draggable={false}
                  decoding="async"
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    setNatural((n) => (n[slide.src]?.w === w ? n : { ...n, [slide.src]: { w, h } }));
                  }}
                />
              </div>
            </div>
          ) : (
            <video key={slide.src} className="lb-video" src={slide.src} controls autoPlay playsInline aria-label="Product video" />
          )}

          {slides.length > 1 && (
            <>
              <button type="button" className="lb-nav lb-nav-prev" onClick={() => go(-1)} aria-label="Previous image">
                <ChevronLeft size={22} />
              </button>
              <button type="button" className="lb-nav lb-nav-next" onClick={() => go(1)} aria-label="Next image">
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {isImage && hint && <span className="lb-hint">{fine ? 'Hover to zoom' : 'Double-tap to zoom'}</span>}
        </div>

        {slides.length > 1 && !compact && (
          <div className="lb-thumbs" ref={thumbsRef} role="group" aria-label="All images">
            {slides.map((s, i) => (
              <button key={`${s.src}${i}`} type="button" className={`lb-thumb ${i === index ? 'active' : ''}`} aria-current={i === index} aria-label={`Show ${s.type === 'video' ? 'video' : `image ${i + 1}`}`} onClick={() => setIndex(i)}>
                {s.type === 'video' ? <Play size={18} fill="currentColor" /> : <SmartImage src={s.src} alt="" loading="lazy" draggable={false} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
