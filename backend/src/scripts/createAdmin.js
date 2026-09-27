/*
 * One-time script to create the first admin account.
 * Usage: npm run create-admin
 * Reads ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD from .env (never commit real values).
 */
const env = require('../config/env');
const userService = require('../services/userService');
const { hashPassword } = require('../utils/password');

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.error('Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in .env before running this script.');
    process.exit(1);
  }

  const existing = await userService.findByEmail(email);
  if (existing) {
    console.log(`User ${email} already exists (role: ${existing.role}). No changes made.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  const admin = await userService.createUser({
    name: 'Satvex Admin',
    email,
    passwordHash,
    role: 'admin',
  });

  console.log(`Admin account created: ${admin.email} (userId: ${admin.userId})`);
  console.log('Change this password after first login.');
}

main().catch((err) => {
  console.error('Failed to create admin account:', err);
  process.exit(1);
});
