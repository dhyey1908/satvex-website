const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const shiprocketService = require('./shiprocketService');

// The booking calls (AWB, pickup, label) and what they send to Shiprocket.
const realFetch = global.fetch;
const realCreds = [env.shiprocket.email, env.shiprocket.password];
beforeEach(() => {
  env.shiprocket.email = 'api-user@example.com';
  env.shiprocket.password = 'test-password';
});
after(() => {
  global.fetch = realFetch;
  [env.shiprocket.email, env.shiprocket.password] = realCreds;
});

// login -> token; then whatever `reply` returns for the API call, recording what was sent
function stubShiprocket(reply) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 't' }) };
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, status: 200, json: async () => reply };
  };
  return calls;
}

test('the label is asked for with a LIST of shipment ids', async () => {
  const calls = stubShiprocket({ label_created: 1, label_url: 'https://labels.test/1.pdf' });
  const url = await shiprocketService.generateLabel({ shipmentId: '6001' });
  assert.equal(url, 'https://labels.test/1.pdf');
  assert.deepEqual(calls.at(-1).body, { shipment_id: [6001] });
});

test('a refused label carries Shiprocket\'s own reason', async () => {
  stubShiprocket({ label_created: 0, response: 'Shipment not found for label generation', not_created: [6001] });
  await assert.rejects(() => shiprocketService.generateLabel({ shipmentId: 6001 }), (e) => e.code === 'SHIPROCKET_LABEL_FAILED' && /Shipment not found for label generation/.test(e.message));
});

test('the AWB and pickup calls are keyed by the shipment id', async () => {
  let calls = stubShiprocket({ response: { data: { awb_code: 'AWB1', courier_name: 'X', shipment_id: 6001 } } });
  await shiprocketService.assignAwb({ shiprocketOrderId: 5001, shipmentId: 6001 });
  assert.deepEqual(calls.at(-1).body, { shipment_id: 6001 });
  calls = stubShiprocket({ pickup_status: 1 });
  await shiprocketService.schedulePickup({ shiprocketOrderId: 5001, shipmentId: 6001, pickupDate: '2026-11-03' });
  assert.deepEqual(calls.at(-1).body, { shipment_id: [6001], pickup_date: ['2026-11-03'] });
});
