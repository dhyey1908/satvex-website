const shiprocketService = require('./shiprocketService');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');

// Real Shiprocket quote lookup for checkout/pricing, with a short in-memory
// cache and a flat-charge fallback. Used by pricingService.calculateTotals
// (Step 1) and will be reused by the shipment-booking step (Step 2) so the
// courier we quote is the one we actually book.

// Per-Lambda-container cache — "brief", per the spec. A cold start or a
// different container just recomputes; that's fine for a short TTL.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map(); // key -> { expiresAt, result }

// Shiprocket's own API has no documented timeout, so this is ours: if a
// quote takes longer than this, fall back rather than block checkout.
const RATE_TIMEOUT_MS = 4000;

function cacheKey({ pickupPincode, deliveryPincode, paymentMethod, weightKg }) {
  return `${pickupPincode}|${deliveryPincode}|${paymentMethod}|${weightKg}`;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Shiprocket rate lookup timed out.')), ms)),
  ]);
}

// TODO(confirm): etd's real format is unconfirmed (shiprocket_integration_
// notes.md documents the field but not a sample value). This tries an ISO
// date first, then the first number found (covers common "X days"/"X-Y
// days" shapes) — verify once scripts/shiprocket-sample-rate.js shows a
// real value, and adjust if the real shape is different.
function parseEtdDays(etd) {
  if (!etd) return null;
  const asDate = new Date(etd);
  if (!Number.isNaN(asDate.getTime()) && /\d{4}-\d{2}-\d{2}/.test(String(etd))) {
    return (asDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  }
  const match = String(etd).match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// 'best rated' is intentionally not an option — see shippingSettingsSchema's
// comment, no rating field exists in the confirmed real response shape.
function selectCourier(couriers, rule) {
  if (!couriers || couriers.length === 0) return null;
  if (rule === 'fastest') {
    const withDays = couriers
      .map((c) => ({ c, days: parseEtdDays(c.etd) }))
      .filter((p) => p.days != null);
    if (withDays.length > 0) {
      withDays.sort((a, b) => a.days - b.days || Number(a.c.freight_charge) - Number(b.c.freight_charge));
      return withDays[0].c;
    }
    // No courier's etd was parseable — fall back to lowest rate rather than
    // an arbitrary pick.
  }
  return [...couriers].sort((a, b) => Number(a.freight_charge) - Number(b.freight_charge))[0];
}

function round(amount, roundTo) {
  const step = roundTo === 5 ? 5 : 1;
  return Math.round(amount / step) * step;
}

/**
 * Returns { charge, source, courierName }.
 *   source: 'shiprocket' | 'fallback' | 'fallback-unserviceable' | 'fallback-error' | 'fallback-timeout'
 * Never throws — always resolves to a usable charge, since a broken rate
 * lookup must never block checkout.
 */
async function getShippingQuote({ deliveryPincode, paymentMethod, weightKg }) {
  const settings = await settingsService.getSettings();
  const shipCfg = settings.shipping || {};
  const srCfg = settings.shiprocket || {};
  const fallbackCharge = Number(shipCfg.fallbackFlatCharge ?? 59);

  if (!srCfg.enabled || !srCfg.pickupPincode) {
    return { charge: fallbackCharge, source: 'fallback', courierName: null };
  }
  if (!deliveryPincode) {
    return { charge: fallbackCharge, source: 'fallback', courierName: null };
  }

  const key = cacheKey({ pickupPincode: srCfg.pickupPincode, deliveryPincode, paymentMethod, weightKg });
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  let result;
  try {
    const couriers = await withTimeout(
      shiprocketService.getServiceability({
        pickupPostcode: srCfg.pickupPincode,
        deliveryPostcode: deliveryPincode,
        weightKg,
        cod: paymentMethod === 'COD',
      }),
      RATE_TIMEOUT_MS
    );

    const chosen = selectCourier(couriers, shipCfg.courierSelectionRule || 'lowest_rate');
    if (!chosen) {
      result = { charge: fallbackCharge, source: 'fallback-unserviceable', courierName: null };
    } else {
      let charge = Number(chosen.freight_charge);
      if (!shipCfg.rateIncludesGst) {
        const gstPercent = Number(settings.tax?.percent ?? 18);
        charge = charge * (1 + gstPercent / 100);
      }
      charge += Number(shipCfg.handlingMargin || 0);
      if (shipCfg.minCharge != null) charge = Math.max(charge, Number(shipCfg.minCharge));
      if (shipCfg.maxCharge != null) charge = Math.min(charge, Number(shipCfg.maxCharge));
      charge = round(charge, shipCfg.roundTo);
      // freightCharge/rtoCharge are the courier's own quoted rates (what the
      // store would pay), not the customer-facing `charge` — stored on the
      // order for admin cost analytics only. rto_charges isn't guaranteed
      // present in Shiprocket's response, so it's null when absent.
      const rawRto = Number(chosen.rto_charges);
      result = {
        charge,
        source: 'shiprocket',
        courierName: chosen.courier_name,
        freightCharge: Number(chosen.freight_charge),
        rtoCharge: Number.isFinite(rawRto) ? rawRto : null,
      };
    }
  } catch (err) {
    const source = err.message?.includes('timed out') ? 'fallback-timeout' : 'fallback-error';
    logger.error('shiprocket rate lookup failed, using fallback charge', { message: err.message, deliveryPincode });
    result = { charge: fallbackCharge, source, courierName: null };
  }

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}

module.exports = { getShippingQuote, selectCourier, parseEtdDays, round };
