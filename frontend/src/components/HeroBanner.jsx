import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { crossfade } from '../motion';
import './HeroBanner.css';

const ROTATE_MS = 6000;

export function HeroBanner({ banners, fallback }) {
  const activeBanners = (banners || []).filter((b) => b.isActive && b.mediaUrl);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length < 2 || paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % activeBanners.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [activeBanners.length, paused]);

  if (activeBanners.length === 0) return fallback;

  const current = activeBanners[index];
  const isExternal = current.link && /^https?:\/\//.test(current.link);

  function selectDot(e, i) {
    e.preventDefault();
    e.stopPropagation();
    setIndex(i);
  }

  const inner = (
    <>
      <AnimatePresence mode="wait">
        {current.type === 'video' ? (
          <motion.video
            key={current.id}
            src={current.mediaUrl}
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
            key={current.id}
            src={current.mediaUrl}
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
