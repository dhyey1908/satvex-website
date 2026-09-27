import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { crossfade } from '../motion';
import { isMediaPreloaded, preloadMedia } from '../utils/mediaPreload';
import './HeroBanner.css';

const ROTATE_MS = 6000;

export function HeroBanner({ banners, fallback }) {
  const activeBanners = (banners || []).filter((b) => b.isActive && b.mediaUrl);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = activeBanners[index] || null;
  // Lags behind `current` until that slide's media has actually loaded, so
  // rotating/clicking a dot never swaps to a blank frame mid-fetch. The
  // link/dots below react to `current` immediately — only the rendered
  // image/video itself waits.
  const [displayed, setDisplayed] = useState(current);

  useEffect(() => {
    setIndex(0);
  }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length < 2 || paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % activeBanners.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [activeBanners.length, paused]);

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

  if (activeBanners.length === 0) return fallback;
  if (!displayed) return fallback;

  const isExternal = current.link && /^https?:\/\//.test(current.link);

  function selectDot(e, i) {
    e.preventDefault();
    e.stopPropagation();
    setIndex(i);
  }

  const inner = (
    <>
      <AnimatePresence>
        {displayed.type === 'video' ? (
          <motion.video
            key={displayed.id}
            src={displayed.mediaUrl}
            autoPlay
            muted
            loop
            playsInline
            initial={crossfade.initial}
            animate={crossfade.animate}
            exit={crossfade.exit}
          />
        ) : (
          <motion.img
            key={displayed.id}
            src={displayed.mediaUrl}
            alt=""
            initial={crossfade.initial}
            animate={crossfade.animate}
            exit={crossfade.exit}
          />
        )}
      </AnimatePresence>
      <div className="hero-image-overlay" />
      {activeBanners.length > 1 && (
        <div className="hero-banner-dots">
          {activeBanners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={`hero-banner-dot ${i === index ? 'active' : ''}`}
              aria-label={`Show banner ${i + 1}`}
              onClick={(e) => selectDot(e, i)}
            />
          ))}
        </div>
      )}
    </>
  );

  const commonProps = {
    className: 'hero-image',
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
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
