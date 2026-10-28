// SEO helpers: every absolute URL is on the canonical host, and Product JSON-LD
// only carries an aggregateRating when it is based on real (verified) reviews.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_URL, absoluteUrl, buildProductJsonLd } from '../utils/seo.js';

const product = {
  slug: 'butterfly',
  name: 'Butterfly Claw Clip',
  shortDescription: 'A claw clip.',
  isActive: true,
  basePrice: 249,
  images: ['https://cdn.example.com/a.jpg'],
  variants: [{ isActive: true, inStock: true, image: 'https://cdn.example.com/b.jpg' }],
  sellingOptions: [
    { isActive: true, price: 249 },
    { isActive: true, price: 349 },
  ],
};

test('canonical host is the www host and relative paths resolve onto it', () => {
  assert.equal(SITE_URL, 'https://www.satvex.co.in');
  assert.equal(absoluteUrl('/shop'), 'https://www.satvex.co.in/shop');
  assert.equal(absoluteUrl('https://cdn.example.com/x.jpg'), 'https://cdn.example.com/x.jpg');
  assert.equal(absoluteUrl(null), null);
});

test('Product JSON-LD: INR offer, image list, availability, canonical url', () => {
  const ld = buildProductJsonLd(product);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.priceCurrency, 'INR');
  assert.equal(ld.offers.lowPrice, 249);
  assert.equal(ld.offers.highPrice, 349);
  assert.equal(ld.offers.availability, 'https://schema.org/InStock');
  assert.equal(ld.offers.url, 'https://www.satvex.co.in/product/butterfly');
  assert.deepEqual(ld.image, ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
});

test('aggregateRating only when there are reviews and every shown review is a verified purchase', () => {
  assert.equal(buildProductJsonLd(product).aggregateRating, undefined);
  assert.equal(buildProductJsonLd(product, { reviewSummary: { count: 0, average: 0, verifiedCount: 0 } }).aggregateRating, undefined);
  // unverified (imported/seeded) reviews mixed in -> no rating claim
  assert.equal(buildProductJsonLd(product, { reviewSummary: { count: 10, average: 4.4, verifiedCount: 3 } }).aggregateRating, undefined);
  const ld = buildProductJsonLd(product, { reviewSummary: { count: 3, average: 4.3, verifiedCount: 3 } });
  assert.deepEqual(ld.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.3, reviewCount: 3 });
});

test('an out-of-stock product (no active variant in stock) is advertised as OutOfStock', () => {
  const ld = buildProductJsonLd({ ...product, variants: [{ isActive: true, inStock: false }] });
  assert.equal(ld.offers.availability, 'https://schema.org/OutOfStock');
});
