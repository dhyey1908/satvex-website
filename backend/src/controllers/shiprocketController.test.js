const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const orderService = require('../services/orderService');
const shiprocketController = require('./shiprocketController');

const originalWebhookToken = env.shiprocket.webhookToken;
const originalFindByShiprocketOrderId = orderService.findByShiprocketOrderId;
const originalRecordShipmentTracking = orderService.recordShipmentTracking;

after(() => {
  env.shiprocket.webhookToken = originalWebhookToken;
  orderService.findByShiprocketOrderId = originalFindByShiprocketOrderId;
  orderService.recordShipmentTracking = originalRecordShipmentTracking;
});

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

beforeEach(() => {
  env.shiprocket.webhookToken = '';
});

test('an unrecognized sr_order_id is acked (200) and dropped, never errors', async () => {
  orderService.findByShiprocketOrderId = async () => null;
  const req = { headers: {}, body: { sr_order_id: 999999, current_status: 'IN TRANSIT' } };
  const res = fakeRes();
  await shiprocketController.webhook(req, res);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.received, true);
});

test('a missing sr_order_id is acked and dropped without looking anything up', async () => {
  let called = false;
  orderService.findByShiprocketOrderId = async () => {
    called = true;
    return null;
  };
  const req = { headers: {}, body: {} };
  const res = fakeRes();
  await shiprocketController.webhook(req, res);
  assert.equal(res.body.data.received, true);
  assert.equal(called, false);
});

test('webhook token check: rejects a wrong x-api-key with 401 when a token is configured', async () => {
  env.shiprocket.webhookToken = 'real-secret';
  const req = { headers: { 'x-api-key': 'wrong' }, body: { sr_order_id: 1 } };
  const res = fakeRes();
  await shiprocketController.webhook(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('webhook token check: accepts the correct x-api-key', async () => {
  env.shiprocket.webhookToken = 'real-secret';
  orderService.findByShiprocketOrderId = async () => ({ orderId: 'ORDER-1' });
  let recorded = null;
  orderService.recordShipmentTracking = async (orderId, data) => {
    recorded = { orderId, data };
  };
  const req = { headers: { 'x-api-key': 'real-secret' }, body: { sr_order_id: 1, current_status: 'IN TRANSIT' } };
  const res = fakeRes();
  await shiprocketController.webhook(req, res);
  assert.equal(res.body.data.received, true);
  assert.equal(recorded.orderId, 'ORDER-1');
});

test('repeated webhook: the exact same event delivered twice is harmless (same end state, no error either time, raw payload kept both times)', async () => {
  orderService.findByShiprocketOrderId = async () => ({ orderId: 'ORDER-2' });
  const trackingCalls = [];
  orderService.recordShipmentTracking = async (orderId, data) => {
    trackingCalls.push({ orderId, data });
  };

  const body = { sr_order_id: 555, current_status: 'OUT FOR DELIVERY', shipment_status: 'OUT FOR DELIVERY', courier_name: 'Delhivery' };
  const req1 = { headers: {}, body };
  const req2 = { headers: {}, body: { ...body } }; // Shiprocket's own retry of the identical event
  const res1 = fakeRes();
  const res2 = fakeRes();

  await shiprocketController.webhook(req1, res1);
  await shiprocketController.webhook(req2, res2);

  assert.equal(res1.body.data.received, true);
  assert.equal(res2.body.data.received, true);
  assert.equal(trackingCalls.length, 2, 'both deliveries are processed — the write itself (a plain SET) is what makes the second one harmless, not a dedup check');
  assert.deepEqual(trackingCalls[0].data.rawPayload, body);
  assert.deepEqual(trackingCalls[1].data.rawPayload, body);
  assert.equal(trackingCalls[0].data.currentStatus, trackingCalls[1].data.currentStatus);
});

test('an out-of-order DELIVERED-then-IN TRANSIT pair still just reflects the latest write (last-write-wins, documented behavior)', async () => {
  orderService.findByShiprocketOrderId = async () => ({ orderId: 'ORDER-3' });
  const trackingCalls = [];
  orderService.recordShipmentTracking = async (orderId, data) => {
    trackingCalls.push(data);
  };

  await shiprocketController.webhook({ headers: {}, body: { sr_order_id: 1, current_status: 'DELIVERED' } }, fakeRes());
  await shiprocketController.webhook({ headers: {}, body: { sr_order_id: 1, current_status: 'IN TRANSIT' } }, fakeRes());

  assert.equal(trackingCalls.length, 2);
  assert.equal(trackingCalls[1].currentStatus, 'IN TRANSIT');
});
