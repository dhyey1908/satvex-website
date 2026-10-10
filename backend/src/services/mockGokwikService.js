const AppError = require('../utils/AppError');
const { assertValidOrderTotal, verifyWebhookHeaders } = require('./gokwikService');

// Deterministic, network-free stand-in for gokwikService.js — same function
// signatures/return shapes, selected by gokwikProvider.js when
// env.gokwik.mode === 'mock'. Never calls fetch. Used for local/automated
// testing without real GoKwik sandbox credentials.
//
// Test markers (embed in orderId/gokwikOid, case-sensitive):
//   'MOCKFAIL_CREATE'  in orderId  -> createOrder throws, simulating order/create failure
//   'MOCKFAIL_VERIFY'  in gokwikOid -> verifyPayment returns no transaction_id (payment not confirmed)
//   anything else -> deterministic success

async function createOrder({ orderId, totals, paymentMethod, customer }) {
  if (orderId.includes('MOCKFAIL_CREATE')) {
    throw new AppError('Mock GoKwik: simulated order/create failure.', 502, 'GOKWIK_ERROR');
  }

  // Mirrors the real sandbox's confirmed quirk of returning `total` as a
  // formatted decimal STRING, so tests exercise the same parsing path
  // assertValidOrderTotal has to handle against the real API.
  const result = {
    request_id: `MOCK-REQ-${orderId}`,
    gokwik_oid: `MOCK-OID-${orderId}`,
    order_status: 'pending',
    total: Number(totals.total).toFixed(4),
    moid: orderId,
    mid: 'MOCK_MERCHANT_ID',
    phone: customer?.phone || '',
    order_type: paymentMethod === 'Online' ? 'online' : 'cod',
  };
  assertValidOrderTotal(result);
  return result;
}

async function verifyPayment({ gokwikOid }) {
  if (gokwikOid.includes('MOCKFAIL_VERIFY')) {
    return { gokwik_oid: gokwikOid, status: 'failed' };
  }
  return {
    gokwik_oid: gokwikOid,
    status: 'success',
    transaction_id: `MOCK-TXN-${gokwikOid}`,
  };
}

async function updateOrder({ orderId, status }) {
  return { moid: orderId, order_status: status, mock: true };
}

module.exports = { createOrder, verifyPayment, updateOrder, verifyWebhookHeaders, assertValidOrderTotal };
