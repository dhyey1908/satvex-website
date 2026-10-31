const AppError = require('../utils/AppError');

// Server-side resolution of a pincode's state, via the same free lookup API
// already used client-side (Checkout.jsx, PincodeCheck.jsx —
// api.postalpincode.in). This is the authoritative source for delivery
// eligibility: it is never derived from a client-submitted state/address
// field, only from the pincode itself, so a customer can't bypass a
// disabled state by typing a different state name into the address form.
async function lookupState(pincode) {
  if (!/^[0-9]{6}$/.test(pincode)) {
    throw new AppError('Enter a valid 6-digit pincode.', 400, 'INVALID_PINCODE');
  }

  let data;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    data = await res.json();
  } catch {
    throw new AppError('Could not verify that pincode right now. Please try again.', 502, 'PINCODE_LOOKUP_FAILED');
  }

  const office = data?.[0]?.PostOffice?.[0];
  if (data?.[0]?.Status !== 'Success' || !office?.State) return null;
  return office.State;
}

// What we know about a pincode, for checking a typed address. Unlike lookupState (which throws when the lookup
// API is down) this never throws:
//   { status: 'found', state, district, places }  the pincode exists (places: every district/block/division/post-office name)
//   { status: 'not_found' }               the lookup says there is NO such pincode (an explicit "No records found")
//   { status: 'unknown' }                 the lookup failed or answered oddly: never a reason to refuse an order
// Answers are remembered for a few hours so checkout does not call the free lookup API on every order.
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

async function lookupPincode(pincode) {
  if (!/^[0-9]{6}$/.test(pincode)) return { status: 'not_found' };
  const hit = cache.get(pincode);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  let result = { status: 'unknown' };
  try {
    // A slow lookup must never hold up (or fail) an order: after 4s it counts as "unknown".
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const entry = data?.[0];
    const office = entry?.PostOffice?.[0];
    if (entry?.Status === 'Success' && office?.State) {
      // Every place name this pincode goes by (district, block, division, post office): the typed city may be any of them.
      const places = [...new Set((entry.PostOffice || []).flatMap((o) => [o.District, o.Block, o.Division, o.Name]).map((n) => String(n || '').trim()).filter((n) => n && n.toUpperCase() !== 'NA'))];
      result = { status: 'found', state: office.State, district: office.District || '', places };
    } else if (/no records/i.test(String(entry?.Message || ''))) result = { status: 'not_found' };
  } catch {
    return { status: 'unknown' }; // not cached: try again next time
  }
  if (result.status !== 'unknown') cache.set(pincode, { at: Date.now(), result });
  return result;
}

module.exports = { lookupState, lookupPincode, clearPincodeCache: () => cache.clear() };
