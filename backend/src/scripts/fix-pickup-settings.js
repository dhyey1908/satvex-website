/*
 * One-off script — not part of the deployed app. Corrects
 * settings.shiprocket.pickupLocation/pickupPincode to match what's
 * actually registered in the Shiprocket panel (confirmed via the
 * read-only listPickupAddresses call). DB write only — no Shiprocket
 * API call.
 *
 *   TABLE_SETTINGS=satvex_settings_dev AWS_PROFILE=satvex node src/scripts/fix-pickup-settings.js
 */
require('dotenv').config();
const settingsService = require('../services/settingsService');

async function main() {
  const current = await settingsService.getSettings();
  const updated = await settingsService.updateSettings({
    shiprocket: {
      ...current.shiprocket,
      pickupLocation: 'work',
      pickupPincode: '360004',
    },
  });
  console.log('Shiprocket settings updated:', updated.shiprocket);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
