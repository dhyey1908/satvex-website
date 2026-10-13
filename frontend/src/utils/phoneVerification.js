// Mirrors backend/src/services/userService.js's isPhoneVerified exactly —
// same 30-day window, same "must be EXACTLY the number last OTP-verified"
// rule. /auth/me already returns verifiedPhone + phoneVerifiedAt, so the
// UI can tell an already-verified number apart from a new one up front
// instead of making the customer click "Verify" just to be told "already
// verified" by the server.
const PHONE_VERIFICATION_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export function isPhoneVerifiedFor(user, phone) {
  if (!user?.verifiedPhone || !user?.phoneVerifiedAt || !phone) return false;
  if (user.verifiedPhone !== phone) return false;
  return Date.now() - new Date(user.phoneVerifiedAt).getTime() < PHONE_VERIFICATION_VALIDITY_MS;
}
