// cancelShipmentForOrder: a cancelled order must not leave a live Shiprocket
// order behind, and must never fail the customer's cancellation.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const shiprocketService = require('./shiprocketService');
const orderService = require('./orderService');
const shipmentJobService = require('./shipmentJobService');
const shipmentService = require('./shipmentService');

const originals = [shiprocketService, orderService, shipmentJobService].map((m) => [m, { ...m }]);
after(() => originals.forEach(([m, o]) => Object.assign(m, o)));

let cancelCalls;
let cancelledMarks;
let flagged;
let jobsClosed;
let shiprocketShouldFail;

beforeEach(() => {
  cancelCalls = [];
  cancelledMarks = [];
  flagged = [];
  jobsClosed = [];
  shiprocketShouldFail = false;
  shiprocketService.cancelOrder = async ({ shiprocketOrderId }) => {
    if (shiprocketShouldFail) throw new Error('Cannot cancel: shipment already picked up');
    cancelCalls.push(shiprocketOrderId);
    return { ok: true };
  };
  orderService.markShipmentCancelled = async (id) => cancelledMarks.push(id);
  orderService.flagForReview = async (id, reason) => flagged.push({ id, reason });
  shipmentJobService.markDone = async (id) => jobsClosed.push(id);
});

test('cancels the Shiprocket order, records it, and closes the retry job', async () => {
  const r = await shipmentService.cancelShipmentForOrder({ orderId: 'O1', shiprocketOrderId: 123, shipmentStatus: 'order_created' });
  assert.equal(r.cancelled, true);
  assert.deepEqual(cancelCalls, [123]);
  assert.deepEqual(cancelledMarks, ['O1']);
  assert.deepEqual(jobsClosed, ['O1']);
  assert.deepEqual(flagged, []);
});

test('an order that never reached Shiprocket just closes its job - nothing is called', async () => {
  const r = await shipmentService.cancelShipmentForOrder({ orderId: 'O2' });
  assert.equal(r.cancelled, false);
  assert.equal(r.reason, 'no_shipment');
  assert.deepEqual(cancelCalls, []);
  assert.deepEqual(jobsClosed, ['O2']);
});

test('cancelling twice does not call Shiprocket twice', async () => {
  const r = await shipmentService.cancelShipmentForOrder({ orderId: 'O3', shiprocketOrderId: 9, shipmentStatus: 'cancelled' });
  assert.equal(r.cancelled, true);
  assert.deepEqual(cancelCalls, []);
});

test('Shiprocket refusing (already picked up) never throws: the order is flagged with an instruction', async () => {
  shiprocketShouldFail = true;
  const r = await shipmentService.cancelShipmentForOrder({ orderId: 'O4', shiprocketOrderId: 55, shipmentStatus: 'awb_assigned' });
  assert.equal(r.cancelled, false);
  assert.equal(r.reason, 'shiprocket_error');
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].reason, /Shiprocket panel/);
  assert.deepEqual(cancelledMarks, []);
});

test('no order -> harmless', async () => {
  const r = await shipmentService.cancelShipmentForOrder(null);
  assert.equal(r.cancelled, false);
});
