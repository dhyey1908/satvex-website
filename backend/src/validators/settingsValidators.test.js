const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateSettingsSchema } = require('./settingsValidators');

function baseAnnouncement(overrides = {}) {
  return { id: 'a1', message: 'Free shipping on eligible orders', isActive: true, ...overrides };
}

test('announcements: accepts up to 5', () => {
  const announcements = Array.from({ length: 5 }, (_, i) => baseAnnouncement({ id: `a${i}` }));
  const result = updateSettingsSchema.parse({ announcements });
  assert.equal(result.announcements.length, 5);
});

test('announcements: rejects more than 5', () => {
  const announcements = Array.from({ length: 6 }, (_, i) => baseAnnouncement({ id: `a${i}` }));
  assert.throws(() => updateSettingsSchema.parse({ announcements }));
});

test('announcements: message is required and capped at 140 chars', () => {
  assert.throws(() => updateSettingsSchema.parse({ announcements: [baseAnnouncement({ message: '' })] }));
  assert.throws(() => updateSettingsSchema.parse({ announcements: [baseAnnouncement({ message: 'x'.repeat(141) })] }));
});

test('announcements: link, couponCode, startDate, endDate are all optional', () => {
  const result = updateSettingsSchema.parse({ announcements: [baseAnnouncement()] });
  assert.equal(result.announcements[0].link, undefined);
  assert.equal(result.announcements[0].couponCode, undefined);
});

test('announcements: startDate/endDate must be YYYY-MM-DD when given', () => {
  assert.throws(() => updateSettingsSchema.parse({ announcements: [baseAnnouncement({ startDate: '10/11/2026' })] }));
  const result = updateSettingsSchema.parse({ announcements: [baseAnnouncement({ startDate: '2026-10-11', endDate: '2026-12-31' })] });
  assert.equal(result.announcements[0].startDate, '2026-10-11');
});
