/*
 * One-off script — not part of the deployed app. Flips OFF real Shiprocket
 * rate/shipment calls in Admin Settings (keeps pickupPincode/pickupLocation
 * as-is, just disables the feature), equivalent to unchecking the toggle in
 * the Admin Settings UI.
 *
 *   TABLE_SETTINGS=satvex_settings_prod AWS_PROFILE=satvex node src/scripts/disable-shiprocket.js
 */
require('dotenv').config();
const settingsService = require('../services/settingsService');

async function main() {
  const current = await settingsService.getSettings();
  const updated = await settingsService.updateSettings({
    shiprocket: { ...current.shiprocket, enabled: false },
  });
  console.log('Shiprocket settings updated:', updated.shiprocket);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
