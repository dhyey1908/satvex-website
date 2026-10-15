// Shipment Sync Issues must list only orders whose shipment really is stuck.
// Delivered / shipped / courier-tracked orders are not problems, and "Retry
// all" works from this same list, so one wrongly included order would be
// re-sent to Shiprocket and have its tracking overwritten.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('./orderService');
const shipmentJobService = require('./shipmentJobService');
const shipmentService = require('./shipmentService');

const originals = [orderService, shipmentJobService].map((m) => [m, { ...m }]);
after(() => originals.forEach(([m, o]) => Object.assign(m, o)));

let orders;
let jobs;

const order = (orderId, over = {}) => ({
  orderId,
  status: 'Confirmed',
  paymentMethod: 'COD',
  total: 100,
  createdAt: '2026-01-01T00:00:00.000Z',
  customer: { name: 'A' },
  ...over,
});

beforeEach(() => {
  orders = [];
  jobs = {};
  orderService.listAll = async () => orders;
  shipmentJobService.findByOrderId = async (id) => jobs[id] || null;
});

const idsOf = async () => (await shipmentService.listSyncIssues()).issues.map((i) => i.orderId).sort();

test('a stuck paid order is listed', async () => {
  orders = [order('STUCK', { shipmentStatus: 'failed' })];
  jobs.STUCK = { status: 'failed', attempts: 5, lastError: 'Shiprocket 422' };
  const { issues, counts } = await shipmentService.listSyncIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].bucket, 'failed');
  assert.equal(counts.total, 1);
});

test('delivered, shipped and courier-tracked orders are NOT sync issues', async () => {
  orders = [
    order('DELIVERED', { status: 'Delivered', shipmentStatus: 'Delivered' }),
    order('SHIPPED', { status: 'Shipped', shipmentStatus: 'IN TRANSIT' }),
    order('TRACKED', { lastTrackingStatus: 'Out For Delivery', shipmentStatus: 'OUT FOR DELIVERY' }),
    order('REAL', { shipmentStatus: 'failed' }),
  ];
  assert.deepEqual(await idsOf(), ['REAL']);
});

test('label_generated, cancelled and refunded orders are not sync issues', async () => {
  orders = [
    order('LABEL', { shipmentStatus: 'label_generated' }),
    order('CANCELLED', { status: 'Cancelled' }),
    order('SHIPCANCEL', { shipmentStatus: 'cancelled' }),
    order('REFUNDED', { paymentMethod: 'Online', paymentStatus: 'paid', refundStatus: 'success' }),
  ];
  assert.deepEqual(await idsOf(), []);
});

test('an unpaid online order is not a sync issue (nothing to ship yet)', async () => {
  orders = [order('UNPAID', { paymentMethod: 'Online', paymentStatus: 'awaiting_payment' })];
  assert.deepEqual(await idsOf(), []);
});
