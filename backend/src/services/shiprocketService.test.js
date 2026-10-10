const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const shiprocketService = require('./shiprocketService');

const originalEmail = env.shiprocket.email;
const originalPassword = env.shiprocket.password;
const originalFetch = global.fetch;

beforeEach(() => {
  env.shiprocket.email = 'api-user@example.com';
  env.shiprocket.password = 'test-password';
});

after(() => {
  env.shiprocket.email = originalEmail;
  env.shiprocket.password = originalPassword;
  global.fetch = originalFetch;
});

test('login failure (no credentials) throws SHIPROCKET_NOT_CONFIGURED without any network call', async () => {
  env.shiprocket.email = '';
  env.shiprocket.password = '';
  global.fetch = async () => {
    throw new Error('should never be called with no credentials');
  };
  await assert.rejects(
    () => shiprocketService.getServiceability({ pickupPostcode: '360001', deliveryPostcode: '400001', weightKg: 0.3, cod: false }),
    (err) => err.code === 'SHIPROCKET_NOT_CONFIGURED'
  );
});

test('token expiry: a 401 forces exactly one re-login, then the original call succeeds', async () => {
  let loginCalls = 0;
  let serviceabilityCalls = 0;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/login')) {
      loginCalls += 1;
      return { ok: true, status: 200, json: async () => ({ token: `TOKEN-${loginCalls}` }) };
    }
    if (u.includes('/courier/ratingserviceability')) {
      serviceabilityCalls += 1;
      // First call: token has expired server-side -> 401. Second call
      // (after the forced re-login): succeeds.
      if (serviceabilityCalls === 1) {
        return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: { available_courier_companies: [{ courier_name: 'X', freight_charge: 50 }] } }) };
    }
    throw new Error(`unexpected URL: ${u}`);
  };

  const couriers = await shiprocketService.getServiceability({ pickupPostcode: '360001', deliveryPostcode: '400001', weightKg: 0.3, cod: false });
  assert.equal(couriers.length, 1);
  assert.equal(serviceabilityCalls, 2, 'the original request must be retried exactly once after the forced re-login');
  assert.ok(loginCalls >= 1);
});

test('a second consecutive 401 (after the forced re-login) is not retried again — throws', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'TOKEN' }) };
    if (u.includes('/courier/ratingserviceability')) return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) };
    throw new Error(`unexpected URL: ${u}`);
  };
  await assert.rejects(
    () => shiprocketService.getServiceability({ pickupPostcode: '360001', deliveryPostcode: '400001', weightKg: 0.3, cod: false }),
    (err) => err.code === 'SHIPROCKET_ERROR'
  );
});

test('API down: a network error (fetch rejects) propagates as a normal rejected promise', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'TOKEN' }) };
    throw new Error('getaddrinfo ENOTFOUND apiv2.shiprocket.in');
  };
  await assert.rejects(
    () => shiprocketService.getServiceability({ pickupPostcode: '360001', deliveryPostcode: '400001', weightKg: 0.3, cod: false }),
    /ENOTFOUND/
  );
});

test('API down: a 5xx response throws SHIPROCKET_ERROR', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'TOKEN' }) };
    return { ok: false, status: 503, json: async () => ({ message: 'Service Unavailable' }) };
  };
  await assert.rejects(
    () => shiprocketService.getServiceability({ pickupPostcode: '360001', deliveryPostcode: '400001', weightKg: 0.3, cod: false }),
    (err) => err.code === 'SHIPROCKET_ERROR'
  );
});
