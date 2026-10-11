const { sendOtpSchema, verifyOtpSchema } = require('../validators/phoneValidators');
const otpService = require('../services/otpService');
const userService = require('../services/userService');
const { ok } = require('../utils/response');

// Requires auth (see phoneRoutes.js) — phone verification is always tied to
// the logged-in account, never anonymous, since its only real use (gating
// checkout) already requires a session.
async function sendOtp(req, res) {
  const { phone } = sendOtpSchema.parse(req.body);
  const user = await userService.findById(req.user.id);

  // Already verified and still within the validity window — do not send
  // another OTP / trigger SNS, per the brief's "avoid unnecessary SMS
  // costs" requirement.
  if (userService.isPhoneVerified(user, phone)) {
    return ok(res, { alreadyVerified: true });
  }

  await otpService.sendOtp(phone);
  ok(res, { sent: true });
}

async function verifyOtp(req, res) {
  const { phone, code } = verifyOtpSchema.parse(req.body);
  await otpService.verifyOtp(phone, code); // throws AppError on any failure
  await userService.markPhoneVerified(req.user.id, phone);
  ok(res, { verified: true });
}

module.exports = { sendOtp, verifyOtp };
