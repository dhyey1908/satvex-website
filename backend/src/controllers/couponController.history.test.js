const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../services/orderService');
const couponRedemptionService = require('../services/couponRedemptionService');
const couponController = require('./couponController');

const originals = [orderService, couponRedemptionService].map((m) => [m, { ...m }]);
afterEach(() => originals.forEach(([m, o]) => Object.assign(m, o)));

const order = (over) => ({ orderId: 'O1', couponCode: 'AVANI', status: 'Confirmed', paymentStatus: 'not_required', customer: { name: 'Jane Doe', phone: '9876543210' }, discountAmount: 74.7, createdAt: '2026-10-30T10:00:00Z', ...over });
async function history(code, orders, recorded = []) {
  orderService.listEverything = async () => orders;
  couponRedemptionService.listForCoupon = async () => recorded;
  const res = { body: null, status() { return this; }, json(p) { this.body = p; return this; } };
  await couponController.adminRedemptions({ params: { code } }, res);
  return res.body.data.redemptions;
}

test('usage history comes from the orders: a coupon without one-use-per-customer still shows who used it', async () => {
  const rows = await history('AVANI', [order(), order({ orderId: 'O2', couponCode: 'OTHER' })]);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].customerName, rows[0].customerPhone, rows[0].discountAmount, rows[0].orderId], ['Jane Doe', '9876543210', 74.7, 'O1']);
});

test('the code match ignores case; cancelled and expired orders are not uses', async () => {
  const rows = await history('avani', [order(), order({ orderId: 'O2', status: 'Cancelled' }), order({ orderId: 'O3', paymentStatus: 'expired' })]);
  assert.deepEqual(rows.map((r) => r.orderId), ['O1']);
});

test('a recorded redemption is not listed twice, and one whose order is missing is kept; newest first', async () => {
  const recorded = [
    { redemptionId: 'AVANI__u1', orderId: 'O1', customerName: 'Jane Doe', discountAmount: 74.7, createdAt: '2026-10-30T10:00:00Z' },
    { redemptionId: 'AVANI__u9', orderId: 'GONE', customerName: 'Old Customer', discountAmount: 10, createdAt: '2026-10-01T10:00:00Z' },
  ];
  const rows = await history('AVANI', [order()], recorded);
  assert.deepEqual(rows.map((r) => r.orderId), ['O1', 'GONE']);
});
