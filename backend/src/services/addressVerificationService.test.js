const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const shiprocketService = require('./shiprocketService');
const settingsService = require('./settingsService');
const pincodeService = require('./pincodeService');
const deliveryEligibilityService = require('./deliveryEligibilityService');
const deliveryCheckService = require('./deliveryCheckService');
const { verifyAddress } = require('./addressVerificationService');

const modules = [shiprocketService, settingsService, pincodeService, deliveryEligibilityService];
const originals = modules.map((m) => [m, { ...m }]);
afterEach(() => originals.forEach(([m, o]) => Object.assign(m, o)));

const address = { line1: '12 Test Heights', landmark: 'Near City Mall', city: 'Rajkot', state: 'Gujarat', pincode: '360004', country: 'India' };
const courier = (over = {}) => ({ courier_name: 'Delhivery', etd: 'Nov 05, 2026', freight_charge: 60, cod: 1, ...over });

let serviceability; // (cod) => response | throws
let calls;
beforeEach(() => {
  deliveryCheckService.clearDeliveryCheckCache();
  calls = [];
  serviceability = (cod) => ({ data: { available_courier_companies: [courier({ cod: cod ? 1 : 0 })] } });
  settingsService.getSettings = async () => ({ shiprocket: { enabled: true, pickupPincode: '360001' } });
  deliveryEligibilityService.isDeliverable = async () => ({ deliverable: true, state: null });
  pincodeService.lookupPincode = async () => ({ status: 'found', state: 'Gujarat', district: 'Rajkot', places: ['Rajkot', 'Rajkot HO', 'Kalawad Road'] });
  shiprocketService.getServiceabilityRaw = async (args) => {
    calls.push(args);
    return serviceability(args.cod);
  };
});

test('a correct address passes, with the delivery date from the fastest courier', async () => {
  const result = await verifyAddress(address, { paymentMethod: 'COD' });
  assert.deepEqual(result, { deliveryNotVerified: false, deliveryEta: '2026-11-05' });
});

test('Shiprocket is asked from OUR pickup pincode, with the default 0.1 kg parcel, once for prepaid and once for COD', async () => {
  await verifyAddress(address, { paymentMethod: 'Online' });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.cod).sort(), [false, true]);
  for (const c of calls) {
    assert.equal(c.pickupPostcode, '360001');
    assert.equal(c.deliveryPostcode, '360004');
    assert.equal(c.weightKg, 0.1);
  }
});

test('a city that does not belong to the pincode is refused, naming the district to use', async () => {
  await assert.rejects(
    () => verifyAddress({ ...address, city: 'Surat' }),
    (err) => err.code === 'CITY_MISMATCH' && err.message === "City doesn't match this pincode. Did you mean Rajkot?" && err.details.suggestion === 'Rajkot'
  );
});

test('a small typo in the city, or a different case/spacing, still passes', async () => {
  for (const city of ['rajkot', 'RAJ KOT', 'Rajkott', 'Kalawad Road']) {
    await verifyAddress({ ...address, city }); // does not throw
  }
});

test('the lookup service being down lets the address through (never blocks an order)', async () => {
  pincodeService.lookupPincode = async () => ({ status: 'unknown' });
  const result = await verifyAddress({ ...address, city: 'Anything Town' });
  assert.equal(result.deliveryNotVerified, false); // the courier check still worked
});

test('a pincode that does not exist is refused', async () => {
  pincodeService.lookupPincode = async () => ({ status: 'not_found' });
  await assert.rejects(() => verifyAddress(address), (err) => err.code === 'PINCODE_NOT_FOUND');
});

test('the state must be the pincode’s real state', async () => {
  await assert.rejects(() => verifyAddress({ ...address, state: 'Maharashtra' }), (err) => err.code === 'ADDRESS_STATE_MISMATCH');
});

test('a pincode no courier delivers to is refused: "Sorry, we don\'t deliver to this pincode yet."', async () => {
  serviceability = () => ({ data: { available_courier_companies: [] } });
  await assert.rejects(
    () => verifyAddress(address, { paymentMethod: 'Online' }),
    (err) => err.code === 'NO_COURIER' && err.message === "Sorry, we don't deliver to this pincode yet."
  );
});

test('Shiprocket answering "not serviceable" with a 404 also means no courier', async () => {
  serviceability = () => {
    const e = new Error('no courier');
    e.upstreamStatus = 404;
    throw e;
  };
  await assert.rejects(() => verifyAddress(address), (err) => err.code === 'NO_COURIER');
});

test('a pincode with no COD courier: COD is refused, prepaid is fine', async () => {
  serviceability = (cod) => ({ data: { available_courier_companies: cod ? [] : [courier({ cod: 0 })] } });
  await assert.rejects(
    () => verifyAddress(address, { paymentMethod: 'COD' }),
    (err) => err.code === 'COD_NOT_AVAILABLE' && err.message === "COD isn't available for this pincode."
  );
  const prepaid = await verifyAddress(address, { paymentMethod: 'Online' });
  assert.equal(prepaid.deliveryNotVerified, false);
});

test('Shiprocket down or slow: the address is allowed and flagged "delivery not verified"', async () => {
  serviceability = () => {
    throw new Error('The operation was aborted due to timeout');
  };
  assert.deepEqual(await verifyAddress(address, { paymentMethod: 'COD' }), { deliveryNotVerified: true, deliveryEta: null });
  // an unexpected reply is "could not verify" too, not "does not deliver"
  serviceability = () => ({ message: 'something odd' });
  assert.equal((await verifyAddress(address)).deliveryNotVerified, true);
});

test('Shiprocket switched off in settings: allowed and flagged', async () => {
  settingsService.getSettings = async () => ({ shiprocket: { enabled: false, pickupPincode: '360001' } });
  assert.equal((await verifyAddress(address)).deliveryNotVerified, true);
  assert.equal(calls.length, 0);
});

test('answers are cached per pincode (the second order does not call Shiprocket again); an outage is never cached', async () => {
  await verifyAddress(address);
  const first = calls.length;
  await verifyAddress(address);
  assert.equal(calls.length, first);

  deliveryCheckService.clearDeliveryCheckCache();
  serviceability = () => {
    throw new Error('down');
  };
  assert.equal((await verifyAddress(address)).deliveryNotVerified, true);
  serviceability = (cod) => ({ data: { available_courier_companies: [courier({ cod: cod ? 1 : 0 })] } });
  assert.equal((await verifyAddress(address)).deliveryNotVerified, false); // asked again, not stuck on the outage
});

test('delivery date: etd date, else estimated days, else the number in etd', () => {
  assert.equal(deliveryCheckService.deliveryDateFor({ etd: 'Nov 05, 2026' }), '2026-11-05');
  const inDays = (n) => new Date(Date.now() + 5.5 * 3600000 + n * 86400000).toISOString().slice(0, 10);
  assert.equal(deliveryCheckService.deliveryDateFor({ etd: '', estimated_delivery_days: '3' }), inDays(3));
  assert.equal(deliveryCheckService.deliveryDateFor({ etd: '4 days' }), inDays(4));
  assert.equal(deliveryCheckService.deliveryDateFor({ etd: '' }), null);
  assert.equal(deliveryCheckService.deliveryDateFor(null), null);
});
