// The COD confirmation flow and the "Shiprocket refused it" flow, from the first order to Confirmed, using the real
// shipmentService + admin controller handlers. Only the outside world is faked: DynamoDB-backed order/job storage
// (an in-memory store with the same rules as orderService's conditional writes) and Shiprocket itself.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('./orderService');
const shiprocketService = require('./shiprocketService');
const settingsService = require('./settingsService');
const shipmentJobService = require('./shipmentJobService');
const shipmentService = require('./shipmentService');
const pincodeService = require('./pincodeService');
const deliveryEligibilityService = require('./deliveryEligibilityService');
const deliveryCheckService = require('./deliveryCheckService');
const userService = require('./userService');
const couponService = require('./couponService');
const adminListQueries = require('./adminListQueries');
const orderController = require('../controllers/orderController');
const adminController = require('../controllers/adminController');
const contactService = require('./contactService');
const { describeShipmentError, isShiprocketRejection } = require('../utils/shiprocketErrors');

const mods = [orderService, shiprocketService, settingsService, shipmentJobService, pincodeService, deliveryEligibilityService, deliveryCheckService, userService, couponService, contactService];
const originals = mods.map((m) => [m, { ...m }]);
afterEach(() => originals.forEach(([m, o]) => Object.assign(m, o)));

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (p) => ((res.body = p), res);
  return res;
};

const ADDRESS = { line1: '12 Test Heights', landmark: 'Near City Mall', city: 'Rajkot', state: 'Gujarat', pincode: '360004', country: 'India' };
const REFUSAL = Object.assign(new Error('Shiprocket request failed.'), {
  upstreamStatus: 422,
  upstreamBody: { message: 'The given data was invalid.', errors: { billing_pincode: ['The billing pincode is invalid.'], billing_address: ['The billing address must be at least 3 characters.'] } },
});

let orders; // orderId -> order
let jobs; // orderId -> job
let srCreateCalls; // payloads sent to Shiprocket createOrder
let srBehaviour; // () => response | throws
let settingsOn;
let awbCalls; // what the AWB step was asked to book
let awbBehaviour;

const newOrder = (over = {}) => ({
  orderId: 'O1',
  userId: 'U1',
  status: 'Awaiting confirmation',
  paymentMethod: 'COD',
  paymentStatus: 'not_required',
  customer: { name: 'Jane Doe', phone: '9876543210' },
  address: { ...ADDRESS },
  items: [{ productId: 'p1', productName: 'Clip', quantity: 1, unitPrice: 149 }],
  subtotal: 149,
  total: 208,
  shipmentStatus: 'not_created',
  createdAt: '2026-10-31T05:00:00.000Z',
  ...over,
});

beforeEach(() => {
  orders = { O1: newOrder() };
  jobs = {};
  srCreateCalls = [];
  srBehaviour = () => ({ order_id: 5001, shipment_id: 6001 });
  settingsOn = true;
  awbBehaviour = () => ({ awbCode: 'AWB1', courierName: 'Delhivery', shipmentId: 6001 });

  settingsService.getSettings = async () => ({
    shiprocket: { enabled: settingsOn, pickupPincode: '360001', pickupLocation: 'Rajkot Warehouse', defaultPackage: { lengthCm: 10, breadthCm: 10, heightCm: 5, weightKg: 0.3 } },
    shipping: { courierSelectionRule: 'lowest_rate' },
  });

  // in-memory orders, with the same conditions as the real conditional writes
  orderService.findById = async (id) => orders[id] || null;
  orderService.acquireShipmentLock = async () => ({ acquired: true });
  orderService.releaseShipmentLock = async () => {};
  orderService.recordShipmentProblem = async (id, status, err) => {
    if (['Pending', 'Awaiting confirmation', 'Confirmed', 'Address needs fix', 'Shipping retry needed'].includes(orders[id].status)) orders[id] = { ...orders[id], status, shipmentError: err };
  };
  orderService.recordShipmentBooked = async (id, { prepaid }) => {
    if (['Awaiting confirmation', 'Address needs fix', 'Shipping retry needed'].includes(orders[id].status)) {
      const { shipmentError, ...rest } = orders[id];
      orders[id] = { ...rest, status: prepaid ? 'Processing' : 'Confirmed' };
    }
  };
  orderService.updateAddress = async (id, address, by, flags) => {
    const entry = { at: new Date().toISOString(), by: by.name, byId: by.id, from: orders[id].address, to: address };
    orders[id] = { ...orders[id], address, addressHistory: [...(orders[id].addressHistory || []), entry], deliveryNotVerified: Boolean(flags.deliveryNotVerified) };
    return entry;
  };
  orderService.recordCancelReason = async (id, r) => {
    orders[id] = { ...orders[id], cancelReason: r.reason, cancelNote: r.note || null };
  };
  orderService.updateStatus = async (id, status) => {
    orders[id] = { ...orders[id], status };
  };
  orderService.recordShiprocketOrderCreated = async (id, { shiprocketOrderId, shiprocketShipmentId }) => {
    orders[id] = { ...orders[id], shiprocketOrderId: String(shiprocketOrderId), shipmentStatus: 'order_created', ...(shiprocketShipmentId ? { shiprocketShipmentId: String(shiprocketShipmentId) } : {}) };
  };
  orderService.recordAwbAssigned = async (id, a) => {
    orders[id] = { ...orders[id], awbCode: a.awbCode, courierName: a.courierName, shiprocketShipmentId: a.shiprocketShipmentId, shipmentStatus: 'awb_assigned' };
  };
  orderService.recordPickupScheduled = async (id) => {
    orders[id] = { ...orders[id], shipmentStatus: 'pickup_scheduled' };
  };
  orderService.recordLabelGenerated = async (id, { labelUrl }) => {
    orders[id] = { ...orders[id], labelUrl, shipmentStatus: 'label_generated' };
  };
  orderService.recordInvoiceGenerated = async (id, { invoiceUrl }) => {
    orders[id] = { ...orders[id], invoiceUrl };
  };

  shipmentJobService.findByOrderId = async (id) => jobs[id] || null;
  shipmentJobService.createJob = async (id, err) => {
    if (jobs[id]) return { created: false };
    jobs[id] = { jobId: id, orderId: id, status: 'pending', attempts: 0, lastError: err?.message || null };
    return { created: true };
  };
  shipmentJobService.markDone = async (id) => {
    if (jobs[id]) jobs[id].status = 'done';
  };
  shipmentJobService.resetForManualRetry = async (id, err) => {
    jobs[id] = { ...jobs[id], status: 'pending', attempts: 0, lastError: err?.message || null };
  };

  shiprocketService.findOrderByChannelOrderId = async () => null;
  shiprocketService.getServiceability = async () => [];
  shiprocketService.createOrder = async (payload) => {
    srCreateCalls.push(payload);
    return srBehaviour();
  };
  awbCalls = [];
  shiprocketService.assignAwb = async (args) => {
    awbCalls.push(args);
    return awbBehaviour(args);
  };
  shiprocketService.schedulePickup = async () => ({});
  shiprocketService.generateLabel = async () => 'https://labels.test/1.pdf';
  shiprocketService.generateInvoice = async () => 'https://invoices.test/1.pdf';

  // address verification: every network lookup is faked
  deliveryEligibilityService.isDeliverable = async () => ({ deliverable: true, state: null });
  pincodeService.lookupPincode = async () => ({ status: 'found', state: 'Gujarat', district: 'Rajkot', places: ['Rajkot', 'Rajkot HO'] });
  deliveryCheckService.checkPincode = async () => ({ status: 'ok', prepaid: true, cod: true, deliveryBy: '2026-11-05' });
  userService.findById = async () => ({ id: 'ADM', name: 'Owner' });
  couponService.releaseOnCancel = async () => {};
});

const call = async (handler, req) => {
  const res = fakeRes();
  await handler({ user: { id: 'ADM', role: 'admin' }, ...req }, res);
  return res.body.data;
};

test('a COD order waiting for confirmation is NOT in Shiprocket, and is not listed as a sync problem', async () => {
  assert.equal(srCreateCalls.length, 0);
  assert.equal(orders.O1.shiprocketOrderId, undefined);
  orderService.listAll = async () => Object.values(orders);
  const listed = await shipmentService.listSyncIssues();
  assert.deepEqual(listed.issues.map((i) => i.orderId), []);
});

test('"Confirm & ship": the order goes to Shiprocket (with the landmark on the label) and ends Confirmed', async () => {
  const data = await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'confirmed');
  assert.equal(data.order.status, 'Confirmed');
  assert.equal(srCreateCalls.length, 1);
  assert.equal(srCreateCalls[0].billingAddress, '12 Test Heights, Near City Mall');
  assert.equal(srCreateCalls[0].paymentMethod, 'COD');
  assert.equal(orders.O1.awbCode, 'AWB1');
});

test('"Confirm & ship" only works on an order that is Awaiting confirmation', async () => {
  orders.O1.status = 'Confirmed';
  await assert.rejects(() => call(orderController.adminConfirmOrder, { params: { id: 'O1' } }), (e) => e.code === 'WRONG_STATUS' && e.statusCode === 409);
  assert.equal(srCreateCalls.length, 0);
});

test('Shiprocket refuses the address (422): "Address needs fix", exact error stored, NOT cancelled, nothing retried by itself', async () => {
  srBehaviour = () => {
    throw REFUSAL;
  };
  const data = await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'address_needs_fix');
  assert.equal(orders.O1.status, 'Address needs fix');
  assert.notEqual(orders.O1.status, 'Cancelled');
  const stored = orders.O1.shipmentError;
  assert.equal(stored.kind, 'rejected');
  assert.equal(stored.status, 422);
  assert.equal(stored.message, 'The given data was invalid.');
  assert.deepEqual(stored.errors.billing_pincode, ['The billing pincode is invalid.']);
  assert.match(stored.plain, /Pincode: The billing pincode is invalid\./);
  assert.match(stored.plain, /Address: The billing address must be at least 3 characters\./);
  assert.match(stored.plain, /Fix the address and try again\./);
  assert.deepEqual(jobs, {}, 'a refused order must not be queued for automatic retry');
});

test('a 400 from Shiprocket is treated the same way as a 422', async () => {
  srBehaviour = () => {
    throw Object.assign(new Error('Bad request'), { upstreamStatus: 400, upstreamBody: { message: 'Wrong Pickup location entered' } });
  };
  const data = await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'address_needs_fix');
  assert.equal(orders.O1.shipmentError.message, 'Wrong Pickup location entered');
});

test('edit the address -> "Retry Shiprocket" -> the order is Confirmed and the old error is gone; the change is on record', async () => {
  srBehaviour = () => {
    throw REFUSAL;
  };
  await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(orders.O1.status, 'Address needs fix');

  // the admin fixes the address: it goes through every checkout rule first
  const fixed = { ...ADDRESS, line1: '12 Test Heights, Kalawad Road', landmark: 'Opp. SBI Bank' };
  const edit = await call(orderController.adminUpdateAddress, { params: { id: 'O1' }, body: { address: fixed } });
  assert.equal(edit.order.address.line1, '12 Test Heights, Kalawad Road');
  assert.equal(edit.order.status, 'Address needs fix', 'editing alone does not ship it');
  const [change] = orders.O1.addressHistory;
  assert.equal(change.by, 'Owner');
  assert.equal(change.byId, 'ADM');
  assert.ok(change.at);
  assert.equal(change.from.line1, '12 Test Heights');
  assert.equal(change.to.line1, '12 Test Heights, Kalawad Road');

  // retry: Shiprocket accepts it now
  srBehaviour = () => ({ order_id: 5002, shipment_id: 6002 });
  const data = await call(orderController.adminRetryShiprocket, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'confirmed');
  assert.equal(orders.O1.status, 'Confirmed');
  assert.equal(orders.O1.shipmentError, undefined);
  assert.equal(srCreateCalls.at(-1).billingAddress, '12 Test Heights, Kalawad Road, Opp. SBI Bank');
});

test('retry after a failed fix: stays "Address needs fix" with the NEW error', async () => {
  srBehaviour = () => {
    throw REFUSAL;
  };
  await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  srBehaviour = () => {
    throw Object.assign(new Error('x'), { upstreamStatus: 422, upstreamBody: { message: 'Invalid phone', errors: { billing_phone: ['Phone number is in invalid format'] } } });
  };
  const data = await call(orderController.adminRetryShiprocket, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'address_needs_fix');
  assert.equal(orders.O1.status, 'Address needs fix');
  assert.equal(orders.O1.shipmentError.message, 'Invalid phone');
  assert.match(orders.O1.shipmentError.plain, /Phone number: Phone number is in invalid format/);
});

test('the admin address editor applies every checkout rule (and changes nothing when one fails)', async () => {
  const bad = [
    { ...ADDRESS, line1: 'मकान 12' }, // not English
    { ...ADDRESS, line1: 'test' }, // junk
    { ...ADDRESS, landmark: '' }, // landmark required
    { ...ADDRESS, line1: 'Plot 5 Road, '.repeat(20) }, // over 190
  ];
  for (const address of bad) {
    await assert.rejects(() => call(orderController.adminUpdateAddress, { params: { id: 'O1' }, body: { address } }), (e) => e.name === 'ZodError');
  }
  pincodeService.lookupPincode = async () => ({ status: 'found', state: 'Gujarat', district: 'Rajkot', places: ['Rajkot'] });
  await assert.rejects(() => call(orderController.adminUpdateAddress, { params: { id: 'O1' }, body: { address: { ...ADDRESS, city: 'Surat' } } }), (e) => e.code === 'CITY_MISMATCH');
  deliveryCheckService.checkPincode = async () => ({ status: 'no_courier' });
  await assert.rejects(() => call(orderController.adminUpdateAddress, { params: { id: 'O1' }, body: { address: ADDRESS } }), (e) => e.code === 'NO_COURIER');
  assert.equal(orders.O1.addressHistory, undefined);
  assert.equal(orders.O1.address.line1, '12 Test Heights');
});

test('the address of a shipped / cancelled / already-booked order cannot be edited', async () => {
  for (const patch of [{ status: 'Shipped' }, { status: 'Cancelled' }, { shiprocketOrderId: '77' }]) {
    orders.O1 = newOrder(patch);
    await assert.rejects(() => call(orderController.adminUpdateAddress, { params: { id: 'O1' }, body: { address: ADDRESS } }), (e) => e.code === 'ADDRESS_LOCKED');
  }
});

test('Shiprocket down (not a refusal): "Shipping retry needed" + queued for automatic retry, and the order is NOT lost', async () => {
  srBehaviour = () => {
    throw Object.assign(new Error('Shiprocket login failed (HTTP 503)'), { code: 'SHIPROCKET_AUTH_ERROR' });
  };
  const data = await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'retry_needed');
  assert.equal(orders.O1.status, 'Shipping retry needed');
  assert.equal(orders.O1.shipmentError.kind, 'retry');
  assert.equal(jobs.O1.status, 'pending');

  // and when Shiprocket is back, the retry books it
  srBehaviour = () => ({ order_id: 5003, shipment_id: 6003 });
  const retry = await call(orderController.adminRetryShiprocket, { params: { id: 'O1' } });
  assert.equal(retry.outcome, 'confirmed');
  assert.equal(orders.O1.status, 'Confirmed');
  assert.equal(jobs.O1.status, 'done');
});

test('a prepaid order goes to Shiprocket directly, with no confirmation call', async () => {
  orders.O1 = newOrder({ status: 'Confirmed', paymentMethod: 'Online', paymentStatus: 'paid' });
  await shipmentService.triggerShipmentIfNeeded('O1');
  assert.equal(srCreateCalls.length, 1);
  assert.equal(srCreateCalls[0].paymentMethod, 'Prepaid');
  assert.equal(orders.O1.awbCode, 'AWB1');
});

test('a prepaid order refused by Shiprocket (422) goes to "Address needs fix" - not cancelled, no automatic retry', async () => {
  orders.O1 = newOrder({ status: 'Confirmed', paymentMethod: 'Online', paymentStatus: 'paid' });
  srBehaviour = () => {
    throw REFUSAL;
  };
  await shipmentService.triggerShipmentIfNeeded('O1');
  assert.equal(orders.O1.status, 'Address needs fix');
  assert.deepEqual(jobs, {});
});

test('the retry sweep: a refusal parks the order for a fix and closes its job; an outage keeps retrying', async () => {
  const sweep = require('../shipmentSweep');
  orders.O1 = newOrder({ status: 'Shipping retry needed', paymentMethod: 'Online', paymentStatus: 'paid' });
  jobs.O1 = { jobId: 'O1', orderId: 'O1', status: 'pending', attempts: 1 };
  shipmentJobService.listDueJobs = async () => [jobs.O1];
  const failures = [];
  shipmentJobService.recordFailure = async (id, attempts, err) => {
    failures.push(err.message);
    return { failed: false };
  };

  srBehaviour = () => {
    throw new Error('Shiprocket request failed.');
  };
  await sweep.handler();
  assert.deepEqual(failures, ['Shiprocket request failed.']);
  assert.equal(orders.O1.status, 'Shipping retry needed');

  srBehaviour = () => {
    throw REFUSAL;
  };
  await sweep.handler();
  assert.equal(orders.O1.status, 'Address needs fix');
  assert.equal(jobs.O1.status, 'done');
  assert.equal(failures.length, 1, 'a refusal is not counted as another retry');
});

test('cancelling an order that is awaiting confirmation needs a reason, and the reason is kept', async () => {
  await assert.rejects(() => call(orderController.adminUpdateStatus, { params: { id: 'O1' }, body: { status: 'Cancelled' } }), (e) => e.code === 'CANCEL_REASON_REQUIRED');
  assert.equal(orders.O1.status, 'Awaiting confirmation');

  for (const reason of ['No answer', 'Customer cancelled', 'Fake order', 'Other']) {
    orders.O1 = newOrder();
    await call(orderController.adminUpdateStatus, { params: { id: 'O1' }, body: { status: 'Cancelled', cancelReason: reason, cancelNote: 'rang twice' } });
    assert.equal(orders.O1.status, 'Cancelled');
    assert.equal(orders.O1.cancelReason, reason);
  }
  await assert.rejects(() => call(orderController.adminUpdateStatus, { params: { id: 'O1' }, body: { status: 'Cancelled', cancelReason: 'Because' } }), (e) => e.name === 'ZodError');
});

test('the sidebar badge counts the orders awaiting confirmation', async () => {
  orderService.listAll = async () => [newOrder(), newOrder({ orderId: 'O2' }), newOrder({ orderId: 'O3', status: 'Confirmed' }), newOrder({ orderId: 'O4', status: 'Address needs fix' })];
  contactService.listContacts = async () => [];
  const res = fakeRes();
  await adminController.sidebarCounts({}, res);
  assert.equal(res.body.data.awaitingConfirmation, 2);
  assert.equal(res.body.data.addressNeedsFix, 1);
});

test('the orders list can be filtered by the new statuses and counts each one', () => {
  const list = [newOrder(), newOrder({ orderId: 'O2', status: 'Address needs fix' }), newOrder({ orderId: 'O3', status: 'Shipping retry needed' }), newOrder({ orderId: 'O4' })];
  const query = adminListQueries.ordersQuerySchema.parse({ status: 'Awaiting confirmation' });
  const result = adminListQueries.queryOrders(list, query);
  assert.deepEqual(result.items.map((o) => o.orderId).sort(), ['O1', 'O4']);
  assert.equal(result.facets.counts.status['Awaiting confirmation'], 2);
  assert.equal(result.facets.counts.status['Address needs fix'], 1);
  assert.equal(result.facets.counts.status['Shipping retry needed'], 1);
});

test('Shiprocket errors: only 400/422 (or our own missing-data check) count as a refusal', () => {
  assert.equal(isShiprocketRejection({ upstreamStatus: 422, shipmentStage: 'create' }), true);
  assert.equal(isShiprocketRejection({ upstreamStatus: 400, shipmentStage: 'create' }), true);
  assert.equal(isShiprocketRejection({ upstreamStatus: 422 }), false, 'a 422 from a later step is not an address problem');
  assert.equal(isShiprocketRejection({ addressProblem: true }), true);
  for (const status of [401, 403, 404, 429, 500, 502, 503, undefined]) assert.equal(isShiprocketRejection({ upstreamStatus: status }), false, String(status));
  assert.equal(describeShipmentError(new Error('socket hang up')).kind, 'retry');
});

test('the shipment id Shiprocket returns for the new order is saved and used to assign the AWB (the AWB call is keyed by it)', async () => {
  await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(awbCalls.length, 1);
  assert.equal(awbCalls[0].shipmentId, '6001');
  assert.equal(awbCalls[0].shiprocketOrderId, '5001');
});

test('a 422 from the AWB step (not the order creation) is NOT an address problem: "Shipping retry needed", retried automatically, address untouched', async () => {
  awbBehaviour = () => {
    throw Object.assign(new Error('Required field missing'), { upstreamStatus: 422, upstreamBody: { message: 'Required field missing', errors: { shipment_id: ['The shipment id field is required when order id is not present.'] } } });
  };
  const data = await call(orderController.adminConfirmOrder, { params: { id: 'O1' } });
  assert.equal(data.outcome, 'retry_needed');
  assert.equal(orders.O1.status, 'Shipping retry needed');
  assert.equal(orders.O1.shipmentError.kind, 'retry');
  assert.match(orders.O1.shipmentError.plain, /retried automatically/);
  assert.equal(jobs.O1.status, 'pending');
  // the Shiprocket order exists already, so the retry resumes at the AWB step and never creates a second order
  awbBehaviour = () => ({ awbCode: 'AWB1', courierName: 'Delhivery', shipmentId: 6001 });
  const retry = await call(orderController.adminRetryShiprocket, { params: { id: 'O1' } });
  assert.equal(retry.outcome, 'confirmed');
  assert.equal(srCreateCalls.length, 1);
});
