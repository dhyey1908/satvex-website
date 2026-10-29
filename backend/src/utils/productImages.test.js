const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProductImages, prepareImagesForSave, withOnePrimary } = require('./productImages');

const legacy = {
  images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
  variants: [
    { id: 'v1', colorName: 'Pink', image: 'https://cdn/pink.jpg' },
    { id: 'v2', colorName: 'Black', image: '' },
  ],
};

test('an older product reads in the new shape: old photos are common, each colour photo is its primary', () => {
  const p = normalizeProductImages(legacy);
  assert.deepEqual(p.commonImages.map((i) => i.url), ['https://cdn/a.jpg', 'https://cdn/b.jpg']);
  assert.deepEqual(p.images, ['https://cdn/a.jpg', 'https://cdn/b.jpg']);
  assert.deepEqual(p.variants[0].images, [{ url: 'https://cdn/pink.jpg', alt: '', isPrimary: true }]);
  assert.equal(p.variants[0].image, 'https://cdn/pink.jpg');
  assert.deepEqual(p.variants[1].images, []);
  assert.equal(p.variants[1].image, '');
});

test('normalising twice changes nothing (idempotent)', () => {
  const once = normalizeProductImages(legacy);
  assert.deepEqual(normalizeProductImages(once), once);
});

test('saving: exactly one primary per colour, `image` mirrors it, duplicates dropped', () => {
  const out = prepareImagesForSave({
    commonImages: [{ url: 'https://cdn/c1.jpg', alt: 'x' }, { url: 'https://cdn/c1.jpg' }, { url: 'https://cdn/c2.jpg' }],
    variants: [
      { colorName: 'Pink', images: [{ url: 'https://cdn/p1.jpg' }, { url: 'https://cdn/p2.jpg', isPrimary: true }, { url: 'https://cdn/p3.jpg', isPrimary: true }] },
      { colorName: 'Lavender', images: [{ url: 'https://cdn/l1.jpg' }, { url: 'https://cdn/l2.jpg' }] },
    ],
  });
  assert.deepEqual(out.images, ['https://cdn/c1.jpg', 'https://cdn/c2.jpg']);
  assert.equal(out.commonImages[0].alt, 'x');
  assert.equal(out.variants[0].image, 'https://cdn/p2.jpg');
  assert.equal(out.variants[0].images.filter((i) => i.isPrimary).length, 1);
  assert.equal(out.variants[1].image, 'https://cdn/l1.jpg', 'no primary marked -> the first');
});

test('an older client sending only images + variant.image still works', () => {
  const out = prepareImagesForSave({ images: ['https://cdn/a.jpg'], variants: [{ colorName: 'Pink', image: 'https://cdn/pink.jpg' }] });
  assert.deepEqual(out.commonImages, [{ url: 'https://cdn/a.jpg', alt: '', isPrimary: false }].map(({ isPrimary, ...rest }) => ({ ...rest, isPrimary: false })));
  assert.equal(out.variants[0].images[0].isPrimary, true);
});

test('a partial update that sends no photos leaves them untouched', () => {
  const out = prepareImagesForSave({ name: 'New name' });
  assert.equal(out.commonImages, undefined);
  assert.equal(out.variants, undefined);
});

test('limits: 10 photos per colour, 30 common', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://cdn/${i}.jpg` }));
  assert.throws(() => prepareImagesForSave({ variants: [{ colorName: 'Pink', images: many(11) }] }), /Up to 10 photos per colour \(Pink\)/);
  assert.throws(() => prepareImagesForSave({ commonImages: many(31) }), /Up to 30 common/);
  assert.doesNotThrow(() => prepareImagesForSave({ variants: [{ colorName: 'Pink', images: many(10) }] }));
});

test('withOnePrimary tolerates plain strings and empties', () => {
  assert.deepEqual(withOnePrimary(['https://cdn/a.jpg', '', null]).map((i) => i.url), ['https://cdn/a.jpg']);
});
