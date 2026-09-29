import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn } from 'lucide-react';
import { ImagePlaceholder } from './ImagePlaceholder';
import { crossfade } from '../motion';
import { usePreloadedImage } from '../hooks/usePreloadedImage';
import './ProductGallery.css';

// Minimum horizontal drag distance (px) before a touch gesture on the main
// image counts as a swipe rather than a tap — keeps tap-to-zoom and
// swipe-to-change-image from fighting over the same gesture.
const SWIPE_THRESHOLD = 40;

export function ProductGallery({ images, activeImage, alt }) {
  const gallery = images && images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [magnified, setMagnified] = useState(false);
  const touchStartX = useRef(null);
  const targetImage = activeImage || gallery[index];
  // Keeps showing the previous main image until the newly-requested one has
  // actually loaded, so switching color/thumbnail never shows a blank gap.
  const mainImage = usePreloadedImage(targetImage);

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

  return (
    <div className="product-gallery">
      {gallery.length > 1 && (
        <div className="gallery-thumbs">
          {gallery.map((src, i) => (
            <button
              key={src + i}
              type="button"
              className={`gallery-thumb ${!activeImage && i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`View image ${i + 1}`}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
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
