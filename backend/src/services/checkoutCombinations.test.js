// Exercises the full GoKwik x Shiprocket combination matrix end-to-end at
// the provider layer (createOrder -> verifyPayment for GoKwik,
// createOrder -> assignAwb -> schedulePickup -> generateLabel for
// Shiprocket), for every combination of:
//   gokwik mode:     mock | live (live's network is mocked, never real)
//   shiprocket mode: mock | live (live's network is mocked, never real)
//   payment method:  COD  | Online
// This mirrors orderController's real sequencing (GoKwik order+payment
// first, Shiprocket shipment only once the order is Confirmed) without
// depending on DynamoDB, so it runs anywhere with no AWS credentials.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const gokwik = require('./gokwikProvider');
const shiprocket = require('./shiprocketProvider');

const original = {
  gokwikMode: env.gokwik.mode,
  shiprocketMode: env.shiprocket.mode,
  shiprocketEmail: env.shiprocket.email,
  shiprocketPassword: env.shiprocket.password,
  fetch: global.fetch,
};
after(() => {
  env.gokwik.mode = original.gokwikMode;
  env.shiprocket.mode = original.shiprocketMode;
  env.shiprocket.email = original.shiprocketEmail;
  env.shiprocket.password = original.shiprocketPassword;
  global.fetch = original.fetch;
});

// Routes each mocked fetch call to a real-shaped response by URL, covering
// both GoKwik and Shiprocket's real endpoints so a 'live' test never falls
// through to a real network call.
function installLiveNetworkStub() {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('gokwik') && u.includes('/order/create')) {
      return { ok: true, json: async () => ({ data: { gokwik_oid: 'OID-LIVE', moid: 'ORDER-X', total: '236.0000', mid: 'MID' } }) };
    }
    if (u.includes('gokwik') && u.includes('/payment/verify')) {
      return { ok: true, json: async () => ({ data: { transaction_id: 'TXN-LIVE' } }) };
    }
    if (u.includes('/auth/login')) {
      return { ok: true, json: async () => ({ token: 'LIVE-TOKEN' }) };
    }
    if (u.includes('/orders/create/adhoc')) {
      return { ok: true, json: async () => ({ order_id: 5001 }) };
    }
    if (u.includes('/courier/assign/awb')) {
      return { ok: true, json: async () => ({ response: { data: { courier_name: 'Delhivery', awb_code: 'AWBLIVE', shipment_id: 6001 } } }) };
    }
    if (u.includes('/courier/generate/pickup')) {
      return { ok: true, json: async () => ({ pickup_status: 1 }) };
    }
    if (u.includes('/courier/generate/label')) {
      return { ok: true, json: async () => ({ label_created: true, label_url: 'https://live.example/label.pdf' }) };
    }
    throw new Error(`checkoutCombinations test: unexpected URL ${u}`);
  };
}

const GOKWIK_MODES = ['mock', 'live'];
const SHIPROCKET_MODES = ['mock', 'live'];
const PAYMENT_METHODS = ['COD', 'Online'];

for (const gokwikMode of GOKWIK_MODES) {
  for (const shiprocketMode of SHIPROCKET_MODES) {
    for (const paymentMethod of PAYMENT_METHODS) {
      test(`gokwik=${gokwikMode} x shiprocket=${shiprocketMode} x payment=${paymentMethod}`, async () => {
        env.gokwik.mode = gokwikMode;
        env.shiprocket.mode = shiprocketMode;
        env.shiprocket.email = 'mock-api-user@example.com';
        env.shiprocket.password = 'mock-password';

        if (gokwikMode === 'mock' && shiprocketMode === 'mock') {
          global.fetch = async () => {
            throw new Error('fetch should never be called when both providers are in mock mode');
          };
        } else {
          installLiveNetworkStub();
        }

        const orderId = `ORDER-${gokwikMode}-${shiprocketMode}-${paymentMethod}`;
        const totals = { total: 236, subtotal: 200, gstAmount: 36, shipping: 0, codCharge: 0 };

        // Step 1: GoKwik order + payment confirmation (both COD and Online go
        // through GoKwik per the approved business rule — COD for risk-check).
        const gkOrder = await gokwik.createOrder({
          orderId,
          items: [],
          totals,
          paymentMethod,
          customer: { phone: '9999999999' },
        });
        assert.ok(gkOrder.gokwik_oid || gkOrder.moid);

        const verifyResult = await gokwik.verifyPayment({ gokwikOid: gkOrder.gokwik_oid, total: totals.total });
        assert.ok(verifyResult.transaction_id);

        // Step 2: order is now "Confirmed" -> Shiprocket shipment pipeline.
        const srOrder = await shiprocket.createOrder({ orderId, orderItems: [] });
        assert.ok(srOrder.order_id);

        const awb = await shiprocket.assignAwb({ shiprocketOrderId: srOrder.order_id });
        assert.ok(awb.awbCode);
        assert.ok(awb.shipmentId);

        await shiprocket.schedulePickup({ shiprocketOrderId: srOrder.order_id, pickupDate: '2026-01-01' });

        const labelUrl = await shiprocket.generateLabel({ shipmentId: awb.shipmentId });
        assert.match(labelUrl, /^https:\/\//);
      });
    }
  }
}
