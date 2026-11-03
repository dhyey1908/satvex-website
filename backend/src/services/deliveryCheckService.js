const shiprocketService = require('./shiprocketService');
const shippingRateService = require('./shippingRateService');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');

// "Will a courier take this parcel to this pincode, and can it be Cash on Delivery?" - asked of Shiprocket, from our
// pickup pincode, for a small default parcel. Used by:
//   - GET /api/delivery/check (checkout and the product page's pincode box), and
//   - checkout itself, which asks again from the cache before it accepts an order (the browser is never trusted).
//
// Result:
//   { status: 'ok',         prepaid: true, cod: boolean, deliveryBy: 'YYYY-MM-DD'|null, courierName }
//   { status: 'no_courier' }                  no courier delivers there (prepaid) - the order is refused
//   { status: 'unverified', reason }          Shiprocket could not be asked (down / slow / not set up). NEVER a reason to
//                                             refuse an order: it is let through and flagged "Delivery not verified".
// Answers are remembered per pincode for 24 hours; "unverified" is never remembered.

const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;
const DEFAULT_WEIGHT_KG = 0.1;
const cache = new Map();

const pad = (n) => String(n).padStart(2, '0');
// A date written without a timezone ("Nov 05, 2026") is read in local time, so it is formatted from its local parts.
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "N days from now" as a calendar date in India (IST, UTC+5:30), where the customer is.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDateIn = (days) => new Date(Date.now() + IST_OFFSET_MS + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The date a courier says it will deliver by. Shiprocket's `etd` is a date ("Nov 04, 2026"); when it is not, its
// `estimated_delivery_days` is used, and failing that the number in `etd` ("3-4 days" -> 3).
function deliveryDateFor(courier) {
  if (!courier) return null;
  const etd = String(courier.etd || '');
  if (/\d{4}/.test(etd)) {
    const asDate = new Date(etd);
    if (!Number.isNaN(asDate.getTime())) return localDate(asDate);
  }
  const days = Number(courier.estimated_delivery_days) || shippingRateService.parseEtdDays(etd);
  if (days != null && days > 0 && days < 60) return istDateIn(Math.ceil(days));
  return null;
}

// One serviceability call. [] = Shiprocket answered "nobody delivers there"; throws when it could not answer.
async function couriersFor(pickupPostcode, deliveryPostcode, cod) {
  let data;
  try {
    data = await shiprocketService.getServiceabilityRaw({ pickupPostcode, deliveryPostcode, weightKg: DEFAULT_WEIGHT_KG, cod, timeoutMs: TIMEOUT_MS });
  } catch (err) {
    // Shiprocket answers an unserviceable pincode with a 404 and a message.
    if (err.upstreamStatus === 404) return [];
    throw err;
  }
  const list = data?.data?.available_courier_companies;
  if (Array.isArray(list)) return list;
  if (Number(data?.status) === 404) return [];
  throw new Error('Unexpected serviceability reply from Shiprocket.');
}

async function liveCheck(pincode) {
  const settings = await settingsService.getSettings();
  const pickupPincode = settings.shiprocket?.pickupPincode;
  if (!settings.shiprocket?.enabled || !pickupPincode) return { status: 'unverified', reason: 'not_configured' };

  const [prepaidCouriers, codCouriers] = await Promise.all([couriersFor(pickupPincode, pincode, false), couriersFor(pickupPincode, pincode, true)]);
  if (prepaidCouriers.length === 0) return { status: 'no_courier' };

  const codOk = codCouriers.filter((c) => Number(c.cod) !== 0);
  // The date is the one for the courier the order will actually go with: the same rule the shipping charge and the
  // booking use (cheapest by default). Quoting the fastest air courier would promise a date the order may not get.
  const chosen = shippingRateService.selectCourier(prepaidCouriers, settings.shipping?.courierSelectionRule || 'lowest_rate');
  return {
    status: 'ok',
    prepaid: true,
    cod: codOk.length > 0,
    deliveryBy: deliveryDateFor(chosen),
    courierName: chosen?.courier_name || null,
  };
}

async function checkPincode(pincode, { useCache = true } = {}) {
  const hit = cache.get(pincode);
  if (useCache && hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  let result;
  try {
    result = await liveCheck(pincode);
  } catch (err) {
    logger.warn('delivery check: Shiprocket could not be asked (order is not blocked)', { pincode, message: err.message });
    return { status: 'unverified', reason: 'shiprocket_unavailable' };
  }
  if (result.status !== 'unverified') cache.set(pincode, { at: Date.now(), result });
  return result;
}

module.exports = { checkPincode, deliveryDateFor, clearDeliveryCheckCache: () => cache.clear() };
