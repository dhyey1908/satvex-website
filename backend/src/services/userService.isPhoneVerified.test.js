const { test } = require('node:test');
const assert = require('node:assert/strict');
const userService = require('./userService');

const DAY_MS = 24 * 60 * 60 * 1000;

test('isPhoneVerified: true for a matching phone verified recently', () => {
  const user = { verifiedPhone: '9876543210', phoneVerifiedAt: new Date().toISOString() };
  assert.equal(userService.isPhoneVerified(user, '9876543210'), true);
});

test('isPhoneVerified: false when the phone differs from verifiedPhone', () => {
  const user = { verifiedPhone: '9876543210', phoneVerifiedAt: new Date().toISOString() };
  assert.equal(userService.isPhoneVerified(user, '9999999999'), false);
});

test('isPhoneVerified: false when verification is older than 30 days', () => {
  const user = { verifiedPhone: '9876543210', phoneVerifiedAt: new Date(Date.now() - 31 * DAY_MS).toISOString() };
  assert.equal(userService.isPhoneVerified(user, '9876543210'), false);
});

test('isPhoneVerified: true just under the 30-day boundary', () => {
  const user = { verifiedPhone: '9876543210', phoneVerifiedAt: new Date(Date.now() - 29 * DAY_MS).toISOString() };
  assert.equal(userService.isPhoneVerified(user, '9876543210'), true);
});

test('isPhoneVerified: false when the user has never verified a phone', () => {
  const user = { name: 'Jane Doe' };
  assert.equal(userService.isPhoneVerified(user, '9876543210'), false);
});

test('isPhoneVerified: false for a null/undefined user', () => {
  assert.equal(userService.isPhoneVerified(null, '9876543210'), false);
  assert.equal(userService.isPhoneVerified(undefined, '9876543210'), false);
});
