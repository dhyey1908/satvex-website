/*
 * One-off script — not part of the deployed app. Runs the exact same
 * read-only check as the "Test Shiprocket Connection" admin button
 * (shiprocketService.testConnection): one login + one serviceability
 * lookup. Makes no account mutation.
 *
 *   AWS_PROFILE=satvex AWS_REGION=ap-south-1 node src/scripts/test-shiprocket-connection.js
 */
require('dotenv').config();
const shiprocketService = require('../services/shiprocketService');

async function main() {
  const result = await shiprocketService.testConnection({ pincode: '360001' });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
