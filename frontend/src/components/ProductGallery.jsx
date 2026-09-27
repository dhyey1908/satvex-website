import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImagePlaceholder } from './ImagePlaceholder';
import { crossfade } from '../motion';
import { usePreloadedImage } from '../hooks/usePreloadedImage';
import './ProductGallery.css';

export function ProductGallery({ images, activeImage, alt }) {
  const gallery = images && images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  const targetImage = activeImage || gallery[index];
  // Keeps showing the previous main image until the newly-requested one has
  // actually loaded, so switching color/thumbnail never shows a blank gap.
  const mainImage = usePreloadedImage(targetImage);

  return (
    <div className="product-gallery">
      <div className="gallery-main">
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
      </div>
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
    </div>
  );
}
