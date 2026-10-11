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

module.exports = { lookupState };
