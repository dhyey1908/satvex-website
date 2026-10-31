// Telling apart the two ways creating a Shiprocket order can fail, and putting Shiprocket's reply into words an
// admin can act on.
//   - 400 / 422: Shiprocket looked at the order and refused its DATA (a bad address, pincode, phone...). Retrying
//     the same data cannot work: the order is parked as "Address needs fix" until someone edits it.
//   - anything else (login failed, Shiprocket down, timeout, 5xx): nothing is wrong with the order itself, so it is
//     retried automatically ("Shipping retry needed").

const FIELD_NAMES = {
  billing_customer_name: 'Customer name',
  billing_last_name: 'Customer name',
  billing_address: 'Address',
  billing_address_2: 'Address',
  billing_city: 'City',
  billing_pincode: 'Pincode',
  billing_state: 'State',
  billing_country: 'Country',
  billing_email: 'Email',
  billing_phone: 'Phone number',
  shipping_address: 'Address',
  shipping_city: 'City',
  shipping_pincode: 'Pincode',
  shipping_state: 'State',
  shipping_phone: 'Phone number',
  pickup_location: 'Pickup location (our Shiprocket setup, not the customer address)',
  order_items: 'Items',
  sub_total: 'Order total',
  weight: 'Package weight',
};

const REJECTION_STATUSES = new Set([400, 422]);

// `addressProblem` is set by our own pre-flight check when the order is missing something Shiprocket requires (same fix: edit the address).
// `shipmentStage` is 'create' when the refusal came from creating the Shiprocket order itself: a 400/422 from a later
// step (AWB, pickup, label...) is not about the address, so it is retried like any other failure instead.
const isShiprocketRejection = (err) =>
  Boolean(err?.addressProblem) || (err?.shipmentStage === 'create' && REJECTION_STATUSES.has(Number(err?.upstreamStatus)));

function flattenErrors(errors) {
  if (!errors || typeof errors !== 'object') return [];
  return Object.entries(errors).flatMap(([field, value]) => {
    const messages = (Array.isArray(value) ? value : [value]).map((m) => String(m)).filter(Boolean);
    return messages.map((message) => ({ field, label: FIELD_NAMES[field] || field.replace(/_/g, ' '), message }));
  });
}

/**
 * What to store on the order: Shiprocket's exact reply (status, message, per-field errors) plus a plain-words
 * line for the admin screen. `kind` says what the admin should do about it.
 */
function describeShipmentError(err) {
  const rejected = isShiprocketRejection(err);
  const body = err?.upstreamBody && typeof err.upstreamBody === 'object' ? err.upstreamBody : null;
  const problems = flattenErrors(body?.errors);
  const exact = String(body?.message || err?.message || 'Unknown error');
  let plain;
  if (rejected) {
    plain = problems.length
      ? `Shiprocket would not accept this order. ${problems.map((p) => `${p.label}: ${p.message}`).join(' ')}`
      : `Shiprocket would not accept this order: ${exact}`;
    plain += ' Fix the address and try again.';
  } else {
    plain = `We could not reach Shiprocket (${exact}). It will be retried automatically.`;
  }
  return {
    kind: rejected ? 'rejected' : 'retry',
    status: err?.upstreamStatus ?? null,
    message: exact,
    errors: body?.errors ?? null,
    plain,
    at: new Date().toISOString(),
  };
}

module.exports = { isShiprocketRejection, describeShipmentError };
