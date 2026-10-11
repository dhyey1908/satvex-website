import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { crossfade } from '../motion';
import './AnnouncementBar.css';

const ROTATE_INTERVAL_MS = 4000;
const COPIED_RESET_MS = 1800;

// Settings already arrives here pre-filtered by the backend (active, within
// schedule, and — if it references a coupon — that coupon is genuinely
// live right now). This component only ever renders what it's given; it
// never second-guesses whether an announcement "should" be shown. Which
// announcements carry a coupon code (and what that code is) is entirely
// admin-managed in Admin > Announcement Bar — this component just renders
// a Copy button whenever the current one has one.
export function AnnouncementBar() {
  const { settings } = useSettings();
  const announcements = settings?.announcements || [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef(null);

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

  const current = announcements[index] || announcements[0] || null;

  // Rotating to a different announcement (or the list changing) should
  // never carry over a stale "Copied" state from the previous one.
  useEffect(() => {
    setCopied(false);
    clearTimeout(copiedTimerRef.current);
  }, [current?.id]);

  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  if (!current) return null;

  const isInternalLink = current.link?.startsWith('/');

  async function handleCopy(e) {
    // The copy button is a sibling of the link, never nested inside it (see
    // the markup below) — stopPropagation here is just defensive, in case
    // that ever changes, so a copy click can never also follow the link.
    e.stopPropagation();
    const code = current.couponCode;
    if (!code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for browsers/contexts without Clipboard API access (older
      // browsers, non-HTTPS). The code is also visible in the pill either
      // way, so manual copy is always possible even if this fails outright.
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        document.body.removeChild(textarea);
        return;
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  const message = (
    <motion.span
      key={current.id}
      className="announcement-bar-text"
      initial={crossfade.initial}
      animate={crossfade.animate}
      exit={crossfade.exit}
    >
      {current.message}
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

        {current.couponCode && (
          <button
            type="button"
            className="announcement-bar-copy"
            onClick={handleCopy}
            aria-label={`Copy coupon code ${current.couponCode}`}
          >
            <span className="announcement-bar-code">{current.couponCode}</span>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span className="announcement-bar-copy-label">{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
