import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { crossfade } from '../motion';
import { isMediaPreloaded, preloadMedia } from '../utils/mediaPreload';
import './HeroBanner.css';

// How long an IMAGE slide stays up. Video slides have no timer at all: they
// advance when the video finishes (see handleVideoEnded).
const IMAGE_MS = 5000;
// Horizontal travel (px) before a drag/swipe counts as a slide change rather
// than a tap/click on the banner link.
const SWIPE_PX = 50;

export function HeroBanner({ banners, fallback }) {
  const activeBanners = (banners || []).filter((b) => b.isActive && b.mediaUrl);
  const count = activeBanners.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Slides whose video could not play (autoplay blocked, load error). They
  // fall back to the image timer so the carousel can never get stuck on them.
  const [failedVideos, setFailedVideos] = useState(() => new Set());
  const current = activeBanners[index] || null;
  // Lags behind `current` until that slide's media has actually loaded, so
  // rotating/clicking a dot never swaps to a blank frame mid-fetch. The
  // link/dots below react to `current` immediately — only the rendered
  // image/video itself waits.
  const [displayed, setDisplayed] = useState(current);

  const rootRef = useRef(null);
  const pointer = useRef(null);
  const suppressClick = useRef(false);

  const goTo = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const goNext = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const goPrev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (!current) {
      setDisplayed(null);
      return undefined;
    }
    if (isMediaPreloaded(current.mediaUrl)) {
      setDisplayed(current);
      return undefined;
    }
    let cancelled = false;
    preloadMedia(current.mediaUrl, current.type).then(() => {
      if (!cancelled) setDisplayed(current);
    });
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.mediaUrl, current?.type]);

  // The slide the viewer is actually looking at is the one that is both
  // current and loaded. Only then does it count as "playing".
  const slideReady = Boolean(displayed && current && displayed.id === current.id);
  const waitingForVideo = slideReady && current.type === 'video' && !failedVideos.has(current.id);

  // ONE auto-advance timer, re-created whenever anything it depends on
  // changes - so a manual change (swipe, arrow, dot) always restarts the full
  // 5 s, and there can never be two timers racing. A video slide never gets
  // one: it must be allowed to finish.
  useEffect(() => {
    if (count < 2 || !slideReady || waitingForVideo || paused) return undefined;
    const timer = setTimeout(goNext, IMAGE_MS);
    return () => clearTimeout(timer);
  }, [count, index, slideReady, waitingForVideo, paused, goNext]);

  // Playback: whenever the visible slide changes, pause every video that is
  // not the active one (the outgoing slide stays mounted during the
  // crossfade), then start the active one - muted and inline, from the start.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const activeId = displayed ? String(displayed.id) : null;
    const videos = root.querySelectorAll('video');
    videos.forEach((v) => {
      if (v.dataset.slideId !== activeId) v.pause();
    });
    if (displayed?.type !== 'video') return;
    const el = [...videos].find((v) => v.dataset.slideId === activeId);
    if (!el) return;
    el.muted = true;
    el.playsInline = true;
    const played = el.play();
    if (played?.catch) played.catch(() => markFailed(displayed.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed?.id]);

  // Browsers can pause an autoplaying video while the tab is hidden; pick it
  // back up when the viewer returns so the slide doesn't freeze on one frame.
  useEffect(() => {
    function resume() {
      if (document.visibilityState !== 'visible') return;
      const root = rootRef.current;
      const activeId = displayed ? String(displayed.id) : null;
      const el = root && [...root.querySelectorAll('video')].find((v) => v.dataset.slideId === activeId);
      if (el && el.paused && !el.ended) el.play()?.catch?.(() => markFailed(displayed.id));
    }
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed?.id]);

  function markFailed(id) {
    setFailedVideos((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  // `ended` from a slide that is no longer the current one (e.g. the viewer
  // swiped away a moment before it finished) must never move the carousel.
  function handleVideoEnded(id) {
    if (current && id === current.id) goNext();
  }

  // ---- swipe (touch) + drag (mouse) ----
  function onPointerDown(e) {
    if (count < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    suppressClick.current = false;
    pointer.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Mostly-horizontal and far enough: it was a swipe, not a tap or a scroll.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    suppressClick.current = true; // don't follow the banner link after a drag
    if (dx < 0) goNext();
    else goPrev();
  }

  function onPointerCancel() {
    pointer.current = null;
  }

  function onClickCapture(e) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  if (count === 0) return fallback;
  if (!displayed) return fallback;

  const isExternal = current.link && /^https?:\/\//.test(current.link);

  function press(e, fn) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  const inner = (
    <>
      <AnimatePresence>
        {displayed.type === 'video' ? (
          <motion.video
            key={displayed.id}
            data-slide-id={String(displayed.id)}
            src={displayed.mediaUrl}
            autoPlay
            muted
            playsInline
            // Only a lone video loops. In a carousel it must END so the next
            // slide can take over.
            loop={count < 2}
            preload="auto"
            draggable={false}
            onEnded={() => handleVideoEnded(displayed.id)}
            onError={() => markFailed(displayed.id)}
            initial={crossfade.initial}
            animate={crossfade.animate}
            exit={crossfade.exit}
          />
        ) : (
          <motion.img
            key={displayed.id}
            src={displayed.mediaUrl}
            alt=""
            draggable={false}
            initial={crossfade.initial}
            animate={crossfade.animate}
            exit={crossfade.exit}
          />
        )}
      </AnimatePresence>
      <div className="hero-image-overlay" />
      {count > 1 && (
        <>
          <button
            type="button"
            className="hero-banner-arrow hero-banner-arrow-prev"
            aria-label="Previous banner"
            onClick={(e) => press(e, goPrev)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="hero-banner-arrow hero-banner-arrow-next"
            aria-label="Next banner"
            onClick={(e) => press(e, goNext)}
          >
            <ChevronRight size={20} />
          </button>
          <div className="hero-banner-dots">
            {activeBanners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                className={`hero-banner-dot ${i === index ? 'active' : ''}`}
                aria-label={`Show banner ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={(e) => press(e, () => goTo(i))}
              />
            ))}
          </div>
        </>
      )}
    </>
  );

  const commonProps = {
    ref: rootRef,
    className: 'hero-image',
    draggable: false,
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };

  if (!current.link) return <div {...commonProps}>{inner}</div>;
  if (isExternal) {
    return (
      <a href={current.link} target="_blank" rel="noreferrer" {...commonProps}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={current.link} {...commonProps}>
      {inner}
    </Link>
  );
}
