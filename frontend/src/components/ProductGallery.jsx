import { useState } from 'react';
import { ImagePlaceholder } from './ImagePlaceholder';
import './ProductGallery.css';

export function ProductGallery({ images, activeImage, alt }) {
  const gallery = images && images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  const mainImage = activeImage || gallery[index];

  return (
    <div className="product-gallery">
      <div className="gallery-main">
        {mainImage ? <img src={mainImage} alt={alt} loading="eager" /> : <ImagePlaceholder />}
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
