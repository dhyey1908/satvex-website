const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { lookupState } = require('./pincodeService');

const originalFetch = global.fetch;

after(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  global.fetch = undefined;
});

function stubFetch(body) {
  global.fetch = async () => ({ json: async () => body });
}

test('lookupState rejects a non-6-digit pincode without ever calling fetch', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return { json: async () => [] };
  };
  await assert.rejects(() => lookupState('12345'), /valid 6-digit pincode/i);
  assert.equal(called, false);
});

test('lookupState resolves the State field on a successful lookup', async () => {
  stubFetch([{ Status: 'Success', PostOffice: [{ State: 'Gujarat', District: 'Rajkot' }] }]);
  const state = await lookupState('360001');
  assert.equal(state, 'Gujarat');
});

test('lookupState returns null for a pincode with no matching post office', async () => {
  stubFetch([{ Status: 'Error', PostOffice: null }]);
  const state = await lookupState('999999');
  assert.equal(state, null);
});

test('lookupState surfaces a clear error when the lookup API itself fails', async () => {
  global.fetch = async () => {
    throw new Error('network down');
  };
  await assert.rejects(() => lookupState('360001'), /could not verify/i);
});
