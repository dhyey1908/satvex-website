const test = require('node:test');
const assert = require('node:assert/strict');

const { productSchema, productUpdateSchema, MAX_TESTIMONIAL_VIDEOS } = require('./productValidators');

const baseProduct = {
  name: 'Butterfly',
  slug: 'butterfly',
  shortDescription: 'A clip',
  description: 'A pretty clip',
  basePrice: 249,
  variants: [{ id: 'var_1', name: 'Black', colorName: 'Black', colorCode: '#000000' }],
  sellingOptions: [{ id: 'opt_1', name: 'Single', quantity: 1, price: 149 }],
};

const video = (n) => ({ videoUrl: `https://cdn.example.com/satvex/videos/${n}.mp4` });

test('a product without testimonial videos defaults to an empty list', () => {
  assert.deepEqual(productSchema.parse(baseProduct).testimonialVideos, []);
});

test('testimonial videos keep their order and optional fields', () => {
  const parsed = productSchema.parse({
    ...baseProduct,
    testimonialVideos: [
      { ...video(1), customerName: '  Asha  ', caption: 'Stays all day', thumbnailUrl: 'https://cdn.example.com/t.jpg' },
      { ...video(2), thumbnailUrl: '', customerName: '', caption: '' },
      video(3),
    ],
  });
  assert.equal(parsed.testimonialVideos.length, 3);
  assert.equal(parsed.testimonialVideos[0].customerName, 'Asha');
  assert.ok(parsed.testimonialVideos[1].videoUrl.endsWith('/2.mp4'));
  assert.ok(parsed.testimonialVideos[2].videoUrl.endsWith('/3.mp4'));
});

test(`exactly ${MAX_TESTIMONIAL_VIDEOS} videos are accepted, one more is rejected`, () => {
  const make = (count) => Array.from({ length: count }, (_, i) => video(i));
  assert.equal(
    productSchema.parse({ ...baseProduct, testimonialVideos: make(MAX_TESTIMONIAL_VIDEOS) }).testimonialVideos.length,
    MAX_TESTIMONIAL_VIDEOS
  );
  assert.throws(() => productSchema.parse({ ...baseProduct, testimonialVideos: make(MAX_TESTIMONIAL_VIDEOS + 1) }));
  assert.throws(() => productUpdateSchema.parse({ testimonialVideos: make(MAX_TESTIMONIAL_VIDEOS + 1) }));
});

test('video URLs must be real http(s) URLs', () => {
  for (const bad of ['', 'not a url', 'javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'file:///etc/passwd']) {
    assert.throws(
      () => productSchema.parse({ ...baseProduct, testimonialVideos: [{ videoUrl: bad }] }),
      undefined,
      `should reject ${bad}`
    );
  }
  assert.throws(() =>
    productSchema.parse({ ...baseProduct, testimonialVideos: [{ ...video(1), thumbnailUrl: 'javascript:alert(1)' }] })
  );
});

test('caption and customer name length limits', () => {
  assert.throws(() => productSchema.parse({ ...baseProduct, testimonialVideos: [{ ...video(1), caption: 'x'.repeat(161) }] }));
  assert.throws(() => productSchema.parse({ ...baseProduct, testimonialVideos: [{ ...video(1), customerName: 'x'.repeat(61) }] }));
});

test('a partial update without videos leaves the field untouched', () => {
  const parsed = productUpdateSchema.parse({ name: 'Renamed' });
  assert.equal('testimonialVideos' in parsed, false);
});
