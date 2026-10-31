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

// ---- lookupPincode: what the address check relies on
const { lookupPincode, clearPincodeCache } = require('./pincodeService');

test('lookupPincode: an existing pincode is "found" with its state', async () => {
  clearPincodeCache();
  stubFetch([{ Status: 'Success', PostOffice: [{ State: 'Gujarat', District: 'Rajkot' }] }]);
  assert.deepEqual(await lookupPincode('360004'), { status: 'found', state: 'Gujarat', district: 'Rajkot', places: ['Rajkot'] });
});

test('lookupPincode: only an explicit "No records found" means the pincode does not exist', async () => {
  clearPincodeCache();
  stubFetch([{ Message: 'No records found', Status: 'Error', PostOffice: null }]);
  assert.deepEqual(await lookupPincode('999999'), { status: 'not_found' });
  assert.deepEqual(await lookupPincode('12345'), { status: 'not_found' }); // not even 6 digits
});

test('lookupPincode: a failing or odd answer is "unknown" - never a reason to refuse an order - and is not remembered', async () => {
  clearPincodeCache();
  global.fetch = async () => { throw new Error('network down'); };
  assert.deepEqual(await lookupPincode('360004'), { status: 'unknown' });
  stubFetch([{ Status: 'Error', Message: 'Too many requests', PostOffice: null }]);
  assert.deepEqual(await lookupPincode('360004'), { status: 'unknown' });
  stubFetch([{ Status: 'Success', PostOffice: [{ State: 'Gujarat', District: 'Rajkot' }] }]);
  assert.equal((await lookupPincode('360004')).status, 'found'); // the earlier failures were not cached
});

test('lookupPincode: answers are remembered, so checkout does not call the lookup API every time', async () => {
  clearPincodeCache();
  let calls = 0;
  global.fetch = async () => { calls += 1; return { json: async () => [{ Status: 'Success', PostOffice: [{ State: 'Gujarat', District: 'Rajkot' }] }] }; };
  await lookupPincode('360004');
  await lookupPincode('360004');
  assert.equal(calls, 1);
});
