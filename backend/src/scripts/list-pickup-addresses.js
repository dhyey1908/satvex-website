/*
 * One-off script — not part of the deployed app. Read-only: lists the
 * pickup addresses actually registered in the Shiprocket panel, so the
 * exact nickname can be copied into Admin Settings instead of guessed.
 *
 *   node src/scripts/list-pickup-addresses.js
 */
require('dotenv').config();
const shiprocketService = require('../services/shiprocketService');

async function main() {
  const addresses = await shiprocketService.listPickupAddresses();
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
