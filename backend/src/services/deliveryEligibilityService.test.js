const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const settingsService = require('./settingsService');
const pincodeService = require('./pincodeService');
const { isDeliverable, assertDeliverable } = require('./deliveryEligibilityService');

const originalGetSettings = settingsService.getSettings;
const originalLookupState = pincodeService.lookupState;

after(() => {
  settingsService.getSettings = originalGetSettings;
  pincodeService.lookupState = originalLookupState;
});

beforeEach(() => {
  pincodeService.lookupState = async () => {
    throw new Error('lookupState should not be called when the feature is off');
  };
});

test('feature disabled (default): every pincode is deliverable, state lookup never runs', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: false, enabledStates: [] } });
  const result = await isDeliverable('360001');
  assert.deepEqual(result, { deliverable: true, state: null });
});

test('feature disabled when delivery settings are entirely absent (pre-migration default)', async () => {
  settingsService.getSettings = async () => ({});
  const result = await isDeliverable('360001');
  assert.equal(result.deliverable, true);
});

test('feature enabled: a state present in enabledStates is deliverable', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: true, enabledStates: ['Gujarat', 'Kerala'] } });
  pincodeService.lookupState = async () => 'Gujarat';
  const result = await isDeliverable('360001');
  assert.deepEqual(result, { deliverable: true, state: 'Gujarat' });
});

test('feature enabled: a state NOT in enabledStates is not deliverable (disabled by default)', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: true, enabledStates: ['Kerala'] } });
  pincodeService.lookupState = async () => 'Gujarat';
  const result = await isDeliverable('360001');
  assert.deepEqual(result, { deliverable: false, state: 'Gujarat' });
});

test('matching is case-insensitive', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: true, enabledStates: ['gujarat'] } });
  pincodeService.lookupState = async () => 'Gujarat';
  const result = await isDeliverable('360001');
  assert.equal(result.deliverable, true);
});

test('an unresolvable pincode is never treated as deliverable, even with the feature on', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: true, enabledStates: ['Gujarat'] } });
  pincodeService.lookupState = async () => null;
  const result = await isDeliverable('999999');
  assert.deepEqual(result, { deliverable: false, state: null });
});

test('assertDeliverable throws an AppError naming the disabled state', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: true, enabledStates: ['Kerala'] } });
  pincodeService.lookupState = async () => 'Gujarat';
  await assert.rejects(
    () => assertDeliverable('360001'),
    (err) => {
      assert.equal(err.code, 'PINCODE_NOT_SERVICEABLE');
      assert.match(err.message, /Gujarat/);
      return true;
    }
  );
});

test('assertDeliverable resolves without throwing for an enabled state', async () => {
  settingsService.getSettings = async () => ({ delivery: { enabled: true, enabledStates: ['Gujarat'] } });
  pincodeService.lookupState = async () => 'Gujarat';
  await assertDeliverable('360001');
});
