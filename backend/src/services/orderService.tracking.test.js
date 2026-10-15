// Tracking webhook ordering/idempotency: duplicates add nothing, and nothing
// after Delivered/RTO can drag the status backwards.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { docClient } = require('../config/dynamo');
const orderService = require('./orderService');

const realSend = docClient.send.bind(docClient);
after(() => {
  docClient.send = realSend;
});

let stored;
let writes;

beforeEach(() => {
  stored = { orderId: 'O1', status: 'Confirmed', trackingEvents: [] };
  writes = 0;
  docClient.send = async (cmd) => {
    const name = cmd.constructor.name;
    if (name === 'GetCommand') return { Item: { ...stored } };
    if (name === 'UpdateCommand') {
      writes += 1;
      const v = cmd.input.ExpressionAttributeValues;
      if (v[':mappedStatus']) {
        stored.lastTrackingStatus = v[':mappedStatus'];
        stored.shipmentStatus = v[':shipmentStatus'];
        stored.trackingEvents = [...(stored.trackingEvents || []), ...(v[':newEvent'] || [])];
      }
      if (v[':status']) stored.status = v[':status']; // advanceStatusIfEligible
      return { Attributes: { ...stored } };
    }
    return {};
  };
});

const send = (status) => orderService.recordShipmentTracking('O1', { shipmentStatus: status, currentStatus: status, courierName: 'Delhivery' });
const labels = () => stored.trackingEvents.map((e) => e.status);

test('a normal lifecycle is recorded in order', async () => {
  await send('PICKED UP');
  await send('IN TRANSIT');
  await send('OUT FOR DELIVERY');
  await send('DELIVERED');
  assert.deepEqual(labels(), ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered']);
  assert.equal(stored.lastTrackingStatus, 'Delivered');
});

test('the same event delivered twice adds ONE timeline entry', async () => {
  await send('IN TRANSIT');
  await send('IN TRANSIT');
  await send('IN TRANSIT');
  assert.deepEqual(labels(), ['In Transit']);
});

test('a stale event after Delivered is ignored', async () => {
  await send('IN TRANSIT');
  await send('DELIVERED');
  await send('IN TRANSIT'); // arrives late
  await send('OUT FOR DELIVERY');
  assert.deepEqual(labels(), ['In Transit', 'Delivered']);
  assert.equal(stored.lastTrackingStatus, 'Delivered');
  assert.equal(stored.shipmentStatus, 'DELIVERED');
});

test('after an RTO, later movement is ignored too', async () => {
  await send('RTO');
  await send('IN TRANSIT');
  assert.deepEqual(labels(), ['RTO / Returned']);
});

test('a duplicate DELIVERED does not re-run the delivery side effects', async () => {
  await send('DELIVERED');
  const writesAfterFirst = writes;
  await send('DELIVERED');
  assert.equal(writes, writesAfterFirst, 'no extra writes for the repeat');
});
