// The colour-based gallery: [selected colour's photos, primary first] + [common photos].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colourSlug, defaultColourId, galleryFor, variantForUrl } from '../utils/colourGallery.js';

const ph = (url, isPrimary = false, alt = '') => ({ url, alt, isPrimary });
const product = {
  name: 'Butterfly',
  displayName: 'Butterfly Claw Clip',
  commonImages: [ph('c1'), ph('c2')],
  variants: [
    { id: 'pink', colorName: 'Pink', isActive: true, inStock: true, images: [ph('p1'), ph('p2', true), ph('p3')] },
    { id: 'lav', colorName: 'Lavender', isActive: true, inStock: true, images: [ph('l1', true), ph('l2')] },
    { id: 'red', colorName: 'Red', isActive: true, inStock: true, images: [] },
    { id: 'blk', colorName: 'Black', isActive: true, inStock: false, images: [ph('b1', true)] },
    { id: 'old', colorName: 'Old', isActive: false, inStock: true, images: [ph('o1', true)] },
  ],
};

test('Pink shows its 3 photos (primary first) then the 2 common ones', () => {
  assert.deepEqual(galleryFor(product, 'pink').urls, ['p2', 'p1', 'p3', 'c1', 'c2']);
});

test('switching to Lavender swaps the colour photos; the common ones stay', () => {
  assert.deepEqual(galleryFor(product, 'lav').urls, ['l1', 'l2', 'c1', 'c2']);
});

test('a colour with no photos shows only the common photos', () => {
  assert.deepEqual(galleryFor(product, 'red').urls, ['c1', 'c2']);
});

test('an unknown colour (or none yet) falls back to the common photos', () => {
  assert.deepEqual(galleryFor(product, null).urls, ['c1', 'c2']);
});

test('an older product (only a plain images list) still shows all of its images', () => {
  const old = { name: 'Old', images: ['a', 'b', 'c'], variants: [{ id: 'v', colorName: 'Pink', images: [] }] };
  assert.deepEqual(galleryFor(old, 'v').urls, ['a', 'b', 'c']);
});

test('the same photo is never listed twice', () => {
  const dup = { ...product, commonImages: [ph('p2'), ph('c1')] };
  assert.deepEqual(galleryFor(dup, 'pink').urls, ['p2', 'p1', 'p3', 'c1']);
});

test('alt text: the photo\'s own, else "SATVEX <product> – <Colour>" / "SATVEX <product>"', () => {
  const p = { ...product, variants: [{ ...product.variants[0], images: [ph('p1', true, 'Pink clip on a model'), ph('p2')] }, ...product.variants.slice(1)] };
  const { altByUrl } = galleryFor(p, 'pink');
  assert.equal(altByUrl.p1, 'Pink clip on a model');
  assert.equal(altByUrl.p2, 'SATVEX Butterfly Claw Clip – Pink');
  assert.equal(altByUrl.c1, 'SATVEX Butterfly Claw Clip');
});

test('default colour: ?color= if valid, else the first active in-stock colour', () => {
  assert.equal(defaultColourId(product.variants, 'lavender'), 'lav');
  assert.equal(defaultColourId(product.variants, 'LAVENDER'), 'lav');
  assert.equal(defaultColourId(product.variants, null), 'pink');
  assert.equal(defaultColourId(product.variants, 'nope'), 'pink');
  assert.equal(defaultColourId(product.variants, 'old'), 'pink', 'an inactive colour in the link is ignored');
  const allOut = product.variants.map((v) => ({ ...v, inStock: false }));
  assert.equal(defaultColourId(allOut, null), 'pink', 'nothing in stock: still show the first active colour');
});

test('colour slugs and mapping a photo back to its colour', () => {
  assert.equal(colourSlug('Light  Pink!'), 'light-pink');
  assert.equal(variantForUrl(product.variants, 'l2').id, 'lav');
  assert.equal(variantForUrl(product.variants, 'c1'), null);
});
