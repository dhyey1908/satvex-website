const test = require('node:test');
const assert = require('node:assert/strict');

const q = require('./adminListQueries');
const lq = require('../utils/listQuery');

// Parse a raw query-string object the way the controllers do.
const parse = (schema, raw = {}) => schema.parse(raw);
const ids = (items, key = 'orderId') => items.map((i) => i[key]);

// ---------------------------------------------------------------- helpers --

test('sortItems: blanks always sort last, in both directions, and ties are stable', () => {
  const rows = [
    { id: 'a', v: 2 },
    { id: 'b', v: null },
    { id: 'c', v: 1 },
    { id: 'd', v: undefined },
    { id: 'e', v: 2 },
  ];
  const tie = (x, y) => x.id.localeCompare(y.id);
  assert.deepEqual(ids(lq.sortItems(rows, (r) => r.v, 'asc', tie), 'id'), ['c', 'a', 'e', 'b', 'd']);
  assert.deepEqual(ids(lq.sortItems(rows, (r) => r.v, 'desc', tie), 'id'), ['a', 'e', 'c', 'b', 'd']);
});

test('paginate: slices, clamps an out-of-range page, and no page means everything', () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  assert.equal(lq.paginate(items, { page: 3, pageSize: 20 }).items.length, 5);
  const clamped = lq.paginate(items, { page: 99, pageSize: 20 });
  assert.equal(clamped.pagination.page, 3);
  assert.equal(clamped.pagination.totalPages, 3);
  const all = lq.paginate(items, {});
  assert.equal(all.items.length, 45);
  assert.equal(all.pagination.total, 45);
});

test('inDateRange uses the IST day, not the UTC day', () => {
  // 2026-10-10 20:00 UTC is already 2026-10-11 01:30 IST.
  assert.equal(lq.istDay('2026-10-10T20:00:00.000Z'), '2026-10-11');
  assert.equal(lq.inDateRange('2026-10-10T20:00:00.000Z', '2026-10-11', '2026-10-11'), true);
  assert.equal(lq.inDateRange('2026-10-10T20:00:00.000Z', '2026-10-10', '2026-10-10'), false);
  assert.equal(lq.inDateRange(undefined, '2026-10-10', undefined), false);
  assert.equal(lq.inDateRange(undefined, undefined, undefined), true);
});

test('scanAll follows LastEvaluatedKey across pages', async () => {
  const pages = [
    { Items: [{ id: 1 }], LastEvaluatedKey: { id: 1 } },
    { Items: [{ id: 2 }], LastEvaluatedKey: { id: 2 } },
    { Items: [{ id: 3 }] },
  ];
  const seenKeys = [];
  const fakeClient = {
    send: async (cmd) => {
      seenKeys.push(cmd.input.ExclusiveStartKey);
      return pages.shift();
    },
  };
  const items = await lq.scanAll(fakeClient, 'T');
  assert.deepEqual(ids(items, 'id'), [1, 2, 3]);
  assert.deepEqual(seenKeys, [undefined, { id: 1 }, { id: 2 }]);
});

test('query schemas treat blank params as "no filter" and reject bad values', () => {
  const parsed = parse(q.ordersQuerySchema, { status: '', search: '', page: '2', sortBy: 'total', sortDir: 'asc' });
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.sortBy, 'total');
  assert.throws(() => parse(q.ordersQuerySchema, { sortBy: 'password' }));
  assert.throws(() => parse(q.ordersQuerySchema, { status: 'Teleported' }));
  assert.throws(() => parse(q.ordersQuerySchema, { pageSize: '5000' }));
  assert.throws(() => parse(q.ordersQuerySchema, { dateFrom: '2026-10-12', dateTo: '2026-10-01' }));
});

// ----------------------------------------------------------------- orders --

function order(overrides = {}) {
  return {
    orderId: `o${Math.random().toString(36).slice(2, 8)}`,
    createdAt: '2026-10-10T08:00:00.000Z',
    paymentMethod: 'COD',
    paymentStatus: 'not_required',
    status: 'Pending',
    total: 500,
    customer: { name: 'Asha Rao', email: 'asha@example.com', phone: '9876543210' },
    ...overrides,
  };
}

const ORDERS = [
  order({ orderId: 'a1', createdAt: '2026-10-01T05:00:00.000Z', total: 300, paymentMethod: 'COD', status: 'Delivered', shipmentStatus: 'label_generated', courierName: 'Delhivery', lastTrackingStatus: 'Delivered' }),
  order({ orderId: 'b2', createdAt: '2026-10-03T05:00:00.000Z', total: 1200, paymentMethod: 'Online', paymentStatus: 'paid', status: 'Shipped', shipmentStatus: 'awb_assigned', courierName: 'Bluedart', lastTrackingStatus: 'In Transit' }),
  order({ orderId: 'c3', createdAt: '2026-10-05T05:00:00.000Z', total: 800, paymentMethod: 'Online', paymentStatus: 'awaiting_payment', lastPaymentAttemptStatus: 'FAILED', status: 'Pending', customer: { name: 'Vikram Shah', email: 'v@example.com', phone: '9123456780' } }),
  order({ orderId: 'd4', createdAt: '2026-10-07T05:00:00.000Z', total: 150, paymentMethod: 'Online', paymentStatus: 'expired', status: 'Cancelled' }),
  order({ orderId: 'e5', createdAt: '2026-10-09T05:00:00.000Z', total: 999, paymentMethod: 'COD', status: 'Confirmed', shipmentStatus: 'sync_failed' }),
];

test('orders: default is newest first', () => {
  const r = q.queryOrders(ORDERS, parse(q.ordersQuerySchema));
  assert.deepEqual(ids(r.items), ['e5', 'd4', 'c3', 'b2', 'a1']);
});

test('orders: sort by oldest, amount (both ways), method, status, payment, shipping', () => {
  const run = (sortBy, sortDir) => ids(q.queryOrders(ORDERS, parse(q.ordersQuerySchema, { sortBy, sortDir })).items);
  assert.deepEqual(run('createdAt', 'asc'), ['a1', 'b2', 'c3', 'd4', 'e5']);
  assert.deepEqual(run('total', 'desc'), ['b2', 'e5', 'c3', 'a1', 'd4']);
  assert.deepEqual(run('total', 'asc'), ['d4', 'a1', 'c3', 'e5', 'b2']);
  // COD < Online alphabetically; ties fall back to newest first.
  assert.deepEqual(run('paymentMethod', 'asc'), ['e5', 'a1', 'd4', 'c3', 'b2']);
  // Workflow order Pending..Cancelled.
  assert.deepEqual(run('status', 'asc'), ['c3', 'e5', 'b2', 'a1', 'd4']);
  // paid, (confirming, awaiting), dropped, failed, expired, COD last.
  assert.deepEqual(run('paymentStatus', 'asc'), ['b2', 'c3', 'd4', 'e5', 'a1']);
  // not_created(0) ... label_generated(4), sync_failed(5)
  assert.deepEqual(run('shipmentStatus', 'asc'), ['d4', 'c3', 'b2', 'a1', 'e5']);
});

test('orders: filters combine with AND and the facets list real couriers', () => {
  const only = (raw) => ids(q.queryOrders(ORDERS, parse(q.ordersQuerySchema, raw)).items);
  assert.deepEqual(only({ paymentMethod: 'Online' }), ['d4', 'c3', 'b2']);
  assert.deepEqual(only({ paymentMethod: 'Online', status: 'Pending' }), ['c3']);
  assert.deepEqual(only({ paymentStatus: 'failed' }), ['c3']);
  assert.deepEqual(only({ paymentStatus: 'expired' }), ['d4']);
  assert.deepEqual(only({ shipmentStatus: 'sync_failed' }), ['e5']);
  assert.deepEqual(only({ shipmentStatus: 'not_created' }), ['d4', 'c3']);
  assert.deepEqual(only({ courier: 'Bluedart' }), ['b2']);
  assert.deepEqual(only({ deliveryStatus: 'Delivered' }), ['a1']);
  assert.deepEqual(only({ dateFrom: '2026-10-03', dateTo: '2026-10-07' }), ['d4', 'c3', 'b2']);
  assert.deepEqual(only({ search: 'vikram' }), ['c3']);
  assert.deepEqual(only({ search: '98765' }), ['e5', 'd4', 'b2', 'a1']);
  assert.deepEqual(only({ search: 'B2' }), ['b2']);
  assert.deepEqual(only({ paymentMethod: 'COD', status: 'Pending' }), []);

  const facets = q.queryOrders(ORDERS, parse(q.ordersQuerySchema, { courier: 'Bluedart' })).facets;
  assert.deepEqual(facets.couriers, ['Bluedart', 'Delhivery']);
  assert.deepEqual(facets.deliveryStatuses, ['Delivered', 'In Transit']);
});

test('orders: sorting + paging run over the whole set, not just one page', () => {
  const p1 = q.queryOrders(ORDERS, parse(q.ordersQuerySchema, { sortBy: 'total', sortDir: 'desc', page: '1', pageSize: '2' }));
  const p2 = q.queryOrders(ORDERS, parse(q.ordersQuerySchema, { sortBy: 'total', sortDir: 'desc', page: '2', pageSize: '2' }));
  const p3 = q.queryOrders(ORDERS, parse(q.ordersQuerySchema, { sortBy: 'total', sortDir: 'desc', page: '3', pageSize: '2' }));
  assert.deepEqual(ids(p1.items), ['b2', 'e5']);
  assert.deepEqual(ids(p2.items), ['c3', 'a1']);
  assert.deepEqual(ids(p3.items), ['d4']);
  assert.equal(p1.pagination.total, 5);
  assert.equal(p1.pagination.totalPages, 3);
});

// -------------------------------------------------------------- customers --

test('customers: totalSpent counts only collected orders; admins excluded', () => {
  const users = [
    { userId: 'u1', name: 'Zoya', email: 'z@x.com', phone: '9000000001', createdAt: '2026-09-01T00:00:00.000Z' },
    { userId: 'u2', name: 'Aman', email: 'a@x.com', phone: '9000000002', createdAt: '2026-09-15T00:00:00.000Z' },
    { userId: 'u3', name: 'Neha', email: 'n@x.com', phone: null, createdAt: '2026-09-20T00:00:00.000Z' },
    { userId: 'adm', name: 'Boss', email: 'b@x.com', role: 'admin', createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  const orders = [
    order({ userId: 'u1', orderId: 'x1', paymentMethod: 'Online', paymentStatus: 'paid', total: 1000, status: 'Confirmed' }),
    order({ userId: 'u1', orderId: 'x2', paymentMethod: 'COD', status: 'Delivered', total: 500 }),
    order({ userId: 'u1', orderId: 'x3', paymentMethod: 'COD', status: 'Cancelled', total: 700 }),
    order({ userId: 'u2', orderId: 'x4', paymentMethod: 'Online', paymentStatus: 'expired', total: 400 }),
  ];
  const rows = q.buildCustomerRows(users, orders);
  assert.equal(rows.length, 3);
  const byId = Object.fromEntries(rows.map((r) => [r.userId, r]));
  assert.equal(byId.u1.orderCount, 3);
  assert.equal(byId.u1.totalSpent, 1500);
  assert.equal(byId.u2.orderCount, 1);
  assert.equal(byId.u2.totalSpent, 0);
  assert.equal(byId.u3.orderCount, 0);

  const run = (raw) => ids(q.queryCustomers(rows, parse(q.customersQuerySchema, raw)).items, 'userId');
  // u2 and u3 both spent 0 -> tie falls back to newest registration first.
  assert.deepEqual(run({ sortBy: 'totalSpent', sortDir: 'desc' }), ['u1', 'u3', 'u2']);
  assert.deepEqual(run({ sortBy: 'totalSpent', sortDir: 'asc' }), ['u3', 'u2', 'u1']);
  assert.deepEqual(run({ sortBy: 'orderCount', sortDir: 'desc' }), ['u1', 'u2', 'u3']);
  assert.deepEqual(run({ sortBy: 'name', sortDir: 'asc' }), ['u2', 'u3', 'u1']);
  assert.deepEqual(run({}), ['u3', 'u2', 'u1']); // newest registration first
  assert.deepEqual(run({ hasOrders: 'no' }), ['u3']);
  assert.deepEqual(run({ hasOrders: 'yes', sortBy: 'name', sortDir: 'asc' }), ['u2', 'u1']);
  assert.deepEqual(run({ search: 'zoya' }), ['u1']);
  assert.deepEqual(run({ search: '+91 90000-00002' }), ['u2']);
  assert.deepEqual(run({ search: '9000000' }).sort(), ['u1', 'u2']);
});

// --------------------------------------------------------------- products --

const PRODUCTS = [
  { productId: 'p1', name: 'Butterfly', slug: 'butterfly', basePrice: 249, isActive: true, isFeatured: true, createdAt: '2026-09-01T00:00:00.000Z',
    variants: [{ colorName: 'Black', isActive: true, inStock: true }, { colorName: 'Pink', isActive: true, inStock: false }],
    sellingOptions: [{ isActive: true, price: 149, compareAtPrice: 249 }, { isActive: true, price: 199, compareAtPrice: 349 }] },
  { productId: 'p2', name: 'Anklet', slug: 'anklet', basePrice: 99, isActive: true, isFeatured: false, createdAt: '2026-09-10T00:00:00.000Z',
    variants: [{ colorName: 'Gold', isActive: true, inStock: true }],
    sellingOptions: [{ isActive: true, price: 99 }] },
  { productId: 'p3', name: 'Choker', slug: 'choker', basePrice: 399, isActive: false, isFeatured: false, createdAt: '2026-09-20T00:00:00.000Z',
    variants: [{ colorName: 'Black', isActive: true, inStock: false }],
    sellingOptions: [{ isActive: true, price: 349, compareAtPrice: 399 }] },
];

test('products: listing price, best discount and stock status are derived server-side', () => {
  assert.equal(q.listedPrice(PRODUCTS[0]), 149);
  assert.equal(q.maxDiscountPercent(PRODUCTS[0]), 43); // 199 vs 349
  assert.equal(q.maxDiscountPercent(PRODUCTS[1]), 0);
  assert.equal(q.stockStatus(PRODUCTS[0]), 'partial');
  assert.equal(q.stockStatus(PRODUCTS[1]), 'in_stock');
  assert.equal(q.stockStatus(PRODUCTS[2]), 'out_of_stock');
});

test('products: sort and filter', () => {
  const run = (raw) => ids(q.queryProducts(PRODUCTS, parse(q.productsQuerySchema, raw)).items, 'productId');
  assert.deepEqual(run({ sortBy: 'name', sortDir: 'asc' }), ['p2', 'p1', 'p3']);
  assert.deepEqual(run({ sortBy: 'price', sortDir: 'asc' }), ['p2', 'p1', 'p3']);
  assert.deepEqual(run({ sortBy: 'price', sortDir: 'desc' }), ['p3', 'p1', 'p2']);
  assert.deepEqual(run({ sortBy: 'createdAt', sortDir: 'desc' }), ['p3', 'p2', 'p1']);
  // p2 has no discount -> last in both directions.
  assert.deepEqual(run({ sortBy: 'discount', sortDir: 'desc' }), ['p1', 'p3', 'p2']);
  assert.deepEqual(run({ sortBy: 'discount', sortDir: 'asc' }), ['p3', 'p1', 'p2']);
  // in stock, partial, out of stock, then inactive.
  assert.deepEqual(run({ sortBy: 'availability', sortDir: 'asc' }), ['p2', 'p1', 'p3']);
  assert.deepEqual(run({ status: 'active' }), ['p2', 'p1']);
  assert.deepEqual(run({ status: 'inactive' }), ['p3']);
  assert.deepEqual(run({ status: 'featured' }), ['p1']);
  assert.deepEqual(run({ color: 'Black' }).sort(), ['p1', 'p3']);
  assert.deepEqual(run({ stock: 'partial' }), ['p1']);
  assert.deepEqual(run({ color: 'Black', stock: 'out_of_stock' }), ['p3']);
  assert.deepEqual(run({ search: 'ankl' }), ['p2']);
  const r = q.queryProducts(PRODUCTS, parse(q.productsQuerySchema, {}));
  assert.deepEqual(r.facets.colors, ['Black', 'Gold', 'Pink']);
  assert.equal(r.items.find((p) => p.productId === 'p1').listing.discountPercent, 43);
});

// ---------------------------------------------------------------- reviews --

test('reviews: sort by date/rating and filter by rating, product, date, text', () => {
  const reviews = [
    { reviewId: 'r1', productId: 'p1', rating: 5, userName: 'Asha', title: 'Lovely', comment: 'Great quality', createdAt: '2026-10-01T05:00:00.000Z' },
    { reviewId: 'r2', productId: 'p1', rating: 2, userName: 'Ben', title: '', comment: 'Broke quickly', createdAt: '2026-10-05T05:00:00.000Z' },
    { reviewId: 'r3', productId: 'p2', rating: 4, userName: 'Cara', title: '', comment: 'Nice colour', createdAt: '2026-10-08T05:00:00.000Z' },
  ];
  const run = (raw) => ids(q.queryReviews(reviews, parse(q.reviewsQuerySchema, raw)).items, 'reviewId');
  assert.deepEqual(run({}), ['r3', 'r2', 'r1']);
  assert.deepEqual(run({ sortBy: 'createdAt', sortDir: 'asc' }), ['r1', 'r2', 'r3']);
  assert.deepEqual(run({ sortBy: 'rating', sortDir: 'desc' }), ['r1', 'r3', 'r2']);
  assert.deepEqual(run({ sortBy: 'rating', sortDir: 'asc' }), ['r2', 'r3', 'r1']);
  assert.deepEqual(run({ rating: '4' }), ['r3']);
  assert.deepEqual(run({ productId: 'p1' }), ['r2', 'r1']);
  assert.deepEqual(run({ productId: 'p1', rating: '5' }), ['r1']);
  assert.deepEqual(run({ dateFrom: '2026-10-04' }), ['r3', 'r2']);
  assert.deepEqual(run({ search: 'quality' }), ['r1']);
});

// ---------------------------------------------------------------- coupons --

test('coupons: derived status, expiry sort (no-expiry last), usage sort and filters', () => {
  const now = new Date('2026-10-14T00:00:00.000Z').getTime();
  const coupons = [
    { code: 'LIVE10', discountType: 'percentage', isActive: true, usageCount: 5, usageLimit: 100, expiresAt: '2026-12-31T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' },
    { code: 'OLD5', discountType: 'flat', isActive: true, usageCount: 40, expiresAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' },
    { code: 'OFF20', discountType: 'percentage', isActive: false, usageCount: 0, createdAt: '2026-10-10T00:00:00.000Z' },
    { code: 'FULL', discountType: 'flat', isActive: true, usageCount: 10, usageLimit: 10, expiresAt: '', createdAt: '2026-09-01T00:00:00.000Z' },
  ];
  assert.equal(q.couponStatus(coupons[0], now), 'active');
  assert.equal(q.couponStatus(coupons[1], now), 'expired');
  assert.equal(q.couponStatus(coupons[2], now), 'inactive');
  assert.equal(q.couponStatus(coupons[3], now), 'exhausted');

  const run = (raw) => ids(q.queryCoupons(coupons, parse(q.couponsQuerySchema, raw), now).items, 'code');
  assert.deepEqual(run({}), ['OFF20', 'LIVE10', 'FULL', 'OLD5']);
  assert.deepEqual(run({ sortBy: 'expiresAt', sortDir: 'asc' }), ['OLD5', 'LIVE10', 'OFF20', 'FULL']);
  assert.deepEqual(run({ sortBy: 'expiresAt', sortDir: 'desc' }), ['LIVE10', 'OLD5', 'OFF20', 'FULL']);
  assert.deepEqual(run({ sortBy: 'usageCount', sortDir: 'desc' }), ['OLD5', 'FULL', 'LIVE10', 'OFF20']);
  assert.deepEqual(run({ sortBy: 'status', sortDir: 'asc' }), ['LIVE10', 'FULL', 'OFF20', 'OLD5']);
  assert.deepEqual(run({ status: 'expired' }), ['OLD5']);
  assert.deepEqual(run({ status: 'active' }), ['LIVE10']);
  assert.deepEqual(run({ discountType: 'flat' }), ['FULL', 'OLD5']);
  assert.deepEqual(run({ search: 'off' }), ['OFF20']);
  assert.equal(q.queryCoupons(coupons, parse(q.couponsQuerySchema, {}), now).items[0].effectiveStatus, 'inactive');
});

// --------------------------------------------------------------- contacts --

test('contacts: legacy records count as open; filter by type, status, date', () => {
  const contacts = [
    { contactId: 'c1', enquiryType: 'payment_issue', name: 'Asha', message: 'Charged twice', createdAt: '2026-10-02T05:00:00.000Z' },
    { contactId: 'c2', enquiryType: 'return_refund_exchange', name: 'Ben', message: 'Damaged', status: 'resolved', createdAt: '2026-10-06T05:00:00.000Z' },
    { contactId: 'c3', name: 'Cara', message: 'Hello', createdAt: '2026-10-09T05:00:00.000Z' },
  ];
  const run = (raw) => ids(q.queryContacts(contacts, parse(q.contactsQuerySchema, raw)).items, 'contactId');
  assert.deepEqual(run({}), ['c3', 'c2', 'c1']);
  assert.deepEqual(run({ sortDir: 'asc' }), ['c1', 'c2', 'c3']);
  assert.deepEqual(run({ status: 'open' }), ['c3', 'c1']);
  assert.deepEqual(run({ status: 'resolved' }), ['c2']);
  assert.deepEqual(run({ enquiryType: 'payment_issue' }), ['c1']);
  assert.deepEqual(run({ enquiryType: 'general_enquiry' }), ['c3']); // no type stored -> general
  assert.deepEqual(run({ dateFrom: '2026-10-05', dateTo: '2026-10-08' }), ['c2']);
  assert.deepEqual(run({ status: 'open', enquiryType: 'payment_issue', search: 'twice' }), ['c1']);
  assert.equal(q.queryContacts(contacts, parse(q.contactsQuerySchema, {})).items[0].status, 'open');
});

// --------------------------------------------------- shipment sync issues --

test('sync issues: filter by retry status, courier, delivery status; sort', () => {
  const issues = [
    { orderId: 'i1', customerName: 'Asha', total: 500, paidAt: '2026-10-05T05:00:00.000Z', shipmentStatus: 'not_created', bucket: 'failed', attempts: 5, courierName: null, deliveryStatus: null },
    { orderId: 'i2', customerName: 'Ben', total: 900, paidAt: '2026-10-07T05:00:00.000Z', shipmentStatus: 'awb_assigned', bucket: 'retrying', attempts: 1, courierName: 'Delhivery', deliveryStatus: 'In Transit' },
    { orderId: 'i3', customerName: 'Cara', total: 300, paidAt: '2026-10-09T05:00:00.000Z', shipmentStatus: 'not_created', bucket: 'no_job', attempts: 0, courierName: null, deliveryStatus: null },
  ];
  const run = (raw) => ids(q.querySyncIssues(issues, parse(q.syncIssuesQuerySchema, raw)).items);
  assert.deepEqual(run({}), ['i3', 'i2', 'i1']);
  assert.deepEqual(run({ bucket: 'failed' }), ['i1']);
  assert.deepEqual(run({ shipmentStatus: 'not_created' }), ['i3', 'i1']);
  assert.deepEqual(run({ courier: 'Delhivery' }), ['i2']);
  assert.deepEqual(run({ deliveryStatus: 'In Transit' }), ['i2']);
  assert.deepEqual(run({ sortBy: 'attempts', sortDir: 'desc' }), ['i1', 'i2', 'i3']);
  assert.deepEqual(run({ sortBy: 'total', sortDir: 'asc' }), ['i3', 'i1', 'i2']);
  assert.deepEqual(run({ sortBy: 'bucket', sortDir: 'asc' }), ['i1', 'i3', 'i2']);
  assert.deepEqual(run({ search: 'ben' }), ['i2']);
});
