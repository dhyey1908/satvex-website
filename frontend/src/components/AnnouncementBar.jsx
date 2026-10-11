import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '../context/SettingsContext';
import { crossfade } from '../motion';
import './AnnouncementBar.css';

const ROTATE_INTERVAL_MS = 4000;

// Settings already arrives here pre-filtered by the backend (active, within
// schedule, and — if it references a coupon — that coupon is genuinely
// live right now). This component only ever renders what it's given; it
// never second-guesses whether an announcement "should" be shown.
export function AnnouncementBar() {
  const { settings } = useSettings();
  const announcements = settings?.announcements || [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Index can go stale if the list shrinks (e.g. a coupon expires between
  // polls) — clamp rather than render undefined.
  useEffect(() => {
    if (index >= announcements.length) setIndex(0);
  }, [announcements.length, index]);

  useEffect(() => {
    if (paused || announcements.length <= 1) return undefined;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % announcements.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, announcements.length]);

  if (announcements.length === 0) return null;

  const current = announcements[index] || announcements[0];
  const text = current.couponCode ? `${current.message} — Use Code ${current.couponCode}` : current.message;
  const isInternalLink = current.link?.startsWith('/');

  const message = (
    <motion.span
      key={current.id}
      className="announcement-bar-text"
      initial={crossfade.initial}
      animate={crossfade.animate}
      exit={crossfade.exit}
    >
      {text}
    </motion.span>
  );

  return (
    <div
      className="announcement-bar"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
    >
      <div className="announcement-bar-inner">
        {current.link ? (
          isInternalLink ? (
            <Link to={current.link} className="announcement-bar-link">
              <AnimatePresence mode="wait">{message}</AnimatePresence>
            </Link>
          ) : (
            <a href={current.link} className="announcement-bar-link" target="_blank" rel="noreferrer">
              <AnimatePresence mode="wait">{message}</AnimatePresence>
            </a>
          )
        ) : (
          <AnimatePresence mode="wait">{message}</AnimatePresence>
        )}
      </div>
    </div>
  );
}
