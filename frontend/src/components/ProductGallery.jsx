import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { ImagePlaceholder } from './ImagePlaceholder';
import { crossfade } from '../motion';
import { usePreloadedImage } from '../hooks/usePreloadedImage';
import './ProductGallery.css';
import { SmartImage } from './SmartImage';
import { useVideoReady } from '../hooks/useVideoReady';
import { ProductLightbox } from './ProductLightbox';

// Minimum horizontal travel (px) before a touch swipe or mouse drag on the
// main view counts as "change slide" rather than a tap/click — keeps
// tap-to-zoom and swipe-to-change from fighting over the same gesture.
const SWIPE_THRESHOLD = 40;

// `lifestyleImages` is an optional slot for in-use / model photos: they follow
// the product photos in the same sequence (thumbnails, arrows, swipe, dots).
// The main photo: same crossfade as before, but invisible (box shimmering) until fully loaded, placeholder if it fails.
const MotionSmartImage = motion.create(SmartImage);

export function ProductGallery({ images, lifestyleImages, activeImage, videoUrl, videoFirst = false, alt, altByUrl, resetKey, onImageChange }) {
  const base = images && images.length > 0 ? images : [];
  const gallery = lifestyleImages?.length ? [...base, ...lifestyleImages.filter((u) => !base.includes(u))] : base;
  const [index, setIndex] = useState(0);
  // The page opens on the first photo, with the video one tap away on its own thumbnail -
  // unless the admin chose "video first" for this product. Picking a colour or a photo
  // always goes back to photos.
  const opensOnVideo = videoFirst && Boolean(videoUrl);
  const [showVideo, setShowVideo] = useState(opensOnVideo);
  // Autoplay genuinely failing (blocked, errored, or the viewer prefers
  // reduced motion) falls back to the plain image view below rather than a
  // stuck, silent black box — see the autoplay effect further down.
  const [videoFailed, setVideoFailed] = useState(false);
  // Index into the lightbox's slide list (video first when there is one, then the photos) while it is open, else null.
  const [lightboxAt, setLightboxAt] = useState(null);
  // The colour changed: its photos replace the old ones, so go back to the first
  // photo (the colour's primary). The very first render keeps the video default.
  const firstResetKey = useRef(resetKey);
  const pointerStart = useRef(null);
  // Set when a gesture turned out to be a swipe/drag, so the click that can
  // follow it doesn't also open the zoom view.
  const suppressClick = useRef(false);
  const videoRef = useRef(null);
  // activeImage (the color currently selected/previewed in the selector
  // above) normally wins over the plain index — but once the customer
  // manually browses (arrow, swipe, or thumbnail), that manual choice
  // should actually take effect instead of snapping straight back to the
  // previewed color's photo on every render. manualOverride tracks that:
  // set on any manual navigation, and cleared again the moment a genuinely
  // new activeImage comes in from a fresh color pick (see the effect below)
  // — so manual browsing "wins" until the customer picks a different color,
  // which then takes back over as expected.
  const [manualOverride, setManualOverride] = useState(false);
  const prevActiveImageRef = useRef(activeImage);
  const targetImage = (manualOverride ? null : activeImage) || gallery[index];
  // Keeps showing the previous main image until the newly-requested one has
  // actually loaded, so switching color/thumbnail never shows a blank gap.
  const mainImage = usePreloadedImage(targetImage);
  const videoVisible = showVideo && Boolean(videoUrl) && !videoFailed;
  // The video stays invisible (its box shimmering) until its first frame is ready: no poster photo flashing first.
  const videoLoad = useVideoReady(videoRef, [videoUrl, videoVisible]);

  // ProductDetail doesn't remount this component on every product-page
  // navigation (same route, just a new slug) — re-derive the default
  // whenever the product itself changes, so landing on a video product
  // after a non-video one (or vice versa) still opens on the right view.
  useEffect(() => {
    setShowVideo(opensOnVideo);
    setVideoFailed(false);
  }, [videoUrl, opensOnVideo]);

  // A genuinely new activeImage (the customer picked a different color)
  // takes manual browsing back over, same as it always has — and also
  // resyncs index/showVideo to match that photo's real position in the
  // gallery, so the *next* arrow/swipe click continues logically from
  // there instead of from wherever manual browsing last left off.
  useEffect(() => {
    if (activeImage === prevActiveImageRef.current) return;
    prevActiveImageRef.current = activeImage;
    setManualOverride(false);
    if (activeImage) {
      const foundIndex = gallery.indexOf(activeImage);
      if (foundIndex !== -1) {
        setIndex(foundIndex);
        setShowVideo(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImage]);

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
  // the real photo. While the video slide is showing there is no photo on
  // screen, so null is reported: the caller drops the color label for the
  // video, and gets the (current) photo's label back the moment an image
  // slide is shown again.
  useEffect(() => {
    onImageChange?.(videoVisible ? null : mainImage || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainImage, videoVisible]);

  useEffect(() => {
    if (firstResetKey.current === resetKey) return;
    firstResetKey.current = resetKey;
    setManualOverride(false);
    setShowVideo(false);
    setIndex(0);
  }, [resetKey]);

  function selectImage(i) {
    setManualOverride(true);
    setShowVideo(false);
    setIndex(i);
  }

  // Treats the gallery as one navigable sequence — video first (when the
  // product has one), then every image — so the arrows can step through
  // both, same as clicking through the thumbnail rail would. Wraps at
  // either end rather than disabling at the first/last item.
  const hasVideo = Boolean(videoUrl);
  const totalSlides = gallery.length + (hasVideo ? 1 : 0);

  function step(offset) {
    if (totalSlides <= 1) return;
    setManualOverride(true);
    const currentPos = showVideo ? 0 : index + (hasVideo ? 1 : 0);
    const nextPos = (currentPos + offset + totalSlides) % totalSlides;
    if (hasVideo && nextPos === 0) {
      setShowVideo(true);
      setVideoFailed(false);
    } else {
      setShowVideo(false);
      setIndex(hasVideo ? nextPos - 1 : nextPos);
    }
  }

  // Which slide (video first, then photos) is on screen, for the dot row.
  const currentPos = videoVisible ? 0 : index + (hasVideo ? 1 : 0);

  function goToSlide(pos) {
    setManualOverride(true);
    if (hasVideo && pos === 0) {
      setShowVideo(true);
      setVideoFailed(false);
    } else {
      setShowVideo(false);
      setIndex(hasVideo ? pos - 1 : pos);
    }
  }

  // The same list the gallery walks (video first, then the colour's photos + the shared ones), for the lightbox.
  const lightboxSlides = [
    ...(hasVideo ? [{ type: 'video', src: videoUrl }] : []),
    ...gallery.map((src) => ({ type: 'image', src, alt: altByUrl?.[src] || alt })),
  ];
  function openLightbox() {
    if (videoVisible) return setLightboxAt(0);
    if (!mainImage) return undefined;
    const at = gallery.indexOf(mainImage);
    return setLightboxAt(at === -1 ? currentPos : at + (hasVideo ? 1 : 0));
  }

  const goPrev = () => step(-1);
  const goNext = () => step(1);

  // Swipe (touch) and drag (mouse) over the main view - video slide included,
  // and through the same step() the arrows use, so a swipe walks the exact
  // same video -> photos sequence and wraps the same way.
  function onPointerDown(e) {
    if (totalSlides <= 1) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest?.('.gallery-nav')) return;
    suppressClick.current = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Mostly horizontal and far enough: a swipe, not a tap or a page scroll.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    suppressClick.current = true;
    step(dx < 0 ? 1 : -1);
  }

  function onPointerCancel() {
    pointerStart.current = null;
  }

  function onClickCapture(e) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div className="product-gallery">
      {(gallery.length > 1 || videoUrl) && (
        <div className="gallery-thumbs">
          {gallery.map((src, i) => (
            <button
              key={src + i}
              type="button"
              className={`gallery-thumb ${(manualOverride || !activeImage) && !videoVisible && i === index ? 'active' : ''}`}
              onClick={() => selectImage(i)}
              aria-label={`View image ${i + 1}`}
            >
              <SmartImage src={src} alt="" loading="lazy" />
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
      {/* Nav arrows are siblings of .gallery-main, not children — .gallery-main
          is itself a <button> (tap-to-zoom), and a <button> can't legally
          nest another interactive control inside it. Both float over the
          shared aspect-ratio box below via this wrapper's position:relative,
          so neither view's own layout/behavior changes at all. */}
      <div
        className="gallery-main-wrap"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
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
            <button type="button" className="gallery-zoom-btn" onClick={openLightbox} aria-label="View video full size">
              <ZoomIn size={16} />
            </button>
            <video
              key={videoUrl}
              ref={videoRef}
              src={videoUrl}
              muted
              autoPlay
              loop
              playsInline
              disablePictureInPicture
              draggable={false}
              preload="auto"
              {...videoLoad.props}
              onError={() => setVideoFailed(true)}
              aria-label={`${alt} — product video`}
            />
          </div>
        ) : (
          <button
            type="button"
            className="gallery-main"
            onClick={openLightbox}
            aria-label="View full-size image"
          >
            <AnimatePresence>
              {mainImage ? (
                <MotionSmartImage
                  key={mainImage}
                  src={mainImage}
                  alt={altByUrl?.[mainImage] || alt}
                  loading="eager"
                  draggable={false}
                  initial={crossfade.initial}
                  animate={crossfade.animate}
                  exit={crossfade.exit}
                />
              ) : (
                <ImagePlaceholder />
              )}
            </AnimatePresence>
            {mainImage && (
              <span className="gallery-zoom-icon" aria-hidden="true">
                <ZoomIn size={16} />
              </span>
            )}
          </button>
        )}

        {totalSlides > 1 && (
          <div className="gallery-dots" role="group" aria-label="Choose image">
            {Array.from({ length: totalSlides }, (_, pos) => (
              <button
                key={pos}
                type="button"
                className={`gallery-dot ${pos === currentPos ? 'active' : ''}`}
                aria-label={`Show ${hasVideo && pos === 0 ? 'video' : `image ${hasVideo ? pos : pos + 1}`}`}
                aria-current={pos === currentPos}
                onClick={() => goToSlide(pos)}
              />
            ))}
          </div>
        )}

        {totalSlides > 1 && (
          <>
            <button type="button" className="gallery-nav gallery-nav-prev" onClick={goPrev} aria-label="Previous image">
              <ChevronLeft size={20} />
            </button>
            <button type="button" className="gallery-nav gallery-nav-next" onClick={goNext} aria-label="Next image">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      <ProductLightbox
        open={lightboxAt !== null}
        slides={lightboxSlides}
        startIndex={lightboxAt ?? 0}
        onClose={(lastIndex) => {
          setLightboxAt(null);
          // land the gallery on the photo that was last looked at
          if (lastIndex !== lightboxAt) goToSlide(lastIndex);
        }}
      />
    </div>
  );
}
