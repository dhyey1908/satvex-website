import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_IMAGE_BYTES, renamedFor, shrinkSteps, fitImage } from '../utils/fitImage.js';

const MB = 1024 * 1024;

test('limit is 10 MB', () => assert.equal(MAX_IMAGE_BYTES, 10 * MB));

test('renamedFor matches the re-encoded type', () => {
  assert.equal(renamedFor('photo.png', 'image/webp'), 'photo.webp');
  assert.equal(renamedFor('my.pic.JPEG', 'image/jpeg'), 'my.pic.jpg');
  assert.equal(renamedFor('noext', 'image/jpeg'), 'noext.jpg');
});

test('shrinkSteps start near the limit, only ever get smaller, and stop above zero', () => {
  const steps = shrinkSteps(40 * MB);
  assert.ok(steps[0].scale < 0.5 && steps[0].scale > 0.4); // sqrt(10/40)*0.95
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].scale <= steps[i - 1].scale);
  assert.ok(steps.at(-1).scale > 0);
  assert.equal(shrinkSteps(11 * MB)[0].scale < 1, true);
});

test('a photo already within the limit is returned untouched (even above the old 5 MB)', async () => {
  const file = { size: 8 * MB, type: 'image/jpeg', name: 'a.jpg' };
  assert.equal(await fitImage(file), file);
});
