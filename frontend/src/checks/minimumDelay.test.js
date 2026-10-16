import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingMs, waitForMinimum, GRACE_MS, MIN_VISIBLE_MS, MIN_ACTION_MS } from '../utils/minimumDelay.js';

test('remainingMs: nothing left once the loader has been up long enough', () => {
  assert.equal(remainingMs(1000, 800, 1800), 0);
  assert.equal(remainingMs(1000, 800, 5000), 0);
});

test('remainingMs: tops up a fast operation to the minimum, never beyond it', () => {
  assert.equal(remainingMs(1000, 800, 1200), 600);
  assert.equal(remainingMs(1000, 800, 1000), 800);
});

test('remainingMs: a loader that was never shown owes nothing', () => {
  assert.equal(remainingMs(null, 800, 1234), 0);
  assert.equal(remainingMs(undefined, 800, 1234), 0);
});

test('waitForMinimum: waits only for the shortfall', async () => {
  const slept = [];
  await waitForMinimum(1000, 900, { now: () => 1300, sleep: async (ms) => slept.push(ms) });
  assert.deepEqual(slept, [600]);
});

test('waitForMinimum: adds NO delay when the action was already slow enough', async () => {
  const slept = [];
  await waitForMinimum(1000, 900, { now: () => 3000, sleep: async (ms) => slept.push(ms) });
  assert.deepEqual(slept, []);
});

test('the configured numbers match the brief (minimum 800-1000 ms, short grace)', () => {
  assert.ok(MIN_VISIBLE_MS >= 800 && MIN_VISIBLE_MS <= 1000);
  assert.ok(MIN_ACTION_MS >= 800 && MIN_ACTION_MS <= 1000);
  assert.ok(GRACE_MS > 0 && GRACE_MS < 300);
});
