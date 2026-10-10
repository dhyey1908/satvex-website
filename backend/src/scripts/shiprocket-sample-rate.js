/*
 * One-off debug script — not run automatically, not part of the deployed
 * app. Run manually once a real Shiprocket account is connected:
 *
 *   npm run shiprocket-sample-rate -- <deliveryPincode1> [deliveryPincode2] ...
 *
 * Prints the FULL raw serviceability response for each delivery pincode,
 * both prepaid (cod=0) and COD (cod=1), from the configured Rajkot pickup
 * pincode. Never prints the bearer token, email, or password — only the
 * response body, which is courier/rate data, not a secret.
 *
 * Why this exists: Shiprocket's real response shape for whether
 * freight_charge is GST-inclusive, whether a COD charge is broken out
 * separately, and whether any courier-rating field exists is NOT confirmed
 * anywhere in available docs (see shiprocket_integration_notes.md's Open
 * Questions). This prints the real thing instead of guessing — check the
 * output against settings.shipping.rateIncludesGst /
 * rateIncludesCodCharge and flip them in Admin Settings if needed, no code
 * change required.
 */
require('dotenv').config();
const env = require('../config/env');
const shiprocketService = require('../services/shiprocketService');

async function main() {
  const pincodes = process.argv.slice(2);
  if (pincodes.length === 0) {
    console.error('Usage: npm run shiprocket-sample-rate -- <deliveryPincode1> [deliveryPincode2] ...');
    process.exit(1);
  }
  if (!env.shiprocket.email || !env.shiprocket.password) {
    console.error('SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD are not set in the environment — cannot call the real API.');
    process.exit(1);
  }

  const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE;
  if (!pickupPincode) {
    console.error('Set SHIPROCKET_PICKUP_PINCODE in your environment (the Rajkot pickup pincode) before running this.');
    console.error('(This script reads it from the environment directly, not from Admin Settings, to stay a standalone tool.)');
    process.exit(1);
  }

  for (const deliveryPincode of pincodes) {
    for (const cod of [false, true]) {
      console.log(`\n=== pickup=${pickupPincode} delivery=${deliveryPincode} cod=${cod ? 1 : 0} ===`);
      try {
        const raw = await shiprocketService.getServiceabilityRaw({
          pickupPostcode: pickupPincode,
          deliveryPostcode: deliveryPincode,
          weightKg: 0.3,
          cod,
        });
        console.log(JSON.stringify(raw, null, 2));
      } catch (err) {
        console.error(`Request failed: ${err.message}`);
      }
    }
  }
}

main();
