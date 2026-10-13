// Server-side search / filter / sort / pagination for every admin list
// screen. Each `query*` function is pure (items in -> { items, pagination,
// ...facets } out) so it can be unit-tested without DynamoDB, and each
// `*QuerySchema` validates the query string for that screen. All of it runs
// over the COMPLETE record set — see utils/listQuery.js.
const {
  z,
  optional,
  isoDay,
  listShape,
  dateRangeShape,
  checkDateRange,
  DATE_RANGE_ERROR,
  inDateRange,
  matchesSearch,
  sortItems,
  newestFirst,
  paginate,
} = require('../utils/listQuery');
const { classifyOrder } = require('./financialAnalyticsService');

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const SHIPMENT_STATUSES = [
  'not_created',
  'order_created',
  'awb_assigned',
  'pickup_scheduled',
  'label_generated',
  'sync_failed',
];

// ---------------------------------------------------------------- orders ---

// Mirrors frontend utils/paymentStatus.effectivePaymentStatus: what actually
// happened with the payment (a failed/dropped ATTEMPT is layered on top of an
// order that's still `awaiting_payment`).
function effectivePayment(order) {
  if (order.paymentMethod === 'COD') return 'not_required';
  if (order.paymentStatus === 'paid') return 'paid';
  if (order.paymentStatus === 'expired') return 'expired';
  if (order.paymentStatus === 'awaiting_payment' || !order.paymentStatus) {
    if (order.lastPaymentAttemptStatus === 'FAILED') return 'failed';
    if (order.lastPaymentAttemptStatus === 'USER_DROPPED') return 'dropped';
    if (order.lastPaymentAttemptStatus === 'PENDING') return 'confirming';
    return 'awaiting';
  }
  return order.paymentStatus;
}

// Sorting by payment state groups like with like, healthiest first.
const PAYMENT_RANK = { paid: 0, confirming: 1, awaiting: 2, dropped: 3, failed: 4, expired: 5, not_required: 6 };

const ordersQuerySchema = z
  .object({
    ...listShape({
      sortFields: ['createdAt', 'total', 'paymentStatus', 'status', 'paymentMethod', 'shipmentStatus'],
      defaultSort: 'createdAt',
    }),
    ...dateRangeShape,
    status: optional(z.enum(ORDER_STATUSES)),
    paymentMethod: optional(z.enum(['COD', 'Online'])),
    paymentStatus: optional(z.enum(['paid', 'awaiting', 'confirming', 'failed', 'dropped', 'expired'])),
    shipmentStatus: optional(z.enum(SHIPMENT_STATUSES)),
    courier: optional(z.string().trim().max(80)),
    deliveryStatus: optional(z.string().trim().max(80)),
  })
  .refine(checkDateRange, DATE_RANGE_ERROR);

const ORDER_SORT = {
  createdAt: (o) => o.createdAt,
  total: (o) => Number(o.total ?? 0),
  paymentStatus: (o) => PAYMENT_RANK[effectivePayment(o)] ?? 99,
  status: (o) => ORDER_STATUSES.indexOf(o.status),
  paymentMethod: (o) => o.paymentMethod,
  shipmentStatus: (o) => SHIPMENT_STATUSES.indexOf(o.shipmentStatus || 'not_created'),
};

function filterOrders(orders, q) {
  return orders.filter((o) => {
    if (q.status && o.status !== q.status) return false;
    if (q.paymentMethod && o.paymentMethod !== q.paymentMethod) return false;
    if (q.paymentStatus && effectivePayment(o) !== q.paymentStatus) return false;
    if (q.shipmentStatus && (o.shipmentStatus || 'not_created') !== q.shipmentStatus) return false;
    if (q.courier && o.courierName !== q.courier) return false;
    if (q.deliveryStatus && o.lastTrackingStatus !== q.deliveryStatus) return false;
    if (!inDateRange(o.createdAt, q.dateFrom, q.dateTo)) return false;
    return matchesSearch(q.search, [
      o.orderId,
      o.customer?.name,
      o.customer?.email,
      o.customer?.phone,
      o.awbCode,
    ]);
  });
}

function distinct(values) {
  return [...new Set(values.filter((v) => v))].sort((a, b) => String(a).localeCompare(String(b)));
}

function queryOrders(orders, q) {
  const filtered = filterOrders(orders, q);
  const sorted = sortItems(filtered, ORDER_SORT[q.sortBy], q.sortDir, newestFirst);
  const { items, pagination } = paginate(sorted, q);
  return {
    items,
    pagination,
    // Dropdown options come from the real data (couriers/tracking states are
    // free text from Shiprocket), built from ALL orders so choosing one
    // doesn't make the other options disappear.
    facets: {
      couriers: distinct(orders.map((o) => o.courierName)),
      deliveryStatuses: distinct(orders.map((o) => o.lastTrackingStatus)),
    },
  };
}

// ------------------------------------------------------------- customers ---

// One row per non-admin user. `totalSpent` is what the customer has actually
// paid for: online-paid + delivered COD orders (the same "collected" bucket
// the Financial Analytics screen reports as net revenue) — cancelled,
// refunded, expired and not-yet-paid orders don't count.
function buildCustomerRows(users, orders) {
  const byUser = new Map();
  for (const order of orders) {
    const entry = byUser.get(order.userId) || { orderCount: 0, totalSpent: 0, lastOrderAt: null };
    entry.orderCount += 1;
    if (classifyOrder(order) === 'collected') entry.totalSpent += Number(order.total || 0);
    if (!entry.lastOrderAt || order.createdAt > entry.lastOrderAt) entry.lastOrderAt = order.createdAt;
    byUser.set(order.userId, entry);
  }
  return users
    .filter((u) => u.role !== 'admin')
    .map((u) => {
      const stats = byUser.get(u.userId) || { orderCount: 0, totalSpent: 0, lastOrderAt: null };
      return {
        userId: u.userId,
        name: u.name,
        email: u.email,
        phone: u.phone || null,
        createdAt: u.createdAt,
        orderCount: stats.orderCount,
        totalSpent: Math.round(stats.totalSpent * 100) / 100,
        lastOrderAt: stats.lastOrderAt,
      };
    });
}

const customersQuerySchema = z
  .object({
    ...listShape({ sortFields: ['name', 'createdAt', 'orderCount', 'totalSpent'], defaultSort: 'createdAt' }),
    ...dateRangeShape,
    hasOrders: optional(z.enum(['yes', 'no'])),
  })
  .refine(checkDateRange, DATE_RANGE_ERROR);

const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');

function customerMatches(term, c) {
  if (!term) return true;
  if (matchesSearch(term, [c.name, c.email, c.phone])) return true;
  // '99136 85802' and '+91 99136-85802' should both find the mobile number
  // (stored as 10 digits): either the term sits inside the number, or the
  // term is the number with a country code in front.
  const digits = digitsOnly(term);
  const phone = digitsOnly(c.phone);
  if (!phone || digits.length < 3) return false;
  return phone.includes(digits) || (digits.length > phone.length && digits.endsWith(phone));
}

const CUSTOMER_SORT = {
  name: (c) => (c.name || '').toLowerCase(),
  createdAt: (c) => c.createdAt,
  orderCount: (c) => c.orderCount,
  totalSpent: (c) => c.totalSpent,
};

function queryCustomers(rows, q) {
  const filtered = rows.filter((c) => {
    if (q.hasOrders === 'yes' && c.orderCount === 0) return false;
    if (q.hasOrders === 'no' && c.orderCount > 0) return false;
    if (!inDateRange(c.createdAt, q.dateFrom, q.dateTo)) return false;
    return customerMatches(q.search, c);
  });
  const sorted = sortItems(filtered, CUSTOMER_SORT[q.sortBy], q.sortDir, newestFirst);
  return paginate(sorted, q);
}

// -------------------------------------------------------------- products ---

function activeOptions(p) {
  return (p.sellingOptions || []).filter((o) => o.isActive);
}

// Cheapest active pack, falling back to the base price — same rule the shop
// page uses for "From ₹x" / price sorting.
function listedPrice(p) {
  const prices = activeOptions(p).map((o) => o.price);
  return prices.length ? Math.min(...prices) : p.basePrice;
}

// Biggest "% off" across active packs that carry a compare-at price.
function maxDiscountPercent(p) {
  let best = 0;
  for (const o of activeOptions(p)) {
    if (o.compareAtPrice && o.compareAtPrice > o.price) {
      best = Math.max(best, Math.round(((o.compareAtPrice - o.price) / o.compareAtPrice) * 100));
    }
  }
  return best;
}

// in_stock = every live colour purchasable; partial = some colours sold out;
// out_of_stock = no live colour purchasable.
function stockStatus(p) {
  const live = (p.variants || []).filter((v) => v.isActive);
  const inStock = live.filter((v) => v.inStock !== false).length;
  if (live.length === 0 || inStock === 0) return 'out_of_stock';
  return inStock === live.length ? 'in_stock' : 'partial';
}

const STOCK_RANK = { in_stock: 0, partial: 1, out_of_stock: 2 };

const productsQuerySchema = z.object({
  ...listShape({
    sortFields: ['name', 'price', 'createdAt', 'discount', 'availability'],
    defaultSort: 'createdAt',
  }),
  status: optional(z.enum(['active', 'inactive', 'featured'])),
  color: optional(z.string().trim().max(60)),
  stock: optional(z.enum(['in_stock', 'partial', 'out_of_stock'])),
});

const PRODUCT_SORT = {
  name: (p) => (p.name || '').toLowerCase(),
  price: (p) => listedPrice(p),
  createdAt: (p) => p.createdAt,
  // 0% sorts as "no discount" (last when descending-by-discount is wanted).
  discount: (p) => maxDiscountPercent(p) || null,
  // Inactive products are unavailable regardless of their colours' stock.
  availability: (p) => (p.isActive ? STOCK_RANK[stockStatus(p)] : 3),
};

function queryProducts(products, q) {
  const filtered = products.filter((p) => {
    if (q.status === 'active' && !p.isActive) return false;
    if (q.status === 'inactive' && p.isActive) return false;
    if (q.status === 'featured' && !p.isFeatured) return false;
    if (q.color && !(p.variants || []).some((v) => v.colorName === q.color)) return false;
    if (q.stock && stockStatus(p) !== q.stock) return false;
    return matchesSearch(q.search, [p.name, p.slug]);
  });
  const sorted = sortItems(filtered, PRODUCT_SORT[q.sortBy], q.sortDir, newestFirst);
  const { items, pagination } = paginate(sorted, q);
  return {
    // Derived figures ride along on each row so the screen only displays them.
    items: items.map((p) => ({
      ...p,
      listing: { price: listedPrice(p), discountPercent: maxDiscountPercent(p), stockStatus: stockStatus(p) },
    })),
    pagination,
    facets: { colors: distinct(products.flatMap((p) => (p.variants || []).map((v) => v.colorName))) },
  };
}

// --------------------------------------------------------------- reviews ---

const reviewsQuerySchema = z
  .object({
    ...listShape({ sortFields: ['createdAt', 'rating'], defaultSort: 'createdAt' }),
    ...dateRangeShape,
    rating: optional(z.coerce.number().int().min(1).max(5)),
    productId: optional(z.string().trim().max(100)),
  })
  .refine(checkDateRange, DATE_RANGE_ERROR);

const REVIEW_SORT = { createdAt: (r) => r.createdAt, rating: (r) => r.rating };

function queryReviews(reviews, q) {
  const filtered = reviews.filter((r) => {
    if (q.rating && r.rating !== q.rating) return false;
    if (q.productId && r.productId !== q.productId) return false;
    if (!inDateRange(r.createdAt, q.dateFrom, q.dateTo)) return false;
    return matchesSearch(q.search, [r.userName, r.title, r.comment]);
  });
  const sorted = sortItems(filtered, REVIEW_SORT[q.sortBy], q.sortDir, newestFirst);
  return paginate(sorted, q);
}

// --------------------------------------------------------------- coupons ---

// expired beats everything (checkout rejects it regardless); exhausted =
// usage limit reached; otherwise the admin's own active toggle.
function couponStatus(coupon, now = Date.now()) {
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return 'expired';
  if (coupon.usageLimit && (coupon.usageCount || 0) >= coupon.usageLimit) return 'exhausted';
  return coupon.isActive ? 'active' : 'inactive';
}
const COUPON_RANK = { active: 0, exhausted: 1, inactive: 2, expired: 3 };

const couponsQuerySchema = z.object({
  ...listShape({ sortFields: ['createdAt', 'expiresAt', 'usageCount', 'status', 'code'], defaultSort: 'createdAt' }),
  status: optional(z.enum(['active', 'inactive', 'expired', 'exhausted'])),
  discountType: optional(z.enum(['percentage', 'flat'])),
});

function queryCoupons(coupons, q, now = Date.now()) {
  const withStatus = coupons.map((c) => ({ ...c, effectiveStatus: couponStatus(c, now) }));
  const filtered = withStatus.filter((c) => {
    if (q.status && c.effectiveStatus !== q.status) return false;
    if (q.discountType && c.discountType !== q.discountType) return false;
    return matchesSearch(q.search, [c.code]);
  });
  const accessors = {
    createdAt: (c) => c.createdAt,
    // '' (cleared) and undefined both mean "no expiry" -> last.
    expiresAt: (c) => c.expiresAt || null,
    usageCount: (c) => c.usageCount || 0,
    status: (c) => COUPON_RANK[c.effectiveStatus],
    code: (c) => c.code,
  };
  const sorted = sortItems(filtered, accessors[q.sortBy], q.sortDir, newestFirst);
  return paginate(sorted, q);
}

// -------------------------------------------------------------- contacts ---

const CONTACT_STATUSES = ['open', 'resolved'];

const contactsQuerySchema = z
  .object({
    ...listShape({ sortFields: ['createdAt'], defaultSort: 'createdAt' }),
    ...dateRangeShape,
    enquiryType: optional(z.string().trim().max(60)),
    status: optional(z.enum(CONTACT_STATUSES)),
  })
  .refine(checkDateRange, DATE_RANGE_ERROR);

// Records created before resolution tracking have no status — they're open.
const contactStatus = (c) => c.status || 'open';

function queryContacts(contacts, q) {
  const filtered = contacts.filter((c) => {
    if (q.enquiryType && (c.enquiryType || 'general_enquiry') !== q.enquiryType) return false;
    if (q.status && contactStatus(c) !== q.status) return false;
    if (!inDateRange(c.createdAt, q.dateFrom, q.dateTo)) return false;
    return matchesSearch(q.search, [c.name, c.email, c.phone, c.message, c.orderId]);
  });
  const sorted = sortItems(filtered, (c) => c.createdAt, q.sortDir, newestFirst);
  const { items, pagination } = paginate(sorted, q);
  return { items: items.map((c) => ({ ...c, status: contactStatus(c) })), pagination };
}

// ------------------------------------------------- shipment sync issues ---

const syncIssuesQuerySchema = z
  .object({
    ...listShape({ sortFields: ['paidAt', 'total', 'attempts', 'bucket'], defaultSort: 'paidAt' }),
    ...dateRangeShape,
    bucket: optional(z.enum(['retrying', 'failed', 'no_job'])),
    shipmentStatus: optional(z.enum(SHIPMENT_STATUSES)),
    courier: optional(z.string().trim().max(80)),
    deliveryStatus: optional(z.string().trim().max(80)),
  })
  .refine(checkDateRange, DATE_RANGE_ERROR);

const BUCKET_RANK = { failed: 0, no_job: 1, retrying: 2 };

function querySyncIssues(issues, q) {
  const filtered = issues.filter((i) => {
    if (q.bucket && i.bucket !== q.bucket) return false;
    if (q.shipmentStatus && i.shipmentStatus !== q.shipmentStatus) return false;
    if (q.courier && i.courierName !== q.courier) return false;
    if (q.deliveryStatus && i.deliveryStatus !== q.deliveryStatus) return false;
    if (!inDateRange(i.paidAt, q.dateFrom, q.dateTo)) return false;
    return matchesSearch(q.search, [i.orderId, i.customerName]);
  });
  const accessors = {
    paidAt: (i) => i.paidAt,
    total: (i) => Number(i.total || 0),
    attempts: (i) => i.attempts,
    bucket: (i) => BUCKET_RANK[i.bucket],
  };
  const byPaidAt = (x, y) => ((x.paidAt || '') < (y.paidAt || '') ? 1 : -1);
  const sorted = sortItems(filtered, accessors[q.sortBy], q.sortDir, byPaidAt);
  const { items, pagination } = paginate(sorted, q);
  return {
    items,
    pagination,
    facets: {
      couriers: distinct(issues.map((i) => i.courierName)),
      deliveryStatuses: distinct(issues.map((i) => i.deliveryStatus)),
    },
  };
}

module.exports = {
  effectivePayment,
  ordersQuerySchema,
  queryOrders,
  buildCustomerRows,
  customersQuerySchema,
  queryCustomers,
  productsQuerySchema,
  queryProducts,
  stockStatus,
  listedPrice,
  maxDiscountPercent,
  reviewsQuerySchema,
  queryReviews,
  couponStatus,
  couponsQuerySchema,
  queryCoupons,
  contactsQuerySchema,
  queryContacts,
  CONTACT_STATUSES,
  syncIssuesQuerySchema,
  querySyncIssues,
  isoDay,
};
