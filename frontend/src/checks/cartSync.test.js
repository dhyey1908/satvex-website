import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRequestId, intentKey, bagCount, createSequencer } from '../utils/cartSync.js';

test('every click gets its own request id, in UUID form (the server uses it to add once)', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('the same selection is one intent whatever order the colours were picked in; different ones are different', () => {
  const a = intentKey({ productId: 'p', sellingOptionId: 'o', selectedColors: ['x', 'y'] });
  assert.equal(a, intentKey({ productId: 'p', sellingOptionId: 'o', selectedColors: ['y', 'x'] }));
  assert.notEqual(a, intentKey({ productId: 'p', sellingOptionId: 'o', selectedColors: ['x', 'z'] }));
  assert.notEqual(a, intentKey({ productId: 'p', sellingOptionId: 'o2', selectedColors: ['x', 'y'] }));
  assert.notEqual(a, intentKey({ productId: 'q', sellingOptionId: 'o', selectedColors: ['x', 'y'] }));
});

test('the bag count is the sum of the quantities (a combo is one per quantity), plus adds still on their way', () => {
  assert.equal(bagCount([]), 0);
  assert.equal(bagCount([{ quantity: 1 }, { quantity: 2 }]), 3); // a Combo of 3 x 2 would be 2, never 6 pieces
  assert.equal(bagCount([{ quantity: 1 }], 2), 3); // the badge goes up at once for an add still being sent
  assert.equal(bagCount([{ quantity: '2' }, {}]), 2);
});

test('a response that finishes late is ignored: only the newest-started answer wins', () => {
  const s = createSequencer();
  const first = s.start(); // a slow read
  const second = s.start(); // an add started later
  assert.equal(s.accept(second), true); // the add answers first
  assert.equal(s.accept(first), false); // the older read lands afterwards and must NOT overwrite it
  const third = s.start();
  assert.equal(s.accept(third), true);
  s.reset();
  assert.equal(s.accept(s.start()), true); // logging out / in starts clean
});
