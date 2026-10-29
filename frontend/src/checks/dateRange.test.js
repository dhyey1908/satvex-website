import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayIST, addDays, presetRanges, formatDay, formatRange, monthGrid, addMonths, matchingPreset } from '../utils/dateRange.js';

test('today is the IST day, not the UTC one', () => {
  assert.equal(todayIST(Date.parse('2026-10-28T18:40:00Z')), '2026-10-29');
  assert.equal(todayIST(Date.parse('2026-10-28T18:00:00Z')), '2026-10-28');
});

test('day arithmetic crosses month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-01');
});

test('presets', () => {
  const p = Object.fromEntries(presetRanges('2026-10-28').map((x) => [x.id, [x.from, x.to]]));
  assert.deepEqual(p.today, ['2026-10-28', '2026-10-28']);
  assert.deepEqual(p.yesterday, ['2026-10-27', '2026-10-27']);
  assert.deepEqual(p.last7, ['2026-10-22', '2026-10-28']);
  assert.deepEqual(p.last30, ['2026-09-29', '2026-10-28']);
  assert.deepEqual(p.thisMonth, ['2026-10-01', '2026-10-28']);
  assert.deepEqual(p.lastMonth, ['2026-09-01', '2026-09-30']);
  assert.equal(matchingPreset('2026-10-22', '2026-10-28', '2026-10-28'), 'last7');
  assert.equal(matchingPreset('2026-10-23', '2026-10-28', '2026-10-28'), null);
});

test('formatting', () => {
  assert.equal(formatDay('2026-10-28'), '28 Oct 2026');
  assert.equal(formatRange('2026-10-12', '2026-10-28'), '12 Oct – 28 Oct 2026');
  assert.equal(formatRange('2025-12-30', '2026-01-02'), '30 Dec 2025 – 02 Jan 2026');
  assert.equal(formatRange('2026-10-28', '2026-10-28'), '28 Oct 2026');
  assert.equal(formatRange('', ''), 'Any date');
  assert.equal(formatRange('2026-10-12', ''), 'From 12 Oct 2026');
});

test('month grid starts on Monday and holds every day of the month', () => {
  const weeks = monthGrid('2026-10-15'); // 1 Oct 2026 is a Thursday
  assert.equal(weeks[0][0].iso, '2026-09-28');
  assert.equal(weeks[0][3].iso, '2026-10-01');
  assert.equal(weeks[0][3].inMonth, true);
  assert.equal(weeks.flat().filter((c) => c.inMonth).length, 31);
  assert.ok(weeks.every((w) => w.length === 7));
});

import { formatShortDateTime } from '../utils/dateRange.js';
import { whatsappLink } from '../utils/whatsapp.js';

test('order time is shown in IST', () => {
  assert.equal(formatShortDateTime('2026-10-28T08:45:00Z'), '28 Oct, 2:15 PM');
  assert.equal(formatShortDateTime(''), '');
});

test('whatsapp links accept 10-digit and +91 numbers', () => {
  assert.equal(whatsappLink('9913685802'), 'https://wa.me/919913685802');
  assert.equal(whatsappLink('+91 99136-85802', 'Hi there'), 'https://wa.me/919913685802?text=Hi%20there');
  assert.equal(whatsappLink('123'), null);
});
