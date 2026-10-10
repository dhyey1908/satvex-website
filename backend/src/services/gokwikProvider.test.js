const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const provider = require('./gokwikProvider');

const originalMode = env.gokwik.mode;
const originalFetch = global.fetch;
after(() => {
  env.gokwik.mode = originalMode;
  global.fetch = originalFetch;
});

function failIfCalled() {
  global.fetch = async () => {
    throw new Error('fetch should never be called in mock mode');
  };
}

test('mock mode: createOrder succeeds without any network call', async () => {
  env.gokwik.mode = 'mock';
  failIfCalled();
  const result = await provider.createOrder({
    orderId: 'ORDER-1',
    items: [],
    totals: { total: 118, subtotal: 100, gstAmount: 18, shipping: 0, codCharge: 0 },
    paymentMethod: 'Online',
    customer: { phone: '9999999999' },
  });
  assert.equal(result.moid, 'ORDER-1');
  assert.equal(Number(result.total), 118);
});

test('mock mode: createOrder honors the MOCKFAIL_CREATE marker', async () => {
  env.gokwik.mode = 'mock';
  failIfCalled();
  await assert.rejects(
    () => provider.createOrder({ orderId: 'MOCKFAIL_CREATE-1', items: [], totals: { total: 100 }, paymentMethod: 'Online' }),
    /GOKWIK_ERROR|simulated/
  );
});

test('mock mode: verifyPayment honors the MOCKFAIL_VERIFY marker', async () => {
  env.gokwik.mode = 'mock';
  failIfCalled();
  const ok = await provider.verifyPayment({ gokwikOid: 'MOCK-OID-1', total: 100 });
  assert.equal(ok.transaction_id, 'MOCK-TXN-MOCK-OID-1');

  const failed = await provider.verifyPayment({ gokwikOid: 'MOCKFAIL_VERIFY-1', total: 100 });
  assert.equal(failed.transaction_id, undefined);
});

test('live mode: createOrder parses a real-shaped HTTP response (network mocked)', async () => {
  env.gokwik.mode = 'live';
  global.fetch = async (url) => {
    assert.match(url, /\/v1\/order\/create$/);
    return {
      ok: true,
      json: async () => ({
        data: {
          request_id: 'REQ-1',
          gokwik_oid: 'OID-1',
          order_status: 'pending',
          total: '118.0000', // confirmed real-world quirk: numeric string, not a number
          moid: 'ORDER-1',
          mid: 'REAL_MID',
        },
      }),
    };
  };
  const result = await provider.createOrder({
    orderId: 'ORDER-1',
    items: [],
    totals: { total: 118, subtotal: 100, gstAmount: 18, shipping: 0, codCharge: 0 },
    paymentMethod: 'Online',
    customer: {},
  });
  assert.equal(result.gokwik_oid, 'OID-1');
  assert.equal(Number(result.total), 118);
});

test('live mode: verifyPayment surfaces a transaction_id from a real-shaped response', async () => {
  env.gokwik.mode = 'live';
  global.fetch = async (url) => {
    assert.match(url, /\/v1\/payment\/verify$/);
    return { ok: true, json: async () => ({ data: { transaction_id: 'TXN-REAL-1' } }) };
  };
  const result = await provider.verifyPayment({ gokwikOid: 'OID-1', total: 118 });
  assert.equal(result.transaction_id, 'TXN-REAL-1');
});
