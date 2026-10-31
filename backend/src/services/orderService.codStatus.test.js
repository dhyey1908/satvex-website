const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { docClient } = require('../config/dynamo');
const orderService = require('./orderService');
const shipmentJobService = require('./shipmentJobService');

const realSend = docClient.send;
let sent;
beforeEach(() => {
  sent = [];
  docClient.send = async (command) => {
    sent.push(command);
    return {};
  };
});
afterEach(() => {
  docClient.send = realSend;
});

const base = { userId: 'U1', items: [], customer: {}, address: {}, subtotal: 100, total: 100 };

test('a COD order is saved as "Awaiting confirmation" (not Confirmed), a prepaid one as Pending', async () => {
  const cod = await orderService.createOrder({ ...base, paymentMethod: 'COD' });
  assert.equal(cod.status, 'Awaiting confirmation');
  assert.equal(cod.shipmentStatus, 'not_created');
  assert.equal(sent[0].input.Item.status, 'Awaiting confirmation');
  const prepaid = await orderService.createOrder({ ...base, paymentMethod: 'Online', paymentStatus: 'awaiting_payment' });
  assert.equal(prepaid.status, 'Pending');
});

test('the "Delivery not verified" flag and delivery date are stored only when they apply', async () => {
  const flagged = await orderService.createOrder({ ...base, paymentMethod: 'COD', deliveryNotVerified: true });
  assert.equal(flagged.deliveryNotVerified, true);
  const verified = await orderService.createOrder({ ...base, paymentMethod: 'COD', deliveryNotVerified: false, deliveryEta: '2026-11-05' });
  assert.equal('deliveryNotVerified' in verified, false);
  assert.equal(verified.deliveryEta, '2026-11-05');
});

test('the new statuses exist and sort between Pending and Processing in the filters', () => {
  for (const s of ['Awaiting confirmation', 'Address needs fix', 'Shipping retry needed']) assert.ok(orderService.ORDER_STATUSES.includes(s), s);
});

test('a shipment problem can only be recorded on an order that has not shipped, delivered or been cancelled', async () => {
  await orderService.recordShipmentProblem('O1', 'Address needs fix', { kind: 'rejected' });
  const input = sent[0].input;
  const allowed = [input.ExpressionAttributeValues[':s0'], input.ExpressionAttributeValues[':s1'], input.ExpressionAttributeValues[':s2'], input.ExpressionAttributeValues[':s3'], input.ExpressionAttributeValues[':s4']];
  assert.deepEqual(allowed.sort(), ['Address needs fix', 'Awaiting confirmation', 'Confirmed', 'Pending', 'Shipping retry needed']);
  assert.match(input.ConditionExpression, /#status IN/);
});

test('booking a shipment clears the stored error and confirms the order; only from the three waiting statuses', async () => {
  await orderService.recordShipmentBooked('O1', { prepaid: false });
  const input = sent[0].input;
  assert.match(input.UpdateExpression, /REMOVE shipmentError/);
  assert.equal(input.ExpressionAttributeValues[':confirmed'], 'Confirmed');
  assert.deepEqual([input.ExpressionAttributeValues[':s0'], input.ExpressionAttributeValues[':s1'], input.ExpressionAttributeValues[':s2']].sort(), ['Address needs fix', 'Awaiting confirmation', 'Shipping retry needed']);
});

test('editing an address keeps the old and new address, who changed it and when; never on a shipped/delivered/cancelled order', async () => {
  docClient.send = async (command) => {
    sent.push(command);
    return command.constructor.name === 'GetCommand' ? { Item: { orderId: 'O1', address: { line1: 'old' } } } : {};
  };
  const entry = await orderService.updateAddress('O1', { line1: 'new' }, { id: 'ADM', name: 'Owner' }, { deliveryNotVerified: true });
  assert.deepEqual(entry.from, { line1: 'old' });
  assert.deepEqual(entry.to, { line1: 'new' });
  assert.equal(entry.by, 'Owner');
  assert.ok(entry.at);
  const update = sent.find((c) => c.constructor.name === 'UpdateCommand').input;
  assert.match(update.UpdateExpression, /list_append\(if_not_exists\(addressHistory/);
  assert.match(update.ConditionExpression, /NOT \(#status IN/);
  assert.equal(update.ExpressionAttributeValues[':nv'], true);
});

test('Shiprocket outage retries: 3 automatic retries about 10 minutes apart (30 minutes), then the job is marked failed', async () => {
  const minutesUntilNext = async (attemptsSoFar) => {
    sent = [];
    const before = Date.now();
    const result = await shipmentJobService.recordFailure('O1', attemptsSoFar, new Error('down'));
    const input = sent[0].input;
    return { result, minutes: input.ExpressionAttributeValues[':next'] ? Math.round((new Date(input.ExpressionAttributeValues[':next']).getTime() - before) / 60000) : null };
  };
  assert.deepEqual(await minutesUntilNext(0), { result: { failed: false }, minutes: 10 });
  assert.deepEqual(await minutesUntilNext(1), { result: { failed: false }, minutes: 10 });
  assert.deepEqual(await minutesUntilNext(2), { result: { failed: true }, minutes: null });
});
