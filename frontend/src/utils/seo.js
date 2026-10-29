// One canonical host for every absolute URL (canonical link, og:url, og:image,
// JSON-LD, sitemap). The other host 301-redirects to it at the CDN edge — see
// FrontendRouterFunction in backend/template.yaml.
export const SITE_URL = 'https://www.satvex.co.in';
export const SITE_NAME = 'Satvex';

// Social-share fallback when a page has no image of its own.
// public/og-default.jpg is 1200x630 (the size WhatsApp, Facebook and Google show best).
export const DEFAULT_OG_IMAGE = '/og-default.jpg';

// Absolute URL on the canonical host for a path ("/shop") or a media URL
// (already absolute, returned as is).
export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/**
 * schema.org Product JSON-LD for a product from the API. `reviewSummary` is the
 * backend's summary of the reviews the storefront actually shows
 * ({ count, average, verifiedCount }): aggregateRating is only emitted when
 * there is at least one review AND every shown review is a verified purchase —
 * never from a stored/seeded rating.
 */
export function buildProductJsonLd(product, { reviewSummary, path } = {}) {
  const active = (product.sellingOptions || []).filter((o) => o.isActive);
  const prices = active.map((o) => o.price);
  const variantImages = (product.variants || []).filter((v) => v.isActive && v.image).map((v) => v.image);
  // The primary photo of each colour, plus the common photos.
  const images = [...new Set([...variantImages, ...(product.images || [])])].map(absoluteUrl);
  const inStock = product.isActive && active.length > 0 && (product.variants || []).some((v) => v.isActive && v.inStock !== false);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription || undefined,
    image: images.length ? images : undefined,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': prices.length > 1 ? 'AggregateOffer' : 'Offer',
      priceCurrency: 'INR',
      ...(prices.length > 1
        ? { lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length }
        : { price: prices[0] ?? product.basePrice }),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(path || `/product/${product.slug}`),
    },
  };

  if (reviewSummary && reviewSummary.count > 0 && reviewSummary.verifiedCount === reviewSummary.count) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviewSummary.average,
      reviewCount: reviewSummary.count,
    };
  }
  return ld;
}
