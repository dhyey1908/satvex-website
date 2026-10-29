const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const couponService = require('./couponService');
const settingsService = require('./settingsService');

const originalFindByCode = couponService.findByCode;
after(() => {
  couponService.findByCode = originalFindByCode;
});

function announcement(overrides = {}) {
  return { id: 'a1', message: 'Free shipping', isActive: true, ...overrides };
}

test('getActiveAnnouncements: excludes inactive announcements', async () => {
  const result = await settingsService.getActiveAnnouncements([announcement({ isActive: false })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: excludes announcements before their startDate', async () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = await settingsService.getActiveAnnouncements([announcement({ startDate: future })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: excludes announcements after their endDate', async () => {
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = await settingsService.getActiveAnnouncements([announcement({ endDate: past })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: includes an announcement with no coupon', async () => {
  const result = await settingsService.getActiveAnnouncements([announcement()]);
  assert.equal(result.length, 1);
});

test('getActiveAnnouncements: excludes an announcement whose coupon does not exist', async () => {
  couponService.findByCode = async () => null;
  const result = await settingsService.getActiveAnnouncements([announcement({ couponCode: 'NOPE' })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: excludes an announcement whose coupon is inactive', async () => {
  couponService.findByCode = async () => ({ code: 'DEAD', isActive: false });
  const result = await settingsService.getActiveAnnouncements([announcement({ couponCode: 'DEAD' })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: excludes an announcement whose coupon has expired', async () => {
  couponService.findByCode = async () => ({ code: 'OLD', isActive: true, expiresAt: '2020-01-01T00:00:00.000Z' });
  const result = await settingsService.getActiveAnnouncements([announcement({ couponCode: 'OLD' })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: excludes an announcement whose coupon is exhausted', async () => {
  couponService.findByCode = async () => ({ code: 'FULL', isActive: true, usageLimit: 10, usageCount: 10 });
  const result = await settingsService.getActiveAnnouncements([announcement({ couponCode: 'FULL' })]);
  assert.deepEqual(result, []);
});

test('getActiveAnnouncements: includes an announcement whose coupon is genuinely valid', async () => {
  couponService.findByCode = async () => ({ code: 'SATVEX10', isActive: true, usageLimit: 100, usageCount: 5 });
  const result = await settingsService.getActiveAnnouncements([announcement({ couponCode: 'SATVEX10' })]);
  assert.equal(result.length, 1);
});

test('schedules follow the IST calendar day, and banners honour them', () => {
  const settingsService = require('./settingsService');
  // 21 Oct 2026 23:30 IST = 18:00 UTC; 22 Oct 00:10 IST = 18:40 UTC on the 21st.
  assert.equal(settingsService.istToday(Date.parse('2026-10-21T18:00:00Z')), '2026-10-21');
  assert.equal(settingsService.istToday(Date.parse('2026-10-21T18:40:00Z')), '2026-10-22');
  const banners = [
    { id: 'a', isActive: true, endDate: '2026-10-21' },
    { id: 'b', isActive: true, startDate: '2026-10-25' },
    { id: 'c', isActive: false },
    { id: 'd', isActive: true },
  ];
  const ids = (now) => settingsService.activeBanners(banners, Date.parse(now)).map((b) => b.id);
  assert.deepEqual(ids('2026-10-21T18:00:00Z'), ['a', 'd']);
  assert.deepEqual(ids('2026-10-21T18:40:00Z'), ['d']);
  assert.deepEqual(ids('2026-10-25T01:00:00Z'), ['b', 'd']);
});
