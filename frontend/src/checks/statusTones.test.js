import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toneFor, scheduleState, TONES } from '../utils/statusTones.js';

test('badge colours follow the spec', () => {
  assert.equal(toneFor('order', 'Pending'), 'amber');
  assert.equal(toneFor('order', 'Processing'), 'blue');
  assert.equal(toneFor('order', 'Shipped'), 'indigo');
  assert.equal(toneFor('order', 'Delivered'), 'green');
  assert.equal(toneFor('order', 'Cancelled'), 'red');
  assert.equal(toneFor('payment', 'expired'), 'red');
  assert.equal(toneFor('payment', 'paid'), 'green');
  assert.equal(toneFor('shipment', 'order_created'), 'blue');
  assert.equal(toneFor('shipment', 'not_created'), 'grey');
  assert.equal(toneFor('contact', 'open'), 'amber');
  assert.equal(toneFor('contact', 'resolved'), 'green');
  assert.equal(toneFor('order', 'nonsense'), 'grey');
  for (const t of Object.values({ a: toneFor('order', 'Pending') })) assert.ok(TONES.includes(t));
});

test('a schedule that ended is Expired, one that has not started is Scheduled, a switched-off one is Off', () => {
  const today = '2026-10-28';
  assert.equal(scheduleState({ isActive: true, endDate: '2026-10-21' }, today), 'expired');
  assert.equal(scheduleState({ isActive: true, startDate: '2026-11-01' }, today), 'scheduled');
  assert.equal(scheduleState({ isActive: true, startDate: '2026-10-28', endDate: '2026-10-28' }, today), 'live');
  assert.equal(scheduleState({ isActive: false }, today), 'off');
  assert.equal(scheduleState({ isActive: true }, today), 'live');
});
