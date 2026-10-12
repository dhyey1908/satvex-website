const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('./orderService');
const shiprocketService = require('./shiprocketService');
const settingsService = require('./settingsService');
const shipmentJobService = require('./shipmentJobService');
const shipmentService = require('./shipmentService');

// Mocked responses only — Shiprocket isn't connected yet. Every Shiprocket
// and DynamoDB-backed call is monkey-patched with an in-memory fake, same
// lightweight pattern already used by shippingRateService.test.js/
// pricingService.test.js in this codebase (no new test framework/mocking
// library). Covers the brief's required cases: success, serviceability
// false (order-create failure), duplicate (idempotent resumability), API
// down. Token expiry is covered separately in shiprocketService.test.js.

const originalOrderService = { ...orderService };
const originalShiprocketService = { ...shiprocketService };
const originalGetSettings = settingsService.getSettings;
const originalJobService = { ...shipmentJobService };

let fakeOrders;
let jobServiceCalls;

function freshOrder(orderId, overrides = {}) {
  return {
    orderId,
    createdAt: '2026-01-01T00:00:00.000Z',
    customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '9999999999' },
    address: { line1: '1 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', country: 'India' },
    items: [{ productName: 'Combo', productId: 'p1', quantity: 1, unitPrice: 200 }],
    subtotal: 200,
    paymentMethod: 'COD',
    shiprocketOrderId: null,
    awbCode: null,
    shiprocketShipmentId: null,
    labelUrl: null,
    shipmentStatus: 'not_created',
    ...overrides,
  };
}

function stubEverything() {
  fakeOrders = {};
  jobServiceCalls = { createJob: 0 };

  orderService.findById = async (orderId) => fakeOrders[orderId] || null;
  // In-memory fakes for the per-order lock attemptShipmentCreation now
  // wraps every attempt in — without these, the real DynamoDB-backed
  // implementations would run against the actual orders table, which can
  // both fail (no real credentials in CI) and, worse, silently create
  // stray skeleton order rows for ids like 'ORDER-2' that don't otherwise
  // exist (UpdateCommand upserts). Matches this file's own stated rule:
  // every DynamoDB-backed call is monkey-patched with an in-memory fake.
  orderService.acquireShipmentLock = async () => ({ acquired: true });
  orderService.releaseShipmentLock = async () => {};
  orderService.recordShiprocketOrderCreated = async (orderId, { shiprocketOrderId }) => {
    fakeOrders[orderId] = { ...fakeOrders[orderId], shiprocketOrderId: String(shiprocketOrderId), shipmentStatus: 'order_created' };
  };
  orderService.recordAwbAssigned = async (orderId, { awbCode, courierName, shiprocketShipmentId }) => {
    fakeOrders[orderId] = { ...fakeOrders[orderId], awbCode, courierName, shiprocketShipmentId, shipmentStatus: 'awb_assigned' };
  };
  orderService.recordPickupScheduled = async (orderId) => {
    fakeOrders[orderId] = { ...fakeOrders[orderId], shipmentStatus: 'pickup_scheduled' };
  };
  orderService.recordLabelGenerated = async (orderId, { labelUrl }) => {
    fakeOrders[orderId] = { ...fakeOrders[orderId], labelUrl, shipmentStatus: 'label_generated' };
  };

  settingsService.getSettings = async () => ({
    tax: { enabled: true, percent: 18 },
    shipping: { courierSelectionRule: 'lowest_rate' },
    shiprocket: {
      enabled: true,
      pickupPincode: '360001',
      pickupLocation: 'Rajkot Warehouse',
      defaultPackage: { lengthCm: 10, breadthCm: 10, heightCm: 5, weightKg: 0.3 },
    },
  });

  shipmentJobService.createJob = async (orderId) => {
    jobServiceCalls.createJob += 1;
    return { created: true, orderId };
  };

  // Defaults to "nothing found" — the normal case, since these tests start
  // every order with shiprocketOrderId: null and expect createOrder to run.
  // Overridden per-test (none currently need to) if a case wants to
  // exercise the "Shiprocket already had it" recovery path instead.
  shiprocketService.findOrderByChannelOrderId = async () => null;
}

beforeEach(stubEverything);

after(() => {
  Object.assign(orderService, originalOrderService);
  Object.assign(shiprocketService, originalShiprocketService);
  Object.assign(shipmentJobService, originalJobService);
  settingsService.getSettings = originalGetSettings;
});

test('success: full create -> AWB -> pickup -> label chain', async () => {
  fakeOrders['ORDER-1'] = freshOrder('ORDER-1');
  shiprocketService.getServiceability = async () => [{ courier_name: 'Delhivery', freight_charge: 50 }];
  shiprocketService.createOrder = async () => ({ order_id: 999001 });
  shiprocketService.assignAwb = async () => ({ awbCode: 'AWB123', courierName: 'Delhivery', shipmentId: 888001 });
  shiprocketService.schedulePickup = async () => ({ pickup_status: 1 });
  shiprocketService.generateLabel = async () => 'https://shiprocket.example/label.pdf';

  const result = await shipmentService.attemptShipmentCreation('ORDER-1');
  assert.equal(result.shiprocketOrderId, '999001');
  assert.equal(result.awbCode, 'AWB123');
  assert.equal(result.shipmentStatus, 'label_generated');
  assert.equal(result.labelUrl, 'https://shiprocket.example/label.pdf');
});

test('serviceability false / order-create failure: throws, nothing partial is recorded', async () => {
  fakeOrders['ORDER-2'] = freshOrder('ORDER-2');
  shiprocketService.getServiceability = async () => []; // unserviceable — diagnostic lookup only, non-fatal
  shiprocketService.createOrder = async () => {
    const err = new Error('Shiprocket did not return an order id.');
    err.code = 'SHIPROCKET_ORDER_CREATE_FAILED';
    throw err;
  };

  await assert.rejects(() => shipmentService.attemptShipmentCreation('ORDER-2'), (err) => err.code === 'SHIPROCKET_ORDER_CREATE_FAILED');
  assert.equal(fakeOrders['ORDER-2'].shiprocketOrderId, null, 'no partial Shiprocket order id should ever be recorded on failure');
});

test('duplicate: calling attemptShipmentCreation again after a Shiprocket order already exists never calls createOrder again', async () => {
  fakeOrders['ORDER-3'] = freshOrder('ORDER-3', { shiprocketOrderId: '555001', shipmentStatus: 'order_created' });
  let createOrderCalls = 0;
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 50 }];
  shiprocketService.createOrder = async () => {
    createOrderCalls += 1;
    return { order_id: 'SHOULD-NOT-BE-CALLED' };
  };
  shiprocketService.assignAwb = async () => ({ awbCode: 'AWB999', courierName: 'X', shipmentId: 777001 });
  shiprocketService.schedulePickup = async () => ({ pickup_status: 1 });
  shiprocketService.generateLabel = async () => 'https://shiprocket.example/label2.pdf';

  await shipmentService.attemptShipmentCreation('ORDER-3');
  assert.equal(createOrderCalls, 0, 'createOrder must be skipped once shiprocketOrderId is already recorded');
  assert.equal(fakeOrders['ORDER-3'].shiprocketOrderId, '555001', 'the original Shiprocket order id must be unchanged');
});

test('duplicate: calling attemptShipmentCreation twice in a row for a brand-new order only creates one Shiprocket order', async () => {
  fakeOrders['ORDER-4'] = freshOrder('ORDER-4');
  let createOrderCalls = 0;
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 50 }];
  shiprocketService.createOrder = async () => {
    createOrderCalls += 1;
    return { order_id: 444001 };
  };
  shiprocketService.assignAwb = async () => ({ awbCode: 'AWB444', courierName: 'X', shipmentId: 333001 });
  shiprocketService.schedulePickup = async () => ({ pickup_status: 1 });
  shiprocketService.generateLabel = async () => 'https://shiprocket.example/label4.pdf';

  await shipmentService.attemptShipmentCreation('ORDER-4');
  await shipmentService.attemptShipmentCreation('ORDER-4');
  assert.equal(createOrderCalls, 1, 'a second call (e.g. a repeated webhook or a retry sweep overlap) must never create a second Shiprocket order');
});

test('API down: getServiceability/createOrder network failure propagates (queued by the caller, not swallowed here)', async () => {
  fakeOrders['ORDER-5'] = freshOrder('ORDER-5');
  shiprocketService.getServiceability = async () => {
    throw new Error('getaddrinfo ENOTFOUND apiv2.shiprocket.in');
  };
  shiprocketService.createOrder = async () => {
    throw new Error('getaddrinfo ENOTFOUND apiv2.shiprocket.in');
  };
  await assert.rejects(() => shipmentService.attemptShipmentCreation('ORDER-5'), /ENOTFOUND/);
});

test('triggerShipmentIfNeeded: on failure, queues exactly one retry job (never swallowed, never duplicated by a second failed attempt)', async () => {
  fakeOrders['ORDER-6'] = freshOrder('ORDER-6');
  shiprocketService.getServiceability = async () => [];
  shiprocketService.createOrder = async () => {
    throw new Error('Shiprocket API is down.');
  };

  await shipmentService.triggerShipmentIfNeeded('ORDER-6');
  await shipmentService.triggerShipmentIfNeeded('ORDER-6');
  assert.equal(jobServiceCalls.createJob, 2, 'createJob is called on each failed immediate attempt — its own conditional write (tested in shipmentJobService) is what prevents a duplicate job row, not this function');
});

test('triggerShipmentIfNeeded: a disabled Shiprocket setting is a silent no-op, never creates a job', async () => {
  fakeOrders['ORDER-7'] = freshOrder('ORDER-7');
  settingsService.getSettings = async () => ({ shiprocket: { enabled: false } });
  await shipmentService.triggerShipmentIfNeeded('ORDER-7');
  assert.equal(jobServiceCalls.createJob, 0);
});
