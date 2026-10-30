// buildReviewsView: visibility (verified only by default), breakdown/average
// over all visible reviews, sort, star filter and "load more" paging.
process.env.TABLE_REVIEWS = 'reviews_test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReviewsView } = require('./reviewService');

const mk = (id, rating, day, verified) => ({
  reviewId: id,
  rating,
  createdAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  ...(verified === undefined ? {} : { verifiedPurchase: verified }),
});
const all = [mk('a', 5, 1, true), mk('b', 3, 2, true), mk('c', 5, 3, true), mk('seed1', 5, 4), mk('seed2', 1, 5, false)];

test('by default only verified-purchase reviews are visible; unstamped/seeded rows are hidden', () => {
  const v = buildReviewsView(all);
  assert.deepEqual(v.reviews.map((r) => r.reviewId), ['c', 'b', 'a']);
  assert.equal(v.summary.count, 3);
  assert.equal(v.summary.verifiedCount, 3);
  assert.equal(v.summary.average, 4.3);
  assert.deepEqual(v.summary.breakdown, { 5: 2, 4: 0, 3: 1, 2: 0, 1: 0 });
});

test('a review the admin typed in is shown and counted; verified only if the owner confirmed it', () => {
  const typed = { ...mk('admin__1', 4, 6, false), addedByAdmin: true };
  const confirmed = { ...mk('admin__2', 5, 7, true), addedByAdmin: true };
  const v = buildReviewsView([...all, typed, confirmed]);
  assert.equal(v.summary.count, 5);
  assert.equal(v.summary.verifiedCount, 4);
  assert.equal(v.reviews.find((r) => r.reviewId === 'admin__1').verifiedPurchase, false);
  assert.equal(v.reviews.find((r) => r.reviewId === 'admin__2').verifiedPurchase, true);
  assert.equal(v.reviews.some((r) => r.reviewId === 'seed2'), false);
});

test('showUnverified=true shows everything but only stamped ones are flagged verified', () => {
  const v = buildReviewsView(all, { showUnverified: true });
  assert.equal(v.summary.count, 5);
  assert.equal(v.summary.verifiedCount, 3);
  assert.equal(v.reviews.find((r) => r.reviewId === 'seed1').verifiedPurchase, false);
});

test('sort: recent / highest / lowest', () => {
  assert.deepEqual(buildReviewsView(all, { sort: 'highest' }).reviews.map((r) => r.reviewId), ['c', 'a', 'b']);
  assert.deepEqual(buildReviewsView(all, { sort: 'lowest' }).reviews.map((r) => r.reviewId), ['b', 'c', 'a']);
});

test('star filter narrows the list but the summary still covers every visible review', () => {
  const v = buildReviewsView(all, { rating: 5 });
  assert.deepEqual(v.reviews.map((r) => r.reviewId), ['c', 'a']);
  assert.equal(v.total, 2);
  assert.equal(v.summary.count, 3);
});

test('load more: limit/offset page the filtered list and report hasMore', () => {
  const first = buildReviewsView(all, { limit: 2 });
  assert.equal(first.reviews.length, 2);
  assert.equal(first.hasMore, true);
  const second = buildReviewsView(all, { limit: 2, offset: 2 });
  assert.equal(second.reviews.length, 1);
  assert.equal(second.hasMore, false);
});

test('no reviews: zero summary, empty list', () => {
  const v = buildReviewsView([]);
  assert.deepEqual(v.summary, { count: 0, average: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, verifiedCount: 0 });
  assert.deepEqual(v.reviews, []);
});
