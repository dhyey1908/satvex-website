// Plain node:test — no test framework dependency exists in this project yet,
// and adding one just for this would be disproportionate. Run with:
//   node --test src/services/gokwikService.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertValidOrderTotal } = require('./gokwikService');

// This guards exactly the bug we hit: GoKwik's order/create returning 200
// with no usable `total`, which otherwise let checkout proceed straight to
// a payment widget silently showing "Amount to Pay: null".
test('assertValidOrderTotal throws when total is missing', () => {
  assert.throws(() => assertValidOrderTotal({ gokwik_oid: 'KWIK123' }), /GOKWIK_INVALID_TOTAL|valid order amount/);
});

test('assertValidOrderTotal throws when total is null', () => {
  assert.throws(() => assertValidOrderTotal({ total: null }), /GOKWIK_INVALID_TOTAL|valid order amount/);
});

test('assertValidOrderTotal throws when total is a non-numeric string', () => {
  assert.throws(() => assertValidOrderTotal({ total: 'null' }), /GOKWIK_INVALID_TOTAL|valid order amount/);
});

// Regression test for the real bug: GoKwik's sandbox order/create genuinely
// returns total as a formatted decimal string, e.g. {"total":"1.0000"} —
// confirmed live 2026-10-09. This must NOT throw; it's a valid amount, just
// string-typed.
test('assertValidOrderTotal accepts GoKwik\'s real "1.0000"-style numeric string', () => {
  assert.doesNotThrow(() => assertValidOrderTotal({ total: '1.0000' }));
  assert.doesNotThrow(() => assertValidOrderTotal({ total: '236.50' }));
});

test('assertValidOrderTotal throws when total is NaN/Infinity', () => {
  assert.throws(() => assertValidOrderTotal({ total: NaN }), /GOKWIK_INVALID_TOTAL|valid order amount/);
  assert.throws(() => assertValidOrderTotal({ total: Infinity }), /GOKWIK_INVALID_TOTAL|valid order amount/);
});

test('assertValidOrderTotal does not throw for a valid numeric total', () => {
  assert.doesNotThrow(() => assertValidOrderTotal({ total: 1 }));
  assert.doesNotThrow(() => assertValidOrderTotal({ total: 236.5 }));
  assert.doesNotThrow(() => assertValidOrderTotal({ total: 0 }));
});
