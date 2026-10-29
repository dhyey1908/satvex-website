const test = require('node:test');
const assert = require('node:assert/strict');
const { statusChangeProblem, statusConflicts } = require('./orderConsistency');

const online = (extra) => ({ paymentMethod: 'Online', paymentStatus: 'paid', status: 'Pending', ...extra });

test('an unpaid online order cannot move to a fulfilment status', () => {
  for (const status of ['Confirmed', 'Processing', 'Shipped', 'Delivered']) {
    assert.equal(statusChangeProblem(online({ paymentStatus: 'expired' }), status).code, 'PAYMENT_NOT_CONFIRMED');
  }
  assert.equal(statusChangeProblem(online({ paymentStatus: 'awaiting_payment' }), 'Processing').code, 'PAYMENT_NOT_CONFIRMED');
});

test('cancelling or leaving pending is always allowed, and paid / COD orders are fine', () => {
  assert.equal(statusChangeProblem(online({ paymentStatus: 'expired' }), 'Cancelled'), null);
  assert.equal(statusChangeProblem(online({ paymentStatus: 'expired' }), 'Pending'), null);
  assert.equal(statusChangeProblem(online(), 'Processing'), null);
  assert.equal(statusChangeProblem({ paymentMethod: 'COD', status: 'Pending' }, 'Processing'), null);
});

test('Delivered is refused while shipping is only "order created"', () => {
  const o = online({ shipmentStatus: 'order_created' });
  assert.equal(statusChangeProblem(o, 'Delivered').code, 'NOT_DISPATCHED');
  assert.equal(statusChangeProblem({ ...o, shipmentManuallyLinked: true }, 'Delivered'), null);
  assert.equal(statusChangeProblem({ ...o, lastTrackingStatus: 'In Transit' }, 'Delivered'), null);
  assert.equal(statusChangeProblem(online({ shipmentStatus: 'not_created' }), 'Delivered'), null);
});

test('existing contradictions are reported', () => {
  assert.deepEqual(statusConflicts(online({ status: 'Pending', paymentStatus: 'expired' })), []);
  assert.equal(statusConflicts(online({ status: 'Processing', paymentStatus: 'expired' }))[0], 'Payment expired, but the order is Processing.');
  assert.match(statusConflicts(online({ status: 'Delivered', shipmentStatus: 'order_created' }))[0], /Marked Delivered/);
  assert.deepEqual(statusConflicts(online({ status: 'Delivered', shipmentStatus: 'awb_assigned', lastTrackingStatus: 'Delivered' })), []);
});
