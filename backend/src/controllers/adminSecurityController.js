const { z } = require('zod');
const userService = require('../services/userService');
const adminSecurity = require('../services/adminSecurityService');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const { ADMIN_SESSION_MINUTES, MAX_FAILED_AUTH, LOCK_MINUTES } = require('../utils/session');

const codeSchema = z.object({ code: z.string().trim().min(6).max(10) });
const proofSchema = z
  .object({ code: z.string().trim().max(10).optional(), recoveryCode: z.string().trim().max(20).optional() })
  .refine((v) => v.code || v.recoveryCode, { message: 'Enter a code.', path: ['code'] });

async function currentAdmin(req) {
  const user = await userService.findById(req.user.id);
  if (!user) throw new AppError('User not found.', 404, 'NOT_FOUND');
  return user;
}

// What the Security settings page shows.
async function status(req, res) {
  const user = await currentAdmin(req);
  ok(res, {
    totpEnabled: Boolean(user.totpEnabled),
    totpEnabledAt: user.totpEnabledAt || null,
    recoveryCodesLeft: (user.totpRecoveryHashes || []).length,
    sessionMinutes: ADMIN_SESSION_MINUTES,
    lockAfterFailedAttempts: MAX_FAILED_AUTH,
    lockMinutes: LOCK_MINUTES,
  });
}

async function totpSetup(req, res) {
  const user = await currentAdmin(req);
  if (user.totpEnabled) throw new AppError('Two-step sign-in is already on. Turn it off first to set it up again.', 409, 'TOTP_ALREADY_ENABLED');
  ok(res, await adminSecurity.beginTotpSetup(user));
}

async function totpEnable(req, res) {
  const { code } = codeSchema.parse(req.body);
  const recoveryCodes = await adminSecurity.enableTotp(req.user.id, code);
  ok(res, { totpEnabled: true, recoveryCodes });
}

async function totpDisable(req, res) {
  const proof = proofSchema.parse(req.body);
  await adminSecurity.disableTotp(req.user.id, proof);
  ok(res, { totpEnabled: false });
}

module.exports = { status, totpSetup, totpEnable, totpDisable };
