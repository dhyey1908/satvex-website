const env = require('../config/env');
const AppError = require('../utils/AppError');

// Everything Shiprocket-specific lives in this one file, mirroring how
// gokwikService.js isolates GoKwik. Built against
// shiprocket_integration_notes.md, which is backed by Shiprocket's own
// official open-source MCP server (github.com/bfrs/shiprocket-mcp) — real,
// tested, production code, not a guessed schema. Anything that file itself
// flags as unconfirmed is marked TODO(confirm) here too.

const BASE_URL = 'https://apiv2.shiprocket.in';
const SERVICEABILITY_BASE_URL = 'https://serviceability.shiprocket.in';

// Module-level cache — persists across invocations in the same warm Lambda
// container (both ApiFunction and ShipmentSweepFunction each keep their own
// independent cache; that's fine, each just re-logs-in on cold start).
// Refreshed proactively before the documented 240h (10 day) validity window,
// and reactively on any 401.
let cachedToken = null;
let cachedTokenExpiresAt = 0; // epoch ms
const TOKEN_LIFETIME_MS = 230 * 60 * 60 * 1000; // 230h — under the 240h limit with margin

async function login() {
  if (!env.shiprocket.email || !env.shiprocket.password) {
    throw new AppError('Shiprocket is not configured (missing email/password).', 500, 'SHIPROCKET_NOT_CONFIGURED');
  }
  const res = await fetch(`${BASE_URL}/v1/external/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) {
    throw new AppError(data?.message || 'Shiprocket login failed.', 502, 'SHIPROCKET_AUTH_ERROR');
  }
  cachedToken = data.token;
  cachedTokenExpiresAt = Date.now() + TOKEN_LIFETIME_MS;
  return cachedToken;
}

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  return login();
}

async function shiprocketFetch(baseUrl, path, options = {}, { retryOn401 = true } = {}) {
  const token = await getToken();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (res.status === 401 && retryOn401) {
    // Token may have been revoked/expired server-side early — force a fresh
    // login once, then retry the same call exactly once more.
    cachedToken = null;
    return shiprocketFetch(baseUrl, path, options, { retryOn401: false });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || 'Shiprocket request failed.';
    throw new AppError(message, 502, 'SHIPROCKET_ERROR');
  }
  return data;
}

// Returns the FULL, unprocessed response — used only by
// scripts/shiprocket-sample-rate.js to inspect fields getServiceability
// below doesn't parse (GST inclusion, a possible COD-charge breakout, a
// possible rating field — none of these are confirmed anywhere in
// available docs, see shiprocket_integration_notes.md's Open Questions).
// Nothing in this response is a secret (no token/credentials in it).
async function getServiceabilityRaw({ pickupPostcode, deliveryPostcode, weightKg, cod }) {
  const params = new URLSearchParams({
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    weight: String(weightKg),
    cod: cod ? '1' : '0',
  });
  return shiprocketFetch(SERVICEABILITY_BASE_URL, `/courier/ratingserviceability?${params}`, { method: 'GET' });
}

async function getServiceability({ pickupPostcode, deliveryPostcode, weightKg, cod }) {
  const data = await getServiceabilityRaw({ pickupPostcode, deliveryPostcode, weightKg, cod });
  return data?.data?.available_courier_companies || [];
}

async function listPickupAddresses() {
  const data = await shiprocketFetch(BASE_URL, '/v1/external/settings/company/pickup', { method: 'GET' });
  return data?.data?.shipping_address || [];
}

// orderItems: [{ name, sku, units, sellingPrice }]
async function createOrder({
  orderId,
  orderDate,
  pickupLocation,
  billingFirstName,
  billingLastName,
  billingAddress,
  billingCity,
  billingPincode,
  billingState,
  billingCountry,
  billingEmail,
  billingPhone,
  orderItems,
  paymentMethod, // 'COD' | 'Prepaid'
  subTotal,
  length,
  breadth,
  height,
  weight,
}) {
  const body = {
    order_id: orderId,
    order_date: orderDate,
    pickup_location: pickupLocation,
    billing_customer_name: billingFirstName,
    billing_last_name: billingLastName || '',
    billing_address: billingAddress,
    billing_city: billingCity,
    billing_pincode: billingPincode,
    billing_state: billingState,
    billing_country: billingCountry,
    billing_email: billingEmail,
    billing_phone: billingPhone,
    shipping_is_billing: true,
    order_items: orderItems.map((i) => ({ name: i.name, sku: i.sku, units: i.units, selling_price: i.sellingPrice })),
    payment_method: paymentMethod,
    sub_total: subTotal,
    length,
    breadth,
    height,
    weight,
  };
  const data = await shiprocketFetch(BASE_URL, '/v1/external/orders/create/adhoc', { method: 'POST', body: JSON.stringify(body) });
  if (!data?.order_id) {
    throw new AppError(data?.message || 'Shiprocket did not return an order id.', 502, 'SHIPROCKET_ORDER_CREATE_FAILED');
  }
  // TODO(confirm): shipment_id's exact field name/location in this response —
  // the MCP server reference never reads it out of this call. Passing the
  // whole response through so the caller can inspect it directly until
  // confirmed; order_list is the documented fallback if it's absent here.
  return data;
}

async function assignAwb({ shiprocketOrderId, courierId }) {
  const body = { oid: shiprocketOrderId, ...(courierId ? { courier_id: courierId } : {}) };
  const data = await shiprocketFetch(BASE_URL, '/v1/external/courier/assign/awb', { method: 'POST', body: JSON.stringify(body) });
  // Confirmed nesting from real code: response.data.{courier_name,awb_code}
  const awb = data?.response?.data;
  if (!awb?.awb_code) {
    throw new AppError(data?.message || 'Shiprocket did not return an AWB code.', 502, 'SHIPROCKET_AWB_FAILED');
  }
  return { awbCode: awb.awb_code, courierName: awb.courier_name, shipmentId: awb.shipment_id };
}

async function schedulePickup({ shiprocketOrderId, pickupDate }) {
  return shiprocketFetch(BASE_URL, '/v1/external/courier/generate/pickup', {
    method: 'POST',
    body: JSON.stringify({ oid: shiprocketOrderId, pickup_date: [pickupDate] }),
  });
}

async function generateLabel({ shipmentId }) {
  const data = await shiprocketFetch(BASE_URL, '/v1/external/courier/generate/label', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: shipmentId }),
  });
  if (!data?.label_created || !data?.label_url) {
    throw new AppError('Shiprocket did not return a label.', 502, 'SHIPROCKET_LABEL_FAILED');
  }
  return data.label_url;
}

async function cancelOrder({ shiprocketOrderId, cancelOnChannel = false }) {
  return shiprocketFetch(BASE_URL, '/v1/external/orders/cancel', {
    method: 'POST',
    body: JSON.stringify({ ids: [shiprocketOrderId], cancel_on_channel: cancelOnChannel }),
  });
}

async function trackByAwb(awb) {
  const data = await shiprocketFetch(BASE_URL, `/v1/external/courier/track/awb/${encodeURIComponent(awb)}`, { method: 'GET' });
  return data?.tracking_data || null;
}

module.exports = {
  getServiceability,
  getServiceabilityRaw,
  listPickupAddresses,
  createOrder,
  assignAwb,
  schedulePickup,
  generateLabel,
  cancelOrder,
  trackByAwb,
};
