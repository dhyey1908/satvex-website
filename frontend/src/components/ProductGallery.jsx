import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImagePlaceholder } from './ImagePlaceholder';
import { crossfade } from '../motion';
import './ProductGallery.css';

export function ProductGallery({ images, activeImage, alt }) {
  const gallery = images && images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  const mainImage = activeImage || gallery[index];

  return (
    <div className="product-gallery">
      <div className="gallery-main">
        <AnimatePresence mode="wait">
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
