const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerSchema, loginSchema } = require('./authValidators');

test('registerSchema: accepts email only (phone omitted)', () => {
  const result = registerSchema.parse({ name: 'Jane Doe', email: 'jane@example.com', password: 'password123' });
  assert.equal(result.email, 'jane@example.com');
});

test('registerSchema: accepts phone only (email omitted)', () => {
  const result = registerSchema.parse({ name: 'Jane Doe', phone: '9876543210', password: 'password123' });
  assert.equal(result.phone, '9876543210');
});

test('registerSchema: rejects when neither email nor phone is given', () => {
  assert.throws(() => registerSchema.parse({ name: 'Jane Doe', password: 'password123' }));
});

test('registerSchema: rejects when email and phone are both empty strings', () => {
  assert.throws(() => registerSchema.parse({ name: 'Jane Doe', email: '', phone: '', password: 'password123' }));
});

test('loginSchema: accepts an email-shaped identifier', () => {
  const result = loginSchema.parse({ identifier: 'jane@example.com', password: 'x' });
  assert.equal(result.identifier, 'jane@example.com');
});

test('loginSchema: accepts a phone-shaped identifier', () => {
  const result = loginSchema.parse({ identifier: '9876543210', password: 'x' });
  assert.equal(result.identifier, '9876543210');
});

test('loginSchema: rejects an empty identifier', () => {
  assert.throws(() => loginSchema.parse({ identifier: '', password: 'x' }));
});
