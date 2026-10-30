import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Emphasis } from './ProofStats';
import { DEFAULT_ASPECT, MOBILE_MAX, connectorLine, pad2, stepIndex } from '../utils/hotspots';
import './FeatureHotspots.css';

const AUTOPLAY_MS = 5000;
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * "Feature Hotspots": one large product photo; each slide marks one part of it with a small square
 * (a numbered badge on phones) and a title + description label.
 * `section` is the shopper-facing shape the API returns
 * ({ title, imageUrl, imageAspect, loop, autoplay, hotspots[] }); marker positions are percentages
 * of the photo, so they stay on the same part of the product at every size.
 *
 * Desktop: the label sits in the chosen corner and a thin line is drawn at runtime (SVG overlay)
 * from the marker to the label - recalculated whenever the photo loads or the box resizes.
 * Phones (< 768px wide): no lines; the label becomes a numbered card under the photo.
 */
export function FeatureHotspots({ section, preview = false }) {
  const slides = section?.hotspots || [];
  const [index, setIndex] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [line, setLine] = useState(null);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const markerRef = useRef(null);
  const labelRef = useRef(null);
  const touchStart = useRef(null);

  const count = slides.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const slide = slides[safeIndex];
  const loop = section?.loop !== false;
  const src = slide?.imageUrl || section?.imageUrl;
  const aspect = slide?.imageAspect || section?.imageAspect || DEFAULT_ASPECT;

  const go = useCallback(
    (direction) => {
      const next = stepIndex(safeIndex, count, direction, loop);
      if (next !== null) setIndex(next);
    },
    [safeIndex, count, loop]
  );

  // desktop or phone layout, by the width of the block itself (so the admin's preview frame behaves too)
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => setMobile(el.clientWidth < MOBILE_MAX);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the connector line: marker -> nearest edge of the label, in the stage's own coordinates
  const measureLine = useCallback(() => {
    const stage = stageRef.current;
    const marker = markerRef.current;
    const label = labelRef.current;
    if (!stage || !marker || !label || mobile) {
      setLine(null);
      return;
    }
    const s = stage.getBoundingClientRect();
    const m = marker.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    setLine(
      connectorLine(
        { x: m.left + m.width / 2 - s.left, y: m.top + m.height / 2 - s.top },
        { left: l.left - s.left, top: l.top - s.top, right: l.right - s.left, bottom: l.bottom - s.top }
      )
    );
  }, [mobile]);

  useLayoutEffect(() => {
    measureLine();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measureLine);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measureLine, safeIndex, src, count]);

  // optional autoplay: off unless the admin turned it on; never with reduced motion; pauses on hover / focus / touch
  useEffect(() => {
    if (!section?.autoplay || paused || count < 2 || reducedMotion()) return undefined;
    const timer = window.setInterval(() => go(1), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [section?.autoplay, paused, count, go]);

  if (!section || !slide || !src) return null;

  const prev = slides[(safeIndex - 1 + count) % count];
  const next = slides[(safeIndex + 1) % count];
  const canPrev = stepIndex(safeIndex, count, -1, loop) !== null;
  const canNext = stepIndex(safeIndex, count, 1, loop) !== null;

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    }
  }
  function onTouchStart(e) {
    setPaused(true);
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
  }
  // a pointer swipe (for mouse-drag / touch devices that send pointer events only)
  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') touchStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    const start = touchStart.current;
    if (!start || e.pointerType === 'touch') return;
    touchStart.current = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const arrowLabel = (target, dir) => `${dir} feature: ${target.title}`;

  return (
    <section
      ref={rootRef}
      className={`fh ${mobile ? 'is-mobile' : 'is-desktop'}`}
      aria-roledescription="carousel"
      aria-label={section.title ? section.title.replace(/\*/g, '') : 'Product features'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      data-preview={preview ? '' : undefined}
    >
      {section.title && (
        <h2 className="fh-title">
          <Emphasis text={section.title} />
        </h2>
      )}

      <div
        className="fh-stage"
        ref={stageRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* The photo's box keeps its aspect ratio from the first paint (no layout shift); the marker is
            positioned inside it with percentages, so it follows the photo at any size. */}
        <div className="fh-figure" style={{ '--fh-aspect': aspect }}>
          <img key={src} className="fh-img" src={src} alt={`${slide.title} - highlighted on the product`} loading={safeIndex === 0 ? 'lazy' : 'eager'} onLoad={measureLine} draggable={false} />
          <span
            key={slide.id}
            ref={markerRef}
            className="fh-marker"
            style={{ left: `${slide.pointX}%`, top: `${slide.pointY}%` }}
            aria-hidden="true"
          >
            <b>{safeIndex + 1}</b>
          </span>
        </div>

        {!mobile && line && (
          <svg className="fh-lines" aria-hidden="true">
            <line key={slide.id} className="fh-line" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} pathLength="1" />
          </svg>
        )}

        <div key={slide.id} ref={labelRef} className={`fh-label is-${slide.labelPosition}`} aria-live="polite">
          <span className="fh-label-n">{safeIndex + 1}</span>
          <h3 className="fh-label-title">{slide.title}</h3>
          <p className="fh-label-text">{slide.description}</p>
        </div>

        {count > 1 && (
          <>
            <button type="button" className="fh-arrow fh-arrow-prev" onClick={() => go(-1)} disabled={!canPrev} aria-label={arrowLabel(prev, 'Previous')}>
              <ChevronLeft size={22} />
            </button>
            <button type="button" className="fh-arrow fh-arrow-next" onClick={() => go(1)} disabled={!canNext} aria-label={arrowLabel(next, 'Next')}>
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="fh-progress">
          <button type="button" className="fh-step" onClick={() => go(-1)} disabled={!canPrev} aria-label={arrowLabel(prev, 'Previous')}>
            <ChevronLeft size={18} />
          </button>
          <span className="fh-counter" aria-live="off">
            {pad2(safeIndex + 1)} / {pad2(count)}
          </span>
          <span className="fh-dots" aria-hidden="true">
            {slides.map((s, i) => (
              <i key={s.id} className={i === safeIndex ? 'is-on' : ''} />
            ))}
          </span>
          <button type="button" className="fh-step" onClick={() => go(1)} disabled={!canNext} aria-label={arrowLabel(next, 'Next')}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
