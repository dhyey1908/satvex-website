import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, Play } from 'lucide-react';
import { ImagePlaceholder } from './ImagePlaceholder';
import { crossfade } from '../motion';
import { usePreloadedImage } from '../hooks/usePreloadedImage';
import './ProductGallery.css';

// Minimum horizontal drag distance (px) before a touch gesture on the main
// image counts as a swipe rather than a tap — keeps tap-to-zoom and
// swipe-to-change-image from fighting over the same gesture.
const SWIPE_THRESHOLD = 40;

export function ProductGallery({ images, activeImage, videoUrl, alt, onImageChange }) {
  const gallery = images && images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  // When a product has a video, it's the default view. Selecting any image
  // thumbnail switches to images, same as before; nothing about the image
  // gallery itself changes.
  const [showVideo, setShowVideo] = useState(Boolean(videoUrl));
  // Autoplay genuinely failing (blocked, errored, or the viewer prefers
  // reduced motion) falls back to the plain image view below rather than a
  // stuck, silent black box — see the autoplay effect further down.
  const [videoFailed, setVideoFailed] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [magnified, setMagnified] = useState(false);
  const touchStartX = useRef(null);
  const videoRef = useRef(null);
  const targetImage = activeImage || gallery[index];
  // Keeps showing the previous main image until the newly-requested one has
  // actually loaded, so switching color/thumbnail never shows a blank gap.
  const mainImage = usePreloadedImage(targetImage);
  const videoVisible = showVideo && Boolean(videoUrl) && !videoFailed;

  // ProductDetail doesn't remount this component on every product-page
  // navigation (same route, just a new slug) — re-derive the default
  // whenever the product itself changes, so landing on a video product
  // after a non-video one (or vice versa) still opens on the right view.
  useEffect(() => {
    setShowVideo(Boolean(videoUrl));
    setVideoFailed(false);
  }, [videoUrl]);

  // Ad-style showcase: plays itself, muted, the moment it's visible — an
  // explicit .play() call (not just the autoPlay attribute) so a genuine
  // autoplay block surfaces as a promise rejection we can react to, rather
  // than silently leaving a frozen first frame on screen. Also respects
  // prefers-reduced-motion by skipping autoplay entirely for it, same
  // fallback path as a real autoplay failure.
  useEffect(() => {
    if (!videoVisible) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVideoFailed(true);
      return;
    }
    const el = videoRef.current;
    const playPromise = el?.play();
    if (playPromise?.catch) playPromise.catch(() => setVideoFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoVisible]);

  // Reports whatever is ACTUALLY on screen as the main image right now —
  // covers every way it can change (a color selection driving activeImage,
  // a plain thumbnail click, a swipe), not just an explicit color pick.
  // Lets a caller (the PDP's color-name badge) stay truthfully in sync with
  // the real photo. Never reported while the video view is showing instead.
  useEffect(() => {
    if (videoVisible) return;
    onImageChange?.(mainImage || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainImage, videoVisible]);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null || gallery.length <= 1) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    setIndex((i) => {
      const next = delta < 0 ? i + 1 : i - 1;
      return (next + gallery.length) % gallery.length;
    });
  }

  function selectImage(i) {
    setShowVideo(false);
    setIndex(i);
  }

  return (
    <div className="product-gallery">
      {(gallery.length > 1 || videoUrl) && (
        <div className="gallery-thumbs">
          {gallery.map((src, i) => (
            <button
              key={src + i}
              type="button"
              className={`gallery-thumb ${!activeImage && !videoVisible && i === index ? 'active' : ''}`}
              onClick={() => selectImage(i)}
              aria-label={`View image ${i + 1}`}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
          {videoUrl && (
            <button
              type="button"
              className={`gallery-thumb gallery-thumb-video ${videoVisible ? 'active' : ''}`}
              onClick={() => {
                setShowVideo(true);
                setVideoFailed(false);
              }}
              aria-label="Play product video"
            >
              <Play size={20} fill="currentColor" />
            </button>
          )}
        </div>
      )}
      {videoVisible ? (
        // Plain div, not the zoomable image button below — nothing here is
        // interactive, deliberately. Same gallery-main box/aspect-ratio as
        // the image view, so switching between video and images never
        // shifts layout.
        //
        // Ad-style product showcase, not a traditional video player: muted
        // + autoPlay + loop (autoplay is actually started by the .play()
        // effect above, which can react to a block; these attributes are
        // the standard declarative fallback) and no `controls` at all — no
        // play/pause, scrubber, volume, fullscreen, or overflow menu.
        // poster shows the first product image until the first frame of
        // video is ready.
        <div className="gallery-main gallery-main-video">
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            muted
            autoPlay
            loop
            playsInline
            disablePictureInPicture
            preload="auto"
            poster={gallery[0] || undefined}
            onError={() => setVideoFailed(true)}
            aria-label={`${alt} — product video`}
          />
        </div>
      ) : (
        <button
          type="button"
          className="gallery-main"
          onClick={() => {
            if (!mainImage) return;
            setMagnified(false);
            setZoomOpen(true);
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-label="View full-size image"
        >
          <AnimatePresence>
            {mainImage ? (
              <motion.img
                key={mainImage}
                src={mainImage}
                alt={alt}
                loading="eager"
                initial={crossfade.initial}
                animate={crossfade.animate}
                exit={crossfade.exit}
              />
            ) : (
              <ImagePlaceholder />
            )}
          </AnimatePresence>
          {mainImage && (
            <span className="gallery-zoom-hint">
              <ZoomIn size={14} /> Tap to zoom
            </span>
          )}
        </button>
      )}

      {createPortal(
        <AnimatePresence>
          {zoomOpen && mainImage && (
            <motion.div
              className="gallery-zoom-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setZoomOpen(false)}
            >
              <button type="button" className="gallery-zoom-close" aria-label="Close zoomed image">
                <X size={20} />
              </button>
              {/* Scrollable so a magnified image (genuinely larger than the
                  viewport, not just fit-to-screen) can actually be panned —
                  without this, "zoom" on a phone looks identical to the
                  inline image since both cap at ~90vw. */}
              <div className="gallery-zoom-scroll">
                <motion.img
                  className={magnified ? 'magnified' : ''}
                  src={mainImage}
                  alt={alt}
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMagnified((v) => !v);
                  }}
                />
              </div>
              <span className="gallery-zoom-magnify-hint">
                {magnified ? 'Tap to zoom out' : 'Tap image to magnify'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
