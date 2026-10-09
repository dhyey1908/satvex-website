const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Everything GoKwik-specific lives in this one file, mirroring how
// paymentService.js isolates Cashfree. SANDBOX ONLY — see
// gokwik_integration_notes.md (pasted into this project 2026-10-09 from
// GoKwik's web-integration page, since the page itself 404s for us now).
// Every field/endpoint below is taken from those notes; anything the notes
// didn't cover is marked TODO(confirm) rather than guessed.

const BASE_URL = env.gokwik.env === 'production' ? 'https://api.gokwik.co' : 'https://sandbox.gokwik.co';

function headers() {
  return {
    'Content-Type': 'application/json',
    appid: env.gokwik.appId,
    appsecret: env.gokwik.appSecret,
  };
}

async function gokwikFetch(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers: headers() });
  const data = await res.json().catch(() => null);
  // TODO(confirm): notes only document 200/201/400/404/500 for order/create
  // and 200/202/400/404 for payment/verify — treating every other non-2xx
  // as a generic failure until GoKwik's team confirms the full status list.
  if (!res.ok) {
    const message = data?.message || data?.error || 'GoKwik request failed.';
    throw new AppError(message, 502, 'GOKWIK_ERROR');
  }
  return data;
}

// moid is OUR orderId — same "merchant mints the id" pattern Cashfree uses,
// so no separate id is needed to reconcile a webhook back to our Order
// record. `source` and `customer_ip`/`customer_user_agent` are documented
// fields with no specified format — TODO(confirm) exact expected values;
// passing best-effort data for now (source: 'web', real IP/UA from the
// request) rather than omitting them.
async function createOrder({
  orderId,
  cartId,
  items,
  totals,
  paymentMethod, // 'COD' | 'Online' — mapped to GoKwik's 'cod' | 'upi' below
  customer,
  billingAddress,
  shippingAddress,
  customerIp,
  customerUserAgent,
}) {
  const lineItems = items.map((item) => ({
    product_id: item.productId,
    line_item_id: item.cartItemId || item.productId,
    variant_id: item.sellingOptionId,
    name: item.productName,
    sku: item.productId,
    price: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.subtotal,
    total: item.subtotal,
    // TODO(confirm): per-line tax isn't broken out anywhere in our pricing
    // today (GST is computed once on the order's taxable amount) — sending
    // 0 here and the real amount only on the order-level total_tax below
    // until GoKwik confirms whether per-line tax is actually required.
    tax: 0,
    product_url: item.productSlug ? `${env.publicSiteUrl}/product/${item.productSlug}` : undefined,
    product_thumbnail_url: item.productImage || undefined,
  }));

  const body = {
    order: {
      id: orderId,
      cart_id: cartId || orderId,
      status: 'pending',
      subtotal: totals.subtotal,
      total_line_items: items.length,
      total_line_items_quantity: items.reduce((sum, i) => sum + i.quantity, 0),
      total_tax: totals.gstAmount,
      total_shipping: totals.shipping + (totals.codCharge || 0),
      total_discount: totals.discountAmount || 0,
      total: totals.total,
      promo_code: totals.couponCode || undefined,
      source: 'web',
      customer_ip: customerIp,
      customer_user_agent: customerUserAgent,
      payment_details: {
        method_id: paymentMethod === 'Online' ? 'upi' : 'cod',
      },
      line_items: lineItems,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
    },
  };

  const data = await gokwikFetch('/v1/order/create', { method: 'POST', body: JSON.stringify(body) });

  // Success response per the notes: request_id, gokwik_oid, order_status,
  // total, moid, mid, phone, order_type. Passing the whole `data` block
  // through so the caller has everything (including `mid`) without this
  // file guessing which subset the frontend's initPayment actually needs.
  const result = data?.data || data;
  assertValidOrderTotal(result);
  return result;
}

// Fails loudly and early rather than letting checkout proceed to a payment
// screen that silently shows "Amount to Pay: null" — a broken-looking
// checkout for a real customer is worse than a clear server error here.
// Exported separately so it's unit-testable without mocking fetch/HTTP.
//
// CONFIRMED 2026-10: GoKwik's real sandbox response returns `total` as a
// formatted decimal STRING (e.g. "1.0000"), not a JSON number — accepting
// numeric strings here (not just `typeof === 'number'`) so a legitimate
// response isn't rejected. This does NOT fix the widget showing "Amount to
// Pay: null" — that reads from GoKwik's own stored copy of this same order,
// not from anything our code passes it, so if it's still null after this,
// it's confirmed GoKwik-side (their widget failing to parse their own
// stored string total) and needs to go to their support team.
function assertValidOrderTotal(result) {
  const numeric = typeof result?.total === 'string' ? Number(result.total) : result?.total;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    logger.error('gokwik order/create returned no usable numeric total', { total: result?.total, typeofTotal: typeof result?.total });
    throw new AppError('GoKwik did not return a valid order amount.', 502, 'GOKWIK_INVALID_TOTAL');
  }
}

// Always called server-to-server before trusting a webhook or a frontend
// 'success' callback — never mark an order paid off either of those alone.
async function verifyPayment({ gokwikOid, total }) {
  const data = await gokwikFetch('/v1/payment/verify', {
    method: 'POST',
    body: JSON.stringify({ gokwik_oid: gokwikOid, total }),
  });
  return data?.data || data;
}

// Pushes a fulfilment status change to GoKwik. `status` must be one of the
// values the notes list: pending, processing, shipped, in-transit, delayed,
// rto, ofd, cancelled, returned, delivered, completed. Caller maps our own
// order.status to one of these — see gokwikController's mapping.
async function updateOrder({ orderId, gokwikOid, status, awbNumber, awbStatus, shippingProvider, note }) {
  const body = {
    moid: orderId,
    gokwik_oid: gokwikOid,
    order_status: status,
    type: 'merchant',
    ...(awbNumber ? { awb_number: awbNumber } : {}),
    ...(awbStatus ? { awb_status: awbStatus } : {}),
    ...(shippingProvider ? { shipping_provider: shippingProvider } : {}),
    ...(note ? { order_note: note } : {}),
  };
  return gokwikFetch('/v1/order/update', { method: 'POST', body: JSON.stringify(body) });
}

// The webhook's only documented auth is the appid/appsecret headers
// matching our own credentials — the notes explicitly say "No signature
// scheme is described." TODO(confirm) with GoKwik whether a real signature
// exists before this goes anywhere near production; until then, every
// webhook call additionally re-confirms via verifyPayment before any order
// is ever marked paid, so a forged header pair alone can't fake a payment.
function verifyWebhookHeaders({ appid, appsecret }) {
  if (!appid || !appsecret) return false;
  // Plain equality is fine here — these are not cryptographic signatures,
  // just credential strings compared against our own env config.
  return appid === env.gokwik.appId && appsecret === env.gokwik.appSecret;
}

module.exports = {
  createOrder,
  verifyPayment,
  updateOrder,
  verifyWebhookHeaders,
  assertValidOrderTotal,
};
