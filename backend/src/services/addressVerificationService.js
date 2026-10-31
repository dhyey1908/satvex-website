const AppError = require('../utils/AppError');
const { cityMatchesPlaces } = require('../utils/addressRules');
const deliveryEligibilityService = require('./deliveryEligibilityService');
const pincodeService = require('./pincodeService');
const deliveryCheckService = require('./deliveryCheckService');

// Everything about a delivery address that needs a lookup (the text rules in utils/addressRules.js are plain checks
// and run in the request validators). Shared by checkout and the admin address editor, so an address edited by an
// admin has to pass exactly what the customer's had to.
//
// Checked in this order, each one a hard stop:
//   1. the pincode exists                       PINCODE_NOT_FOUND
//   2. the state is the pincode's real state     ADDRESS_STATE_MISMATCH
//   3. the city is one of the pincode's places   CITY_MISMATCH (with a "Did you mean" suggestion)
//   4. a courier delivers there (Shiprocket)     NO_COURIER
//   5. COD is possible there, when COD is asked  COD_NOT_AVAILABLE
// If the pincode lookup is down (1-3) or Shiprocket cannot be asked (4-5) the address is let through - the order is
// never lost to somebody else's outage - and `deliveryNotVerified` comes back true so an admin can look at it.

// 'Jammu & Kashmir' / 'Jammu and Kashmir' / 'jammu  kashmir' should compare equal.
const normalizeState = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function verifyAddress(address, { paymentMethod = 'COD' } = {}) {
  // Delivery restrictions (an admin setting, off by default) already know the state of a pincode.
  let { state: pincodeState } = await deliveryEligibilityService.isDeliverable(address.pincode);

  const known = await pincodeService.lookupPincode(address.pincode);
  if (known.status === 'not_found') {
    throw new AppError(`We couldn't find pincode ${address.pincode}. Please check it and try again.`, 400, 'PINCODE_NOT_FOUND');
  }
  if (!pincodeState && known.status === 'found') pincodeState = known.state;

  if (pincodeState && normalizeState(pincodeState) !== normalizeState(address.state)) {
    throw new AppError(
      `Pincode ${address.pincode} is in ${pincodeState}, but the address says ${address.state}. Please correct the state.`,
      400,
      'ADDRESS_STATE_MISMATCH',
      { expectedState: pincodeState }
    );
  }

  if (known.status === 'found' && known.places?.length && !cityMatchesPlaces(address.city, known.places)) {
    const suggestion = known.district || known.places[0];
    throw new AppError(`City doesn't match this pincode. Did you mean ${suggestion}?`, 400, 'CITY_MISMATCH', { suggestion });
  }

  const delivery = await deliveryCheckService.checkPincode(address.pincode);
  if (delivery.status === 'no_courier') {
    throw new AppError("Sorry, we don't deliver to this pincode yet.", 400, 'NO_COURIER');
  }
  if (delivery.status === 'ok' && paymentMethod === 'COD' && !delivery.cod) {
    throw new AppError("COD isn't available for this pincode.", 400, 'COD_NOT_AVAILABLE');
  }

  return {
    deliveryNotVerified: delivery.status === 'unverified',
    deliveryEta: delivery.status === 'ok' ? delivery.deliveryBy || null : null,
  };
}

module.exports = { verifyAddress, normalizeState };
