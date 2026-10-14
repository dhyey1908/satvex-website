import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import './ProductVideoSlider.css';

const SWIPE_THRESHOLD_PX = 44;
const DRAG_CLICK_GUARD_PX = 6;
// How many cards are drawn either side of the active one (the outer pair is
// the "peeking" neighbour).
const VISIBLE_RADIUS = 2;

// Poster for a card. A thumbnail is a plain lazy image; without one, the
// video's own first frame is requested (metadata only, `#t=` seek) but only
// once the card is near the viewport — so no video bytes are fetched for
// cards nobody has scrolled to.
function CardPoster({ video, label }) {
  const holderRef = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (video.thumbnailUrl || near) return undefined;
    const el = holderRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [video.thumbnailUrl, near]);

  if (video.thumbnailUrl) {
    return <img className="pvs-poster" src={video.thumbnailUrl} alt={label} loading="lazy" decoding="async" draggable={false} />;
  }
  return (
    <span className="pvs-poster pvs-poster-video" ref={holderRef}>
      {near && <video src={`${video.videoUrl}#t=0.5`} muted playsInline preload="metadata" aria-label={label} />}
    </span>
  );
}

// The one <video> element that exists at any time — it is mounted only for
// the card being played, so "play only the selected video" holds by
// construction and nothing else is downloading.
function ActivePlayer({ video, muted, onEnded, onRequestClose, onToggleMute }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The customer just tapped play, so audio is allowed; if a browser still
    // refuses, fall back to muted playback rather than not playing.
    el.play().catch(() => {
      el.muted = true;
      el.play().catch(() => {});
    });
  }, []);

  function togglePause() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  return (
    <>
      <video
        ref={ref}
        className="pvs-player"
        src={video.videoUrl}
        poster={video.thumbnailUrl || undefined}
        muted={muted}
        playsInline
        preload="auto"
        onEnded={onEnded}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={togglePause}
      />
      <div className="pvs-controls">
        <button type="button" className="pvs-ctrl" onClick={togglePause} aria-label={paused ? 'Play video' : 'Pause video'}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button type="button" className="pvs-ctrl" onClick={onToggleMute} aria-label={muted ? 'Unmute video' : 'Mute video'}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button type="button" className="pvs-ctrl" onClick={onRequestClose} aria-label="Close video">
          <X size={16} />
        </button>
      </div>
    </>
  );
}

// Shortest signed distance from `active` to `index` around the loop (or the
// plain difference when there are too few cards to loop sensibly).
function relativeOffset(index, active, count) {
  const diff = index - active;
  if (count < 4) return diff;
  const half = count / 2;
  if (diff > half) return diff - count;
  if (diff < -half) return diff + count;
  return diff;
}

/**
 * Customer video testimonials carousel for the product page.
 * - The active card is centred and larger; neighbours peek in either side and
 *   the list wraps around, so there are always cards on both sides.
 * - Swipe/drag on touch and mouse, arrow buttons, and ← → keys.
 * - Cards show a lazy thumbnail; a video element exists only while playing,
 *   so at most one video ever plays and nothing downloads until requested.
 */
export function ProductVideoSlider({ videos, productName }) {
  const stageRef = useRef(null);
  const sectionRef = useRef(null);
  const drag = useRef({ id: null, startX: 0, dx: 0, moved: false });
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(null);
  const [muted, setMuted] = useState(false);
  const [dragging, setDragging] = useState(false);

  const count = videos.length;
  const canLoop = count >= 4;

  // Keep the index valid if the list shrinks underneath us.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, count - 1)));
  }, [count]);

  // Scrolled out of view -> stop, so audio never plays from off-screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => !e.isIntersecting)) setPlaying(null);
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function goTo(index) {
    if (count === 0) return;
    let next = index;
    if (canLoop) next = ((index % count) + count) % count;
    else next = Math.min(count - 1, Math.max(0, index));
    if (next === active) return;
    setPlaying(null); // changing card always stops playback
    setActive(next);
  }
  const go = (delta) => goTo(active + delta);

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Don't start a drag from the player controls / buttons inside it.
    if (e.target.closest('.pvs-controls, .pvs-arrow')) return;
    drag.current = { id: e.pointerId, startX: e.clientX, dx: 0, moved: false };
  }
  function handlePointerMove(e) {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    d.dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(d.dx) > DRAG_CLICK_GUARD_PX) {
      d.moved = true;
      setDragging(true);
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone — harmless
      }
    }
    if (d.moved && stageRef.current) {
      // Rubber-band the drag a little so it follows the finger without
      // flinging cards off-screen.
      stageRef.current.style.setProperty('--pvs-drag', `${Math.max(-160, Math.min(160, d.dx))}px`);
    }
  }
  function finishDrag(e) {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    const { dx, moved } = d;
    drag.current = { id: null, startX: 0, dx: 0, moved };
    stageRef.current?.style.removeProperty('--pvs-drag');
    setDragging(false);
    if (moved && Math.abs(dx) >= SWIPE_THRESHOLD_PX) go(dx < 0 ? 1 : -1);
    // `moved` stays readable for the click that follows this pointerup, then
    // is cleared on the next tick.
    setTimeout(() => {
      drag.current = { ...drag.current, moved: false };
    }, 0);
  }

  function handleCardClick(index) {
    if (drag.current.moved) return; // that was a swipe, not a tap
    if (index !== active) {
      goTo(index);
      return;
    }
    setPlaying((current) => (current === index ? null : index));
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  }

  if (count === 0) return null;

  const prevDisabled = !canLoop && active === 0;
  const nextDisabled = !canLoop && active === count - 1;

  return (
    <section className="pvs" ref={sectionRef} aria-roledescription="carousel" aria-label="Customer videos">
      <header className="pvs-head">
        <p className="eyebrow">Customer videos</p>
        <h3 className="pvs-title">Loved by our customers</h3>
      </header>

      <div
        className={`pvs-stage ${dragging ? 'is-dragging' : ''}`}
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className="pvs-arrow pvs-arrow-prev"
          onClick={() => go(-1)}
          disabled={prevDisabled || count < 2}
          aria-label="Previous video"
        >
          <ChevronLeft size={20} />
        </button>

        <ul className="pvs-track">
          {videos.map((video, i) => {
            const offset = relativeOffset(i, active, count);
            if (Math.abs(offset) > VISIBLE_RADIUS) return null;
            const isActive = offset === 0;
            const isPlaying = playing === i;
            const label = video.customerName
              ? `${video.customerName} — ${productName}`
              : `Customer video ${i + 1} — ${productName}`;
            return (
              <li
                key={video.id || video.videoUrl + i}
                className={`pvs-card pvs-pos-${Math.abs(offset)} ${isActive ? 'is-active' : ''} ${isPlaying ? 'is-playing' : ''}`}
                style={{ '--pvs-offset': offset }}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
              >
                <div className="pvs-frame">
                  {isPlaying ? (
                    <ActivePlayer
                      video={video}
                      muted={muted}
                      onEnded={() => setPlaying(null)}
                      onRequestClose={() => setPlaying(null)}
                      onToggleMute={() => setMuted((m) => !m)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="pvs-open"
                      onClick={() => handleCardClick(i)}
                      aria-label={isActive ? `Play ${label}` : `Show ${label}`}
                      tabIndex={isActive || Math.abs(offset) === 1 ? 0 : -1}
                    >
                      <CardPoster video={video} label="" />
                      <span className="pvs-play" aria-hidden="true">
                        <Play size={22} fill="currentColor" />
                      </span>
                      {(video.customerName || video.caption) && (
                        <span className="pvs-caption">
                          {video.customerName && <strong>{video.customerName}</strong>}
                          {video.caption && <span>{video.caption}</span>}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="pvs-arrow pvs-arrow-next"
          onClick={() => go(1)}
          disabled={nextDisabled || count < 2}
          aria-label="Next video"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <p className="pvs-counter" aria-live="polite">
        {active + 1} / {count}
      </p>
    </section>
  );
}
