/*
 * One-off script — not part of the deployed app. Flips on real Shiprocket
 * rate/shipment calls in Admin Settings (pickupPincode/pickupLocation +
 * enabled), equivalent to doing it by hand in the Admin Settings UI.
 *
 *   TABLE_SETTINGS=satvex_settings_prod AWS_PROFILE=satvex node src/scripts/enable-shiprocket.js
 */
require('dotenv').config();
const settingsService = require('../services/settingsService');

async function main() {
  const current = await settingsService.getSettings();
  const updated = await settingsService.updateSettings({
    shiprocket: {
      ...current.shiprocket,
      enabled: true,
      pickupPincode: '360001',
      pickupLocation: 'maldhari fatak',
    },
  });
  console.log('Shiprocket settings updated:', updated.shiprocket);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
