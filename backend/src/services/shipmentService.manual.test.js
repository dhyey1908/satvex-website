// "Shipped manually": an order the admin booked by hand in the Shiprocket panel
// must leave the Sync Issues list, close its retry job, and never be re-created
// at Shiprocket (which would be a duplicate order at the courier).
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('./orderService');
const shipmentJobService = require('./shipmentJobService');
const shipmentService = require('./shipmentService');

const originals = [orderService, shipmentJobService].map((m) => [m, { ...m }]);
after(() => originals.forEach(([m, o]) => Object.assign(m, o)));

let db; let jobs; let calls;
beforeEach(() => {
  db = { A: { orderId: 'A', status: 'Confirmed', paymentMethod: 'COD', shipmentStatus: 'sync_failed' } };
  jobs = { A: { status: 'failed', attempts: 6 } };
  calls = [];
  orderService.findById = async (id) => db[id] || null;
  orderService.listAll = async () => Object.values(db);
  orderService.findByShiprocketOrderId = async () => null;
  orderService.acquireShipmentLock = async () => ({ acquired: true });
  orderService.releaseShipmentLock = async () => calls.push('release');
  orderService.recordManualShipment = async (id, input) => {
    calls.push(['manual', id, input]);
    Object.assign(db[id], { shiprocketOrderId: input.shiprocketOrderId, awbCode: input.awbCode, shipmentStatus: input.awbCode ? 'awb_assigned' : 'order_created', shipmentManuallyLinked: true });
  };
  shipmentJobService.findByOrderId = async (id) => jobs[id] || null;
  shipmentJobService.markDone = async (id) => { calls.push(['jobDone', id]); delete jobs[id]; };
});

test('linking stores the Shiprocket order id/AWB, closes the retry job and releases the lock', async () => {
  const out = await shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654', awbCode: 'AWB12345', courierName: 'Delhivery' });
  assert.equal(out.shipmentManuallyLinked, true);
  assert.deepEqual(calls[0], ['manual', 'A', { shiprocketOrderId: '987654', awbCode: 'AWB12345', courierName: 'Delhivery', note: undefined }]);
  assert.ok(calls.some((c) => c[0] === 'jobDone'), 'retry job closed');
  assert.equal(calls.at(-1), 'release');
});

test('a manually linked order is no longer listed as a sync issue', async () => {
  assert.equal((await shipmentService.listSyncIssues()).issues.length, 1);
  await shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' });
  assert.equal((await shipmentService.listSyncIssues()).issues.length, 0);
});

test('automatic creation is skipped for a manually linked order (no duplicate at Shiprocket)', async () => {
  await shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' });
  const result = await shipmentService.attemptShipmentCreation('A');
  assert.equal(result.shipmentManuallyLinked, true);
});

test('refuses cancelled orders, already-synced orders and unknown orders', async () => {
  db.A.status = 'Cancelled';
  await assert.rejects(() => shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' }), /cancelled/i);
  db.A.status = 'Confirmed'; db.A.shipmentStatus = 'label_generated';
  await assert.rejects(() => shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' }), /already has a working shipment/i);
  await assert.rejects(() => shipmentService.linkManualShipment('NOPE', { shiprocketOrderId: '987654' }), /not found/i);
});

test('does not race an automatic attempt that holds the lock', async () => {
  orderService.acquireShipmentLock = async () => ({ acquired: false });
  await assert.rejects(() => shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' }), /running/i);
  assert.equal(calls.length, 0);
});

test('a Shiprocket order id already linked to ANOTHER order is rejected (typo protection)', async () => {
  orderService.findByShiprocketOrderId = async () => ({ orderId: 'OTHER1234-xxxx' });
  await assert.rejects(() => shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' }), /already linked to another order \(#OTHER123\)/);
  assert.equal(calls.length, 0);
});

test('editing: re-linking the SAME order with corrected values is allowed', async () => {
  await shipmentService.linkManualShipment('A', { shiprocketOrderId: '111111' });
  orderService.findByShiprocketOrderId = async () => ({ orderId: 'A' }); // its own id
  await shipmentService.linkManualShipment('A', { shiprocketOrderId: '222222', awbCode: 'AWB99999' });
  const edits = calls.filter((c) => c[0] === 'manual');
  assert.equal(edits.length, 2);
  assert.equal(edits[1][2].shiprocketOrderId, '222222');
});

test('unlinking puts the order back in Sync Issues; refused when it is not linked or already moving', async () => {
  await assert.rejects(() => shipmentService.unlinkManualShipment('A'), /no manual shipment link/i);
  orderService.clearManualShipment = async (id) => { Object.assign(db[id], { shipmentStatus: 'sync_failed', shipmentManuallyLinked: undefined, shiprocketOrderId: undefined }); };
  await shipmentService.linkManualShipment('A', { shiprocketOrderId: '987654' });
  assert.equal((await shipmentService.listSyncIssues()).issues.length, 0);
  await shipmentService.unlinkManualShipment('A');
  assert.equal((await shipmentService.listSyncIssues()).issues.length, 1);
  db.A.shipmentManuallyLinked = true; db.A.lastTrackingStatus = 'In Transit';
  await assert.rejects(() => shipmentService.unlinkManualShipment('A'), /already reported movement/i);
});
