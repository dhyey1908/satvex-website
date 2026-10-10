const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const provider = require('./shiprocketProvider');

const originalMode = env.shiprocket.mode;
const originalEmail = env.shiprocket.email;
const originalPassword = env.shiprocket.password;
const originalFetch = global.fetch;
after(() => {
  env.shiprocket.mode = originalMode;
  env.shiprocket.email = originalEmail;
  env.shiprocket.password = originalPassword;
  global.fetch = originalFetch;
});

function failIfCalled() {
  global.fetch = async () => {
    throw new Error('fetch should never be called in mock mode');
  };
}

test('mock mode: full create -> AWB -> pickup -> label chain, no network', async () => {
  env.shiprocket.mode = 'mock';
  failIfCalled();

  const created = await provider.createOrder({ orderId: 'ORDER-1', orderItems: [] });
  assert.equal(created.order_id, 'MOCK-SR-ORDER-1');

  const awb = await provider.assignAwb({ shiprocketOrderId: created.order_id });
  assert.ok(awb.awbCode);
  assert.ok(awb.shipmentId);

  await provider.schedulePickup({ shiprocketOrderId: created.order_id, pickupDate: '2026-01-01' });

  const labelUrl = await provider.generateLabel({ shipmentId: awb.shipmentId });
  assert.match(labelUrl, /^https:\/\/mock\.local\/labels\//);
});

test('mock mode: unserviceable pincode returns an empty courier list', async () => {
  env.shiprocket.mode = 'mock';
  failIfCalled();
  const couriers = await provider.getServiceability({ pickupPostcode: '400001', deliveryPostcode: '000000', weightKg: 0.5, cod: false });
  assert.deepEqual(couriers, []);
});

test('mock mode: failure markers propagate at each step', async () => {
  env.shiprocket.mode = 'mock';
  failIfCalled();
  await assert.rejects(() => provider.createOrder({ orderId: 'MOCKFAIL_CREATE-1' }), /SHIPROCKET_ORDER_CREATE_FAILED|simulated/);
  await assert.rejects(() => provider.assignAwb({ shiprocketOrderId: 'MOCKFAIL_AWB' }), /SHIPROCKET_AWB_FAILED|simulated/);
  await assert.rejects(() => provider.schedulePickup({ shiprocketOrderId: 'MOCKFAIL_PICKUP' }), /SHIPROCKET_PICKUP_FAILED|simulated/);
  await assert.rejects(() => provider.generateLabel({ shipmentId: 'MOCKFAIL_LABEL' }), /SHIPROCKET_LABEL_FAILED|simulated/);
});

test('live mode: createOrder -> assignAwb parse real-shaped HTTP responses (network mocked)', async () => {
  env.shiprocket.mode = 'live';
  env.shiprocket.email = 'mock-api-user@example.com';
  env.shiprocket.password = 'mock-password';
  let call = 0;
  global.fetch = async (url) => {
    call += 1;
    if (url.includes('/auth/login')) {
      return { ok: true, json: async () => ({ token: 'REAL-TOKEN' }) };
    }
    if (url.includes('/orders/create/adhoc')) {
      return { ok: true, json: async () => ({ order_id: 999001, status: 'NEW' }) };
    }
    if (url.includes('/courier/assign/awb')) {
      // Confirmed real nesting: response.data.{courier_name,awb_code}
      return { ok: true, json: async () => ({ response: { data: { courier_name: 'Delhivery Surface', awb_code: 'AWB999', shipment_id: 888001 } } }) };
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };

  const created = await provider.createOrder({ orderId: 'ORDER-1', orderItems: [] });
  assert.equal(created.order_id, 999001);

  const awb = await provider.assignAwb({ shiprocketOrderId: created.order_id });
  assert.equal(awb.awbCode, 'AWB999');
  assert.equal(awb.courierName, 'Delhivery Surface');
  assert.ok(call >= 3);
});

test('live mode: a failed order/create (no order_id) throws SHIPROCKET_ORDER_CREATE_FAILED', async () => {
  env.shiprocket.mode = 'live';
  env.shiprocket.email = 'mock-api-user@example.com';
  env.shiprocket.password = 'mock-password';
  global.fetch = async (url) => {
    if (url.includes('/auth/login')) return { ok: true, json: async () => ({ token: 'REAL-TOKEN' }) };
    return { ok: true, json: async () => ({ message: 'Pickup location invalid.' }) };
  };
  await assert.rejects(() => provider.createOrder({ orderId: 'ORDER-2', orderItems: [] }), (err) => err.code === 'SHIPROCKET_ORDER_CREATE_FAILED');
});
