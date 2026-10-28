const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toPaise, fromPaise, percentOf, lineSubtotal } = require('./money');

test('toPaise/fromPaise round-trip without float noise', () => {
  assert.equal(toPaise(87.91), 8791);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(fromPaise(17582), 175.82);
  assert.equal(String(fromPaise(17582)), '175.82');
});

test('percentOf rounds once, to a whole paisa', () => {
  assert.equal(percentOf(20000, 18), 3600);
  assert.equal(percentOf(8791, 18), 1582); // 1582.38
  assert.equal(percentOf(125, 18), 23); // 22.5 rounds up
});

test('lineSubtotal never leaks float error', () => {
  assert.equal(lineSubtotal(19.99, 3), 59.97); // 19.99*3 = 59.96999999999999 in floats
  assert.equal(lineSubtotal(87.91, 2), 175.82);
  assert.equal(lineSubtotal(249, 1), 249);
});
