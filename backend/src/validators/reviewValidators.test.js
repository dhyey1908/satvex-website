const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adminCreateReviewSchema } = require('./reviewValidators');

const base = { productId: 'p1', userName: 'Priya S', rating: 5, comment: 'Lovely clip, holds all day.' };

test('admin-entered review: needs a name, a 1-5 rating and a real comment', () => {
  assert.equal(adminCreateReviewSchema.safeParse(base).success, true);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, userName: 'P' }).success, false);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, rating: 6 }).success, false);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, rating: 4.5 }).success, false);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, comment: 'Good' }).success, true);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, comment: '   ' }).success, false);
});

test('admin-entered review: counts as a verified purchase unless the owner unticks it', () => {
  assert.equal(adminCreateReviewSchema.parse(base).verifiedPurchase, true);
  assert.equal(adminCreateReviewSchema.parse({ ...base, verifiedPurchase: false }).verifiedPurchase, false);
});

test('admin-entered review: up to 3 photo URLs', () => {
  const url = 'https://cdn.example.com/satvex/reviews/a.jpg';
  assert.deepEqual(adminCreateReviewSchema.parse(base).images, []);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, images: [url, url, url] }).success, true);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, images: [url, url, url, url] }).success, false);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, images: ['not a url'] }).success, false);
});

test('admin-entered review: the date is optional but must be YYYY-MM-DD', () => {
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, date: '2026-10-20' }).success, true);
  assert.equal(adminCreateReviewSchema.safeParse({ ...base, date: '20/10/2026' }).success, false);
});
