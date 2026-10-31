import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Emphasis } from './ProofStats';
import { DEFAULT_ASPECT, LABEL_GAP, MOBILE_MAX, labelLine, labelTop, pad2, pixelFromPercent, resolvePlacement, stepIndex } from '../utils/hotspots';
import './FeatureHotspots.css';

const AUTOPLAY_MS = 5000;
const FADE_OUT_MS = 150;
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * "Feature Hotspots": one large product photo; each slide marks one part of it with a small square
 * (a numbered badge on phones) and a title + description label.
 * `section` is the shopper-facing shape the API returns
 * ({ title, imageUrl, imageAspect, loop, autoplay, hotspots[] }); marker positions are percentages
 * of the photo, so they stay on the same part of the product at every size.
 *
 * Desktop: [arrow] [left gutter] [photo] [right gutter] [arrow]. The text sits in the gutter on the side
 * nearest the marker (or where the admin pinned it) and never overlaps the photo; a thin line is drawn
 * at runtime from the marker to the text and recalculated whenever the photo loads or the box resizes.
 * Narrow blocks (phones): no lines; the text becomes a numbered card under the photo.
 */
export function FeatureHotspots({ section, preview = false }) {
  const slides = section?.hotspots || [];
  const [index, setIndex] = useState(0); // the slide the shopper asked for (counter, dots, arrows)
  const [shown, setShown] = useState(0); // the slide on screen: it follows `index` after the old label has faded out
  const [leaving, setLeaving] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [layout, setLayout] = useState(null);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const figureRef = useRef(null);
  const markerRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const labelRef = useRef(null);
  const titleRef = useRef(null);
  const touchStart = useRef(null);

  const count = slides.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const safeShown = Math.min(shown, Math.max(0, count - 1));
  const slide = slides[safeShown];
  const loop = section?.loop !== false;
  const src = slide?.imageUrl || section?.imageUrl;
  const aspect = slide?.imageAspect || section?.imageAspect || DEFAULT_ASPECT;
  const placement = slide ? resolvePlacement(slide) : { side: 'right', vertical: 'middle' };

  const go = useCallback(
    (direction) => {
      const next = stepIndex(safeIndex, count, direction, loop);
      if (next !== null) setIndex(next);
    },
    [safeIndex, count, loop]
  );

  // slide change: the old label and line fade out (150ms), then the new ones come in
  useEffect(() => {
    if (index === shown) return undefined;
    if (reducedMotion() || mobile) {
      setShown(index);
      return undefined;
    }
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setShown(index);
      setLeaving(false);
    }, FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [index, shown, mobile]);

  // desktop layout or phone cards, by the width of the block itself (so the admin's preview frame behaves too)
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

  // Where the text sits (vertically) and the connector line, in the stage's own coordinates.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const figure = figureRef.current;
    const label = labelRef.current;
    const title = titleRef.current;
    const gutter = (placement.side === 'left' ? leftRef : rightRef).current;
    if (!stage || !figure || !label || !title || !gutter || mobile || !slide) {
      setLayout(null);
      return;
    }
    const s = stage.getBoundingClientRect();
    const f = figure.getBoundingClientRect();
    const g = gutter.getBoundingClientRect();
    const markerPx = pixelFromPercent(slide.pointX, slide.pointY, f.width, f.height);
    const top = labelTop({ vertical: placement.vertical, markerY: markerPx.y, labelHeight: label.offsetHeight, stageHeight: f.height });
    const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || title.offsetHeight;
    // the edge of the label that faces the photo: LABEL_GAP in from the gutter's edge
    const edgeX = placement.side === 'left' ? g.right - LABEL_GAP - s.left : g.left + LABEL_GAP - s.left;
    const line = labelLine({
      marker: { x: f.left - s.left + markerPx.x, y: f.top - s.top + markerPx.y },
      edgeX,
      titleY: f.top - s.top + top + lineHeight / 2,
      side: placement.side,
    });
    setLayout({ top, line });
  }, [mobile, slide, placement.side, placement.vertical]);

  useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    if (labelRef.current) ro.observe(labelRef.current);
    return () => ro.disconnect();
  }, [measure, safeShown, src, count]);

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
  // a pointer swipe (mouse drag)
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
  const label = (
    <div
      key={slide.id}
      ref={labelRef}
      className={`fh-label is-${placement.side} ${leaving ? 'is-leaving' : ''}`}
      style={{ top: layout ? layout.top : LABEL_GAP }}
      aria-live="polite"
    >
      <span className="fh-label-n">{safeShown + 1}</span>
      <h3 className="fh-label-title" ref={titleRef}>{slide.title}</h3>
      <p className="fh-label-text">{slide.description}</p>
    </div>
  );

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
        style={{ '--fh-aspect': aspect }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {count > 1 && (
          <button type="button" className="fh-arrow fh-arrow-prev" onClick={() => go(-1)} disabled={!canPrev} aria-label={arrowLabel(prev, 'Previous')}>
            <ChevronLeft size={22} />
          </button>
        )}

        {/* Both gutters always take their space, so the photo stays centred whichever side the text is on. */}
        <div className="fh-gutter fh-gutter-left" ref={leftRef}>{placement.side === 'left' && label}</div>

        {/* The photo's box keeps its aspect ratio from the first paint (no layout shift); the marker is
            positioned inside it with percentages, so it follows the photo at any size. */}
        <div className="fh-figure" ref={figureRef}>
          <img key={src} className="fh-img" src={src} alt={`${slide.title} - highlighted on the product`} loading={safeShown === 0 ? 'lazy' : 'eager'} onLoad={measure} draggable={false} />
          <span
            key={slide.id}
            ref={markerRef}
            className={`fh-marker ${leaving ? 'is-leaving' : ''}`}
            style={{ left: `${slide.pointX}%`, top: `${slide.pointY}%` }}
            aria-hidden="true"
          >
            <b>{safeShown + 1}</b>
          </span>
        </div>

        <div className="fh-gutter fh-gutter-right" ref={rightRef}>{placement.side === 'right' && label}</div>

        {count > 1 && (
          <button type="button" className="fh-arrow fh-arrow-next" onClick={() => go(1)} disabled={!canNext} aria-label={arrowLabel(next, 'Next')}>
            <ChevronRight size={22} />
          </button>
        )}

        {!mobile && layout && (
          <svg className={`fh-lines ${leaving ? 'is-leaving' : ''}`} aria-hidden="true">
            <g key={slide.id}>
              <line className="fh-line" x1={layout.line.x1} y1={layout.line.y1} x2={layout.line.x2} y2={layout.line.y2} pathLength="1" />
              <circle className="fh-dot" cx={layout.line.x2} cy={layout.line.y2} r="2" />
            </g>
          </svg>
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
