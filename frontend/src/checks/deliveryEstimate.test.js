import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateWindow, deliveryDays } from '../utils/deliveryEstimate.js';

const day0 = new Date(2026, 9, 29); // 29 Oct 2026

test('delivery window uses the admin days, and the config only as the fallback', () => {
  assert.deepEqual(deliveryDays({ dispatchDays: 1, transitDays: 3 }), { dispatchDays: 1, transitDays: 3 });
  assert.deepEqual(deliveryDays(undefined), { dispatchDays: 2, transitDays: 5 });
  assert.deepEqual(deliveryDays({ dispatchDays: 0 }), { dispatchDays: 0, transitDays: 5 }); // 0 is a real value
  assert.match(estimateWindow({ dispatchDays: 1, transitDays: 3 }, day0), /30 Oct.*2 Nov/);
  assert.match(estimateWindow(undefined, day0), /31 Oct.*5 Nov/);
});
