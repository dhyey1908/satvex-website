const test = require('node:test');
const assert = require('node:assert/strict');

const { docClient } = require('../config/dynamo');
const svc = require('./financialAnalyticsService');

// A paid-and-delivered COD order unless overridden. total = 1000 + 180 GST + 59 ship = 1239.
function order(overrides = {}) {
  return {
    orderId: `o-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: '2026-10-10T08:00:00.000Z',
    paymentMethod: 'COD',
    paymentStatus: 'not_required',
    status: 'Delivered',
    refundStatus: 'none',
    subtotal: 1000,
    discountAmount: 0,
    gstAmount: 180,
    shipping: 59,
    codCharge: 0,
    prepaidDiscount: 0,
    total: 1239,
    quotedFreightCharge: 40,
    quotedRtoCharge: 40,
    items: [{ productId: 'p1', sellingOptionId: 'opt1', quantity: 1, unitPrice: 1000, costPrice: 400 }],
    ...overrides,
  };
}

const settings = { finance: { paymentGatewayFeePercent: 2 }, shipping: { fallbackFlatCharge: 59 } };

function report(orders, filters = {}, extra = {}) {
  return svc.computeReport({ orders, products: [], settings, filters, ...extra });
}

test('every order falls in exactly one bucket and bucket totals add up to the filtered orders', () => {
  const orders = [
    order({ paymentStatus: 'expired', status: 'Pending', paymentMethod: 'Online' }),
    order({ paymentMethod: 'Online', paymentStatus: 'awaiting_payment', status: 'Pending' }),
    order({ paymentMethod: 'Online', paymentStatus: 'paid', refundStatus: 'pending' }),
    order({ status: 'Cancelled' }),
    order({ lastTrackingStatus: 'RTO / Returned', status: 'Shipped' }),
    order({ paymentMethod: 'Online', paymentStatus: 'paid', status: 'Confirmed' }),
    order({ status: 'Confirmed' }),
  ];
  const r = report(orders);
  const buckets = r.orders.map((o) => o.bucket).sort();
  assert.deepEqual(buckets, ['awaiting_payment', 'cancelled', 'cod_pending', 'collected', 'expired', 'refunded', 'rto']);
  const counted = Object.values(r.summary.buckets).reduce((n, b) => n + b.orders, 0);
  assert.equal(counted, orders.length);
  const amountSum = Object.values(r.summary.buckets).reduce((n, b) => n + b.amount, 0);
  assert.equal(Number(amountSum.toFixed(2)), Number((orders.length * 1239).toFixed(2)));
});

test('gross sales excludes expired/awaiting/cancelled; net revenue is collected only', () => {
  const r = report([
    order({ paymentStatus: 'expired', paymentMethod: 'Online', status: 'Pending' }),
    order({ paymentMethod: 'Online', paymentStatus: 'awaiting_payment', status: 'Pending' }),
    order({ status: 'Cancelled' }),
    order({ status: 'Delivered' }), // collected
    order({ status: 'Confirmed' }), // cod_pending
    order({ paymentMethod: 'Online', paymentStatus: 'paid', refundStatus: 'pending' }), // refunded
  ]);
  assert.equal(r.summary.grossSales, 1239 * 3);
  assert.equal(r.summary.netRevenue, 1239);
  assert.equal(r.summary.pendingPayments.orders, 1);
  assert.equal(r.summary.pendingCod.orders, 1);
  assert.equal(r.summary.refunds.orders, 1);
  assert.equal(r.summary.refunds.amount, 1239);
});

test('a refunded order is never also counted as collected', () => {
  const r = report([order({ paymentMethod: 'Online', paymentStatus: 'paid', refundStatus: 'pending' })]);
  assert.equal(r.summary.netRevenue, 0);
  assert.equal(r.summary.paidOrders, 0);
  assert.equal(r.summary.refunds.orders, 1);
});

test('COD vs prepaid breakdown splits collected and pending without overlap', () => {
  const r = report([
    order({ status: 'Delivered' }),
    order({ status: 'Confirmed' }),
    order({ paymentMethod: 'Online', paymentStatus: 'paid', status: 'Confirmed' }),
    order({ paymentMethod: 'Online', paymentStatus: 'awaiting_payment', status: 'Pending' }),
  ]);
  assert.equal(r.paymentBreakdown.cod.collected, 1239);
  assert.equal(r.paymentBreakdown.cod.pending, 1239);
  assert.equal(r.paymentBreakdown.online.collected, 1239);
  assert.equal(r.paymentBreakdown.online.pending, 1239);
  assert.equal(r.paymentBreakdown.cod.orders + r.paymentBreakdown.online.orders, 4);
});

test('profit: revenue ex-GST minus COGS, fee and courier; labeled estimated', () => {
  const r = report([order({ paymentMethod: 'Online', paymentStatus: 'paid', status: 'Confirmed' })]);
  // revenueExGst 1239-180=1059; cogs 400; fee 2% of 1239 = 24.78; courier quoted 40
  const row = r.orders[0];
  assert.equal(row.revenueExGst, 1059);
  assert.equal(row.cogs.amount, 400);
  assert.equal(row.cogs.basis, 'actual');
  assert.equal(row.gatewayFee.amount, 24.78);
  assert.equal(row.gatewayFee.basis, 'estimated');
  assert.equal(row.profit.net, 1059 - 400 - 24.78 - 40);
  assert.equal(r.profit.basis, 'estimated');
  // the summary waterfall equals the sum of per-order profits
  assert.equal(r.profit.netProfit, row.profit.net);
});

test('missing cost data is excluded from profit and reported as coverage, never treated as zero', () => {
  const noCost = order({ items: [{ productId: 'p9', sellingOptionId: 'x', quantity: 1, unitPrice: 1000 }] });
  const r = report([order(), noCost]);
  assert.equal(r.profit.eligibleOrders, 1);
  assert.equal(r.profit.saleOrders, 2);
  assert.equal(r.profit.coveragePct, 50);
  assert.equal(r.profit.missing.cogsOrders, 1);
  const unknown = r.orders.find((o) => o.orderId === noCost.orderId);
  assert.equal(unknown.profit.net, null);
  assert.equal(unknown.cogs.basis, 'unavailable');
});

test('historical COGS is estimated from the current product cost and labeled estimated', () => {
  const old = order({ items: [{ productId: 'p1', sellingOptionId: 'opt1', quantity: 2, unitPrice: 500 }] });
  const products = [{ productId: 'p1', sellingOptions: [{ id: 'opt1', costPrice: 150 }] }];
  const r = report([old], {}, { products });
  assert.equal(r.orders[0].cogs.amount, 300);
  assert.equal(r.orders[0].cogs.basis, 'estimated');
});

test('payment fee is unavailable (not zero) until a fee % is configured', () => {
  const r = svc.computeReport({
    orders: [order({ paymentMethod: 'Online', paymentStatus: 'paid', status: 'Confirmed' })],
    products: [],
    settings: { finance: { paymentGatewayFeePercent: null }, shipping: {} },
    filters: {},
  });
  assert.equal(r.paymentBreakdown.online.gatewayFees.amount, null);
  assert.equal(r.paymentBreakdown.online.gatewayFees.basis, 'unavailable');
  assert.equal(r.profit.eligibleOrders, 0);
  assert.equal(r.profit.missing.gatewayFeeOrders, 1);
});

test('COD orders carry no gateway fee', () => {
  const r = report([order({ status: 'Delivered' })]);
  assert.equal(r.orders[0].gatewayFee.amount, 0);
});

test('RTO orders are not revenue and add courier + RTO cost', () => {
  const r = report([order({ lastTrackingStatus: 'RTO DELIVERED', status: 'Shipped' })]);
  const row = r.orders[0];
  assert.equal(row.bucket, 'rto');
  assert.equal(r.summary.netRevenue, 0);
  assert.equal(r.shipping.rto.orders, 1);
  assert.equal(row.profit.net, -(40 + 40));
});

test('free-shipping orders without a quote use the average quoted freight, flagged estimated', () => {
  const free = order({ shipping: 0, quotedFreightCharge: null, total: 1180 });
  const r = report([order({ quotedFreightCharge: 50 }), free]);
  assert.equal(r.meta.assumptions.averageQuotedFreight, 50);
  const row = r.orders.find((o) => o.orderId === free.orderId);
  assert.equal(row.courier.amount, 50);
  assert.equal(row.courier.basis, 'estimated');
  assert.equal(r.shipping.freeShippingOrders, 1);
});

test('GST collected counts only collected orders; pending COD GST is separate', () => {
  const r = report([order({ status: 'Delivered' }), order({ status: 'Confirmed' })]);
  assert.equal(r.taxDiscounts.gstCollected, 180);
  assert.equal(r.taxDiscounts.gstOnPendingCod, 180);
});

test('coupon and prepaid discounts are summed over sales only', () => {
  const r = report([
    order({ discountAmount: 100, couponCode: 'X' }),
    order({ status: 'Cancelled', discountAmount: 500 }),
    order({ paymentMethod: 'Online', paymentStatus: 'paid', status: 'Confirmed', prepaidDiscount: 30 }),
  ]);
  assert.equal(r.taxDiscounts.couponDiscounts.amount, 100);
  assert.equal(r.taxDiscounts.couponDiscounts.orders, 1);
  assert.equal(r.taxDiscounts.prepaidDiscounts.amount, 30);
});

test('dates are bucketed by IST, not UTC', () => {
  // 20:00 UTC on the 10th is 01:30 IST on the 11th.
  assert.equal(svc.istDate('2026-10-10T20:00:00.000Z'), '2026-10-11');
  // 18:29 UTC is 23:59 IST — still the 10th.
  assert.equal(svc.istDate('2026-10-10T18:29:00.000Z'), '2026-10-10');
  assert.equal(svc.istDate('2026-10-10T18:30:00.000Z'), '2026-10-11');
});

test('filters apply to every section consistently', () => {
  const orders = [
    order({ createdAt: '2026-10-01T06:00:00.000Z', paymentMethod: 'COD', status: 'Delivered' }),
    order({ createdAt: '2026-10-05T06:00:00.000Z', paymentMethod: 'Online', paymentStatus: 'paid', status: 'Confirmed' }),
    order({ createdAt: '2026-10-09T06:00:00.000Z', paymentMethod: 'COD', status: 'Cancelled' }),
  ];
  const range = report(orders, { from: '2026-10-04', to: '2026-10-10' });
  assert.equal(range.summary.orderCount, 2);
  assert.equal(range.orders.length, 2);
  assert.equal(range.series.reduce((n, d) => n + d.orders, 0), 2);

  const cod = report(orders, { paymentMethod: 'COD' });
  assert.equal(cod.summary.orderCount, 2);
  assert.equal(cod.paymentBreakdown.online.orders, 0);

  const cancelled = report(orders, { status: 'Cancelled' });
  assert.equal(cancelled.summary.orderCount, 1);
  assert.equal(cancelled.summary.grossSales, 0);

  const bucket = report(orders, { bucket: 'collected' });
  assert.equal(bucket.summary.orderCount, 2);
});

test('daily series fills empty days inside the requested range', () => {
  const r = report([order({ createdAt: '2026-10-02T06:00:00.000Z' })], { from: '2026-10-01', to: '2026-10-04' });
  assert.deepEqual(
    r.series.map((d) => d.date),
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
  );
  assert.equal(r.series[0].orders, 0);
  assert.equal(r.series[1].orders, 1);
});

test('legacy orders with no paymentStatus classify like the rest of the app', () => {
  const legacyCod = order({ paymentStatus: undefined, status: 'Confirmed' });
  const legacyOnline = order({ paymentStatus: undefined, paymentMethod: 'Online', status: 'Pending' });
  assert.equal(svc.classifyOrder(legacyCod), 'cod_pending');
  assert.equal(svc.classifyOrder(legacyOnline), 'awaiting_payment');
});

test('scanAll follows LastEvaluatedKey so results are not truncated at the first 1 MB page', async () => {
  const original = docClient.send;
  const pages = [
    { Items: [{ orderId: 'a' }], LastEvaluatedKey: { orderId: 'a' } },
    { Items: [{ orderId: 'b' }], LastEvaluatedKey: { orderId: 'b' } },
    { Items: [{ orderId: 'c' }] },
  ];
  let call = 0;
  docClient.send = async () => pages[call++];
  try {
    const items = await svc.scanAll('any-table');
    assert.deepEqual(items.map((i) => i.orderId), ['a', 'b', 'c']);
    assert.equal(call, 3);
  } finally {
    docClient.send = original;
  }
});
