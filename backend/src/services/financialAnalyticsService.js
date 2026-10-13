const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const settingsService = require('./settingsService');

// Backs the admin "Pricing & Financial Analytics" screen. Every figure the
// screen shows is computed HERE, from the real order records, so the
// browser only formats and displays (see
// frontend/src/checks/noClientSidePriceMath.test.js for that project rule).
//
// Core rule against double counting: every order is classified into exactly
// ONE bucket (classifyOrder), and every metric is a sum over buckets — an
// order can never be counted as both "collected" and "pending", or both
// "sale" and "refund".

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// The orders scan is paginated; this bounds the ROWS RETURNED to the admin
// table, not what is summarized (summaries always cover every matching row).
const MAX_ROWS_RETURNED = 5000;

const BUCKETS = ['expired', 'awaiting_payment', 'refunded', 'cancelled', 'rto', 'collected', 'cod_pending'];
// Buckets that count as a real, placed sale (money was or will be due).
const SALE_BUCKETS = new Set(['refunded', 'rto', 'collected', 'cod_pending']);

const round2 = (n) => Number((Number(n) || 0).toFixed(2));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Order timestamps are UTC ISO strings; the business operates in India, so
// "which day" is decided in IST (UTC+5:30) — otherwise an order placed at
// 1am IST would land on the previous day.
function istDate(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function effectivePaymentStatus(order) {
  if (order.paymentStatus) return order.paymentStatus;
  // Same legacy rule as orderService.withLegacyPaymentStatus.
  return order.paymentMethod === 'Online' ? 'awaiting_payment' : 'not_required';
}

function isRto(order) {
  return /rto/i.test(String(order.lastTrackingStatus || '')) || /rto/i.test(String(order.shipmentStatus || ''));
}

// Precedence matters — the first matching rule wins, which is what makes the
// buckets mutually exclusive.
function classifyOrder(order) {
  const paymentStatus = effectivePaymentStatus(order);
  const isOnline = order.paymentMethod === 'Online';

  if (paymentStatus === 'expired') return 'expired';
  if (isOnline && paymentStatus === 'awaiting_payment') return 'awaiting_payment';
  // refundStatus is only ever 'pending' or 'failed' today (a confirmed
  // 'success' is never written) — both a requested and a confirmed refund
  // count as "refunded"; a failed one means the money is still with us.
  if (order.refundStatus === 'pending' || order.refundStatus === 'success') return 'refunded';
  if (order.status === 'Cancelled') return 'cancelled';
  if (isRto(order)) return 'rto';
  if (isOnline && paymentStatus === 'paid') return 'collected';
  if (!isOnline && order.status === 'Delivered') return 'collected';
  if (!isOnline) return 'cod_pending';
  return 'awaiting_payment';
}

async function scanAll(tableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await docClient.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// "productId:sellingOptionId" -> current costPrice, used ONLY to estimate
// COGS for orders placed before cost prices were snapshotted on items.
function buildCostLookup(products) {
  const map = new Map();
  for (const product of products || []) {
    for (const option of product.sellingOptions || []) {
      if (option.costPrice != null && Number.isFinite(Number(option.costPrice))) {
        map.set(`${product.productId}:${option.id}`, Number(option.costPrice));
      }
    }
  }
  return map;
}

function cogsForOrder(order, costLookup) {
  const items = order.items || [];
  if (items.length === 0) return { amount: null, basis: 'unavailable', complete: false };
  let amount = 0;
  let known = 0;
  let snapshotted = 0;
  for (const item of items) {
    let unitCost = null;
    let fromSnapshot = false;
    if (item.costPrice != null && Number.isFinite(Number(item.costPrice))) {
      unitCost = Number(item.costPrice);
      fromSnapshot = true;
    } else if (costLookup.has(`${item.productId}:${item.sellingOptionId}`)) {
      unitCost = costLookup.get(`${item.productId}:${item.sellingOptionId}`);
    }
    if (unitCost == null) continue;
    known += 1;
    if (fromSnapshot) snapshotted += 1;
    amount += unitCost * num(item.quantity || 1);
  }
  if (known === 0) return { amount: null, basis: 'unavailable', complete: false };
  const complete = known === items.length;
  return {
    amount: round2(amount),
    // 'actual' only when every item carried the cost snapshotted at order time.
    basis: snapshotted === items.length ? 'actual' : 'estimated',
    complete,
  };
}

/**
 * One fully-computed row per order — the single object both the table and
 * every summary are built from.
 * ctx: { costLookup, feePercent (number|null), avgQuotedFreight (number) }
 */
function buildRow(order, ctx) {
  const bucket = classifyOrder(order);
  const isOnline = order.paymentMethod === 'Online';
  const total = round2(order.total);
  const gstAmount = round2(order.gstAmount);
  const isSale = SALE_BUCKETS.has(bucket);

  const collectedAmount = bucket === 'collected' ? total : 0;
  const pendingAmount = bucket === 'cod_pending' || bucket === 'awaiting_payment' ? total : 0;
  const refundAmount = bucket === 'refunded' ? total : 0;

  const missing = [];

  // --- COGS (only goods that were retained: collected / cod_pending) ---
  const cogs = cogsForOrder(order, ctx.costLookup);
  const needsCogs = bucket === 'collected' || bucket === 'cod_pending';
  if (needsCogs && !cogs.complete) missing.push('cogs');

  // --- Payment gateway fee (Online sales only; a fee is charged even if later refunded) ---
  let gatewayFee = { amount: 0, basis: 'actual', note: 'No gateway fee on COD' };
  const feeApplies = isOnline && (bucket === 'collected' || bucket === 'refunded');
  if (feeApplies) {
    if (ctx.feePercent == null) {
      gatewayFee = { amount: null, basis: 'unavailable', note: 'Set the PayU fee % in Finance assumptions' };
      missing.push('gatewayFee');
    } else {
      gatewayFee = { amount: round2((total * ctx.feePercent) / 100), basis: 'estimated', note: `${ctx.feePercent}% of order total` };
    }
  }

  // --- Courier cost (forward freight the store pays; never billed data) ---
  let courier = { amount: 0, basis: 'actual', note: 'Not shipped' };
  const shipsGoods = bucket === 'collected' || bucket === 'cod_pending' || bucket === 'rto' || bucket === 'refunded';
  if (shipsGoods) {
    if (order.quotedFreightCharge != null) {
      courier = { amount: round2(order.quotedFreightCharge), basis: 'estimated', note: 'Quoted courier rate at checkout' };
    } else {
      courier = { amount: round2(ctx.avgQuotedFreight), basis: 'estimated', note: 'Average quoted rate (no quote stored for this order)' };
    }
  }

  // --- RTO charge (return-to-origin; only for RTO orders) ---
  let rtoCharge = { amount: 0, basis: 'actual' };
  if (bucket === 'rto') {
    rtoCharge =
      order.quotedRtoCharge != null
        ? { amount: round2(order.quotedRtoCharge), basis: 'estimated' }
        : { amount: courier.amount, basis: 'estimated' };
  }

  // --- Profit for this order ---
  const revenueExGst = round2(total - gstAmount);
  let net = null;
  if (missing.length === 0) {
    if (bucket === 'collected' || bucket === 'cod_pending') {
      net = round2(revenueExGst - num(cogs.amount) - num(gatewayFee.amount) - courier.amount);
    } else if (bucket === 'refunded') {
      // Revenue handed back; the store still bore the fee and shipping.
      net = round2(-(num(gatewayFee.amount) + courier.amount));
    } else if (bucket === 'rto') {
      net = round2(-(courier.amount + rtoCharge.amount));
    } else {
      net = 0;
    }
  }

  const trackingStatus = order.lastTrackingStatus || null;
  return {
    orderId: order.orderId,
    shortId: String(order.orderId || '').slice(0, 8),
    createdAt: order.createdAt,
    date: istDate(order.createdAt),
    customerName: order.customer?.name || null,
    paymentMethod: order.paymentMethod,
    status: order.status,
    paymentStatus: effectivePaymentStatus(order),
    shipmentStatus: order.shipmentStatus || null,
    trackingStatus,
    bucket,
    isSale,
    subtotal: round2(order.subtotal),
    discountAmount: round2(order.discountAmount),
    couponCode: order.couponCode || null,
    gstAmount,
    shipping: round2(order.shipping),
    codCharge: round2(order.codCharge),
    prepaidDiscount: round2(order.prepaidDiscount),
    // Pre-added here so the screen never has to sum two money fields itself.
    discountTotal: round2(num(order.discountAmount) + num(order.prepaidDiscount)),
    total,
    collectedAmount,
    pendingAmount,
    refundAmount,
    shippingSource: order.shippingSource || null,
    quoted: order.quotedFreightCharge != null,
    revenueExGst,
    cogs: { ...cogs, applied: needsCogs },
    gatewayFee,
    courier,
    rtoCharge,
    profit: { eligible: missing.length === 0 && isSale, missing, net },
  };
}

function matchesFilters(row, { from, to, paymentMethod, status, bucket }) {
  if (from && (!row.date || row.date < from)) return false;
  if (to && (!row.date || row.date > to)) return false;
  if (paymentMethod && row.paymentMethod !== paymentMethod) return false;
  if (status && row.status !== status) return false;
  if (bucket && row.bucket !== bucket) return false;
  return true;
}

function sum(rows, pick) {
  return round2(rows.reduce((acc, r) => acc + num(pick(r)), 0));
}

function worstBasis(bases) {
  if (bases.includes('unavailable')) return 'unavailable';
  if (bases.includes('estimated')) return 'estimated';
  return 'actual';
}

/** Every summary section, computed from the SAME filtered row set. */
function summarize(rows, { feePercent, fallbackFlatCharge }) {
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, rows.filter((r) => r.bucket === b)]));
  const count = (b) => byBucket[b].length;
  const amount = (b) => sum(byBucket[b], (r) => r.total);

  const saleRows = rows.filter((r) => r.isSale);
  const grossSales = sum(saleRows, (r) => r.total);
  const collectedRows = byBucket.collected;
  const netRevenue = sum(collectedRows, (r) => r.total);

  const cod = rows.filter((r) => r.paymentMethod === 'COD');
  const online = rows.filter((r) => r.paymentMethod === 'Online');
  const sectionFor = (list) => {
    const sales = list.filter((r) => r.isSale);
    return {
      orders: list.length,
      saleOrders: sales.length,
      grossSales: sum(sales, (r) => r.total),
      collected: sum(list, (r) => r.collectedAmount),
      pending: sum(list, (r) => r.pendingAmount),
      refunds: sum(list, (r) => r.refundAmount),
      refundOrders: list.filter((r) => r.bucket === 'refunded').length,
    };
  };

  // --- Payment fees (Online) ---
  const feeRows = online.filter((r) => r.bucket === 'collected' || r.bucket === 'refunded');
  const feesUnavailable = feeRows.some((r) => r.gatewayFee.basis === 'unavailable');
  const gatewayFees = {
    amount: feesUnavailable ? null : sum(feeRows, (r) => r.gatewayFee.amount),
    basis: feesUnavailable ? 'unavailable' : 'estimated',
    feePercent,
    orders: feeRows.length,
    note: feePercent == null ? 'Set the PayU fee % in Finance assumptions to estimate fees.' : `Estimated at ${feePercent}% of order total (not PayU settlement data).`,
  };

  // --- Shipping ---
  const shippedRows = rows.filter((r) => ['collected', 'cod_pending', 'rto', 'refunded'].includes(r.bucket));
  const freeShipRows = shippedRows.filter((r) => r.shipping === 0);
  const quotedRows = shippedRows.filter((r) => r.quoted);
  const rtoRows = byBucket.rto;
  const shipping = {
    customerPaid: sum(saleRows, (r) => r.shipping),
    freeShippingOrders: freeShipRows.length,
    freeShippingCost: { amount: sum(freeShipRows, (r) => r.courier.amount), basis: 'estimated' },
    courierCost: {
      amount: sum(shippedRows, (r) => r.courier.amount),
      basis: 'estimated',
      quotedCoveragePct: shippedRows.length ? round2((quotedRows.length / shippedRows.length) * 100) : null,
      note: 'Courier rates quoted at checkout — not Shiprocket billed amounts.',
    },
    codFeesCollected: sum(saleRows, (r) => r.codCharge),
    courierCodFees: { amount: null, basis: 'unavailable', note: 'Courier COD fees are not recorded.' },
    rto: {
      orders: rtoRows.length,
      charges: { amount: sum(rtoRows, (r) => r.rtoCharge.amount), basis: 'estimated' },
    },
    fallbackFlatCharge,
  };

  // --- Tax & discounts ---
  const taxDiscounts = {
    gstCollected: sum(collectedRows, (r) => r.gstAmount),
    gstOnPendingCod: sum(byBucket.cod_pending, (r) => r.gstAmount),
    couponDiscounts: {
      amount: sum(saleRows, (r) => r.discountAmount),
      orders: saleRows.filter((r) => r.discountAmount > 0).length,
    },
    prepaidDiscounts: {
      amount: sum(saleRows, (r) => r.prepaidDiscount),
      orders: saleRows.filter((r) => r.prepaidDiscount > 0).length,
    },
    codCharges: sum(saleRows, (r) => r.codCharge),
  };

  // --- Profit: only over orders whose every needed cost is known, so the
  // figure is never inflated by treating a missing cost as zero. ---
  const eligible = saleRows.filter((r) => r.profit.eligible);
  const profitable = eligible.filter((r) => r.bucket === 'collected' || r.bucket === 'cod_pending');
  const refundedEligible = eligible.filter((r) => r.bucket === 'refunded');
  const rtoEligible = eligible.filter((r) => r.bucket === 'rto');
  const cogsBases = profitable.filter((r) => r.cogs.amount != null).map((r) => r.cogs.basis);
  const missingCogs = saleRows.filter((r) => r.profit.missing.includes('cogs')).length;
  const missingFee = saleRows.filter((r) => r.profit.missing.includes('gatewayFee')).length;
  const profit = {
    basis: 'estimated',
    eligibleOrders: eligible.length,
    saleOrders: saleRows.length,
    coveragePct: saleRows.length ? round2((eligible.length / saleRows.length) * 100) : null,
    revenueExGst: sum(profitable, (r) => r.revenueExGst),
    cogs: { amount: sum(profitable, (r) => r.cogs.amount), basis: worstBasis(cogsBases.length ? cogsBases : ['unavailable']) },
    gatewayFees: sum(eligible, (r) => r.gatewayFee.amount),
    courierCost: sum(eligible, (r) => r.courier.amount),
    rtoCharges: sum(rtoEligible, (r) => r.rtoCharge.amount),
    refundedRevenueLost: sum(refundedEligible, (r) => r.revenueExGst),
    netProfit: sum(eligible, (r) => r.profit.net),
    realizedProfit: sum(
      eligible.filter((r) => r.bucket === 'collected'),
      (r) => r.profit.net
    ),
    missing: { cogsOrders: missingCogs, gatewayFeeOrders: missingFee },
    note:
      'Always an estimate: courier cost uses quoted (not billed) rates and gateway fees use your assumed %. ' +
      'Only orders with every cost known are included — see coverage.',
  };

  return {
    summary: {
      orderCount: rows.length,
      grossSales,
      saleOrders: saleRows.length,
      paidOrders: count('collected'),
      netRevenue,
      pendingPayments: { orders: count('awaiting_payment'), amount: amount('awaiting_payment') },
      pendingCod: { orders: count('cod_pending'), amount: amount('cod_pending') },
      refunds: { orders: count('refunded'), amount: amount('refunded'), note: 'Refunds initiated (full refunds only).' },
      cancelled: { orders: count('cancelled'), amount: amount('cancelled') },
      expired: { orders: count('expired'), amount: amount('expired') },
      // Combined here so the screen shows one "lost orders" tile without
      // adding two money values in the browser.
      cancelledOrExpired: {
        orders: count('cancelled') + count('expired'),
        amount: round2(amount('cancelled') + amount('expired')),
      },
      rto: { orders: count('rto'), amount: amount('rto') },
      buckets: Object.fromEntries(BUCKETS.map((b) => [b, { orders: count(b), amount: amount(b) }])),
    },
    paymentBreakdown: { cod: sectionFor(cod), online: { ...sectionFor(online), gatewayFees } },
    shipping,
    taxDiscounts,
    profit,
  };
}

function buildDailySeries(rows, { from, to }) {
  const map = new Map();
  const ensure = (date) => {
    if (!map.has(date)) map.set(date, { date, orders: 0, grossSales: 0, netRevenue: 0, profit: 0 });
    return map.get(date);
  };
  for (const r of rows) {
    if (!r.date) continue;
    const d = ensure(r.date);
    d.orders += 1;
    if (r.isSale) d.grossSales = round2(d.grossSales + r.total);
    if (r.bucket === 'collected') d.netRevenue = round2(d.netRevenue + r.total);
    if (r.profit.eligible && r.profit.net != null) d.profit = round2(d.profit + r.profit.net);
  }
  // Fill empty days between the requested bounds so charts show gaps as zero.
  if (from && to) {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start && (end - start) / 86400000 <= 400) {
      for (let t = start; t <= end; t += 86400000) ensure(new Date(t).toISOString().slice(0, 10));
    }
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Average of the quotes we DO have, over every order (not the filtered set)
// so a row's estimate doesn't shift when the admin changes a filter.
function averageQuotedFreight(orders, fallback) {
  const quotes = orders.map((o) => o.quotedFreightCharge).filter((q) => q != null && Number.isFinite(Number(q)));
  if (quotes.length === 0) return num(fallback);
  return round2(quotes.reduce((a, b) => a + Number(b), 0) / quotes.length);
}

/** Pure core: raw orders + products + settings + filters -> full report. */
function computeReport({ orders, products, settings, filters = {} }) {
  const feePercent =
    settings?.finance?.paymentGatewayFeePercent != null ? Number(settings.finance.paymentGatewayFeePercent) : null;
  const fallbackFlatCharge = num(settings?.shipping?.fallbackFlatCharge ?? 59);
  const ctx = {
    costLookup: buildCostLookup(products),
    feePercent: Number.isFinite(feePercent) ? feePercent : null,
    avgQuotedFreight: averageQuotedFreight(orders, fallbackFlatCharge),
  };

  const allRows = orders.map((o) => buildRow(o, ctx));
  const rows = allRows.filter((r) => matchesFilters(r, filters)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const report = summarize(rows, { feePercent: ctx.feePercent, fallbackFlatCharge });

  return {
    ...report,
    series: buildDailySeries(rows, filters),
    orders: rows.slice(0, MAX_ROWS_RETURNED),
    meta: {
      filters,
      timezone: 'Asia/Kolkata',
      dateBasis: 'Order placed date (IST)',
      totalMatching: rows.length,
      truncated: rows.length > MAX_ROWS_RETURNED,
      assumptions: {
        paymentGatewayFeePercent: ctx.feePercent,
        averageQuotedFreight: ctx.avgQuotedFreight,
      },
    },
  };
}

async function getFinancialAnalytics(filters = {}) {
  const [orders, products, settings] = await Promise.all([
    scanAll(env.tables.orders),
    scanAll(env.tables.products),
    settingsService.getSettings(),
  ]);
  return computeReport({ orders, products, settings, filters });
}

module.exports = {
  getFinancialAnalytics,
  // exported for tests
  computeReport,
  classifyOrder,
  buildRow,
  summarize,
  buildDailySeries,
  istDate,
  scanAll,
  BUCKETS,
};
