/*
 * One-off script — not part of the deployed app. Seeds test announcements
 * (mirroring what AdminAnnouncements.jsx would save) directly via
 * settingsService, to verify the full save -> public-filter chain live.
 * Cleans itself up (removes the test announcements) when run with --clean.
 *
 *   TABLE_SETTINGS=satvex_settings_dev TABLE_COUPONS=satvex_coupons_dev AWS_PROFILE=satvex node src/scripts/test-announcements.js
 *   TABLE_SETTINGS=satvex_settings_dev TABLE_COUPONS=satvex_coupons_dev AWS_PROFILE=satvex node src/scripts/test-announcements.js --clean
 */
require('dotenv').config();
const settingsService = require('../services/settingsService');

const TEST_IDS = ['test-active-no-coupon', 'test-inactive', 'test-future', 'test-expired-window', 'test-bad-coupon'];

async function main() {
  const clean = process.argv.includes('--clean');
  const current = await settingsService.getSettings();
  const existingReal = (current.announcements || []).filter((a) => !TEST_IDS.includes(a.id));

  if (clean) {
    await settingsService.updateSettings({ announcements: existingReal });
    console.log('Cleaned up test announcements. Remaining:', existingReal.length);
    return;
  }

  const today = new Date();
  const future = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const past = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const testAnnouncements = [
    { id: 'test-active-no-coupon', message: 'Free Shipping on Eligible Orders', isActive: true },
    { id: 'test-inactive', message: 'This should NOT show (inactive)', isActive: false },
    { id: 'test-future', message: 'This should NOT show (starts in the future)', isActive: true, startDate: future },
    { id: 'test-expired-window', message: 'This should NOT show (schedule already ended)', isActive: true, endDate: past },
    { id: 'test-bad-coupon', message: 'This should NOT show (coupon does not exist)', isActive: true, couponCode: 'DOES-NOT-EXIST-XYZ' },
  ];

  const result = await settingsService.updateSettings({ announcements: [...existingReal, ...testAnnouncements] });
  console.log('Saved. Total announcements now:', result.announcements.length);

  const active = await settingsService.getActiveAnnouncements(result.announcements);
  console.log('\nWhat the PUBLIC endpoint would show (should be exactly 1 — "Free Shipping..."):');
  console.log(active.map((a) => ({ id: a.id, message: a.message })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
