const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const settingsService = require('./settingsService');
const shiprocketService = require('./shiprocketService');
const deliveryCheckService = require('./deliveryCheckService');

const originals = [settingsService, shiprocketService].map((m) => [m, { ...m }]);
afterEach(() => {
  originals.forEach(([m, o]) => Object.assign(m, o));
  deliveryCheckService.clearDeliveryCheckCache();
});

// Delhi as Shiprocket really answered it: the air courier is fastest, the surface one cheapest.
const couriers = [
  { courier_name: 'DTDC Air 500gm', etd: 'Nov 05, 2026', estimated_delivery_days: 2, freight_charge: 103.92, cod: 1 },
  { courier_name: 'Xpressbees Surface', etd: 'Nov 08, 2026', estimated_delivery_days: 5, freight_charge: 60.72, cod: 1 },
];

function stub(rule) {
  settingsService.getSettings = async () => ({ shiprocket: { enabled: true, pickupPincode: '360004' }, shipping: rule ? { courierSelectionRule: rule } : {} });
  shiprocketService.getServiceabilityRaw = async () => ({ data: { available_courier_companies: couriers } });
}

test('the delivery date is the cheapest courier\'s, not the fastest air courier\'s', async () => {
  stub('lowest_rate');
  const r = await deliveryCheckService.checkPincode('110001');
  assert.deepEqual([r.courierName, r.deliveryBy], ['Xpressbees Surface', '2026-11-08']);
});

test('with no rule saved the cheapest courier is used', async () => {
  stub(null);
  assert.equal((await deliveryCheckService.checkPincode('110001')).courierName, 'Xpressbees Surface');
});

test('when the admin chooses "fastest" the date follows that courier instead', async () => {
  stub('fastest');
  const r = await deliveryCheckService.checkPincode('110001');
  assert.deepEqual([r.courierName, r.deliveryBy], ['DTDC Air 500gm', '2026-11-05']);
});
