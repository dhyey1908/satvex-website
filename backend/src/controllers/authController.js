const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  forgotPasswordPhoneSchema,
  resetPasswordPhoneSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require('../validators/authValidators');
const { sendOtpSchema, verifyOtpSchema } = require('../validators/phoneValidators');
const userService = require('../services/userService');
const otpService = require('../services/otpService');
const { sendPasswordResetEmail } = require('../services/emailService');
const { hashPassword, verifyPassword, generateRawToken, hashToken } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');
const env = require('../config/env');

const COOKIE_NAME = 'accessToken';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // matches default JWT_EXPIRES_IN

// The deployed frontend (CloudFront) and API (API Gateway) are always on
// different domains — a cross-site request from the browser's perspective.
// Cross-site fetch requests only carry cookies marked SameSite=None (which
// in turn requires Secure). Locally, frontend/backend differ only by port,
// which browsers treat as the same "site", so Lax + non-Secure works there.
const isCrossSiteDeployment = env.nodeEnv === 'production';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isCrossSiteDeployment,
    sameSite: isCrossSiteDeployment ? 'none' : 'lax',
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: COOKIE_MAX_AGE_MS });
}

function issueSession(res, user) {
  const token = signAccessToken({ sub: user.userId, role: user.role });
  setAuthCookie(res, token);
  return token;
}

async function register(req, res) {
  const { name, email, phone, password } = registerSchema.parse(req.body);

  if (email) {
    const existingByEmail = await userService.findByEmail(email);
    if (existingByEmail) {
      throw new AppError('An account with this email already exists.', 409, 'EMAIL_IN_USE');
    }
  }
  // Only a VERIFIED phone blocks a new registration — an unverified phone
  // typed by someone else isn't actually "in use" by them (they never
  // proved ownership of it), and registerSchema's phone here is never
  // itself OTP-verified at signup time (that only happens via phoneRoutes,
  // e.g. at checkout) — see userService.findByVerifiedPhone's comment.
  if (phone) {
    const existingByPhone = await userService.findByVerifiedPhone(phone);
    if (existingByPhone) {
      throw new AppError('An account with this mobile number already exists.', 409, 'PHONE_IN_USE');
    }
  }

  const passwordHash = await hashPassword(password);
  const user = await userService.createUser({ name, email, phone, passwordHash });

  const token = issueSession(res, user);
  created(res, { user: userService.toPublicUser(user), token });
}

async function login(req, res) {
  const { identifier, password } = loginSchema.parse(req.body);

  // Simple, unambiguous split: an email always contains '@'; a bare phone
  // number never does. Phone login only ever resolves a VERIFIED phone.
  const isEmail = identifier.includes('@');
  const user = isEmail
    ? await userService.findByEmail(identifier)
    : await userService.findByVerifiedPhone(identifier.replace(/\D/g, ''));

  if (!user) {
    throw new AppError('Invalid credentials.', 401, 'INVALID_CREDENTIALS');
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    throw new AppError('Invalid credentials.', 401, 'INVALID_CREDENTIALS');
  }

  const token = issueSession(res, user);
  ok(res, { user: userService.toPublicUser(user), token });
}

async function logout(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  ok(res, { loggedOut: true });
}

async function me(req, res) {
  const user = await userService.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found.', 404, 'NOT_FOUND');
  }
  ok(res, { user: userService.toPublicUser(user) });
}

async function forgotPassword(req, res) {
  const { email } = forgotPasswordSchema.parse(req.body);
  const user = await userService.findByEmail(email);

  // Always respond the same way whether or not the account exists, to avoid leaking which emails are registered.
  if (user) {
    const rawToken = generateRawToken();
    const expiry = new Date(Date.now() + env.resetTokenExpiresMin * 60 * 1000).toISOString();
    await userService.setResetToken(user.userId, hashToken(rawToken), expiry);

    const resetLink = `${env.frontendOrigin}/reset-password?token=${rawToken}&uid=${user.userId}`;
    await sendPasswordResetEmail({ toEmail: user.email, resetLink });
  }

  ok(res, { message: 'If an account exists for that email, a reset link has been sent.' });
}

async function resetPassword(req, res) {
  const { uid, token, password } = resetPasswordSchema.parse(req.body);

  const user = await userService.findById(uid);
  if (!user || !user.resetTokenHash || !user.resetTokenExpiry) {
    throw new AppError('Invalid or expired reset link.', 400, 'INVALID_RESET_TOKEN');
  }

  const isExpired = new Date(user.resetTokenExpiry).getTime() < Date.now();
  const tokenMatches = user.resetTokenHash === hashToken(token);

  if (isExpired || !tokenMatches) {
    throw new AppError('Invalid or expired reset link.', 400, 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await hashPassword(password);
  await userService.clearResetTokenAndSetPassword(user.userId, passwordHash);

  ok(res, { message: 'Password updated. You can now log in.' });
}

// Phone-login accounts have no email, so the email reset-link flow above
// can never reach them — this is the phone equivalent. It skips the
// reset-token/email-link mechanism entirely: verifying the OTP already
// proves ownership of the number, so a successful verify can set the new
// password directly in the same request.
async function forgotPasswordPhone(req, res) {
  const { phone } = forgotPasswordPhoneSchema.parse(req.body);
  const user = await userService.findByVerifiedPhone(phone);

  // Same "respond identically either way" rule as the email flow, to avoid
  // leaking which numbers have accounts.
  if (user) {
    await otpService.sendOtp(phone);
  }

  ok(res, { message: 'If an account exists for that mobile number, a verification code has been sent.' });
}

async function resetPasswordPhone(req, res) {
  const { phone, code, password } = resetPasswordPhoneSchema.parse(req.body);

  const user = await userService.findByVerifiedPhone(phone);
  if (!user) {
    throw new AppError('Invalid or expired code.', 400, 'OTP_NOT_FOUND');
  }

  await otpService.verifyOtp(phone, code); // throws AppError on wrong/expired/too-many-attempts

  const passwordHash = await hashPassword(password);
  await userService.updatePassword(user.userId, passwordHash);

  ok(res, { message: 'Password updated. You can now log in.' });
}

// The customer-facing auth model: phone + OTP only, no password, no email,
// no signup form. This is the ONLY account-creation path a customer ever
// goes through now — register() above is left in place solely because
// admin accounts still use it indirectly via scripts/createAdmin.js, but no
// customer-facing UI calls it anymore.
async function requestOtp(req, res) {
  const { phone } = sendOtpSchema.parse(req.body);
  // Deliberately no "does this account exist" check — unlike
  // forgotPasswordPhone, this same endpoint is the signup entry point too,
  // so sending must succeed identically whether the number is new or
  // returning. There's nothing to leak by varying behavior here, since
  // both outcomes already send a code either way.
  await otpService.sendOtp(phone);
  ok(res, { sent: true });
}

async function verifyOtp(req, res) {
  const { phone, code } = verifyOtpSchema.parse(req.body);
  await otpService.verifyOtp(phone, code); // throws AppError on wrong/expired/too-many-attempts

  const existingUser = await userService.findByVerifiedPhone(phone);
  const user = existingUser || (await userService.createUser({ phone, verifiedPhone: phone, role: 'customer' }));

  const token = issueSession(res, user);
  ok(res, { user: userService.toPublicUser(user), token, isNewAccount: !existingUser });
}

async function updateProfile(req, res) {
  const data = updateProfileSchema.parse(req.body);
  await userService.updateProfile(req.user.id, data);
  const user = await userService.findById(req.user.id);
  ok(res, { user: userService.toPublicUser(user) });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await userService.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found.', 404, 'NOT_FOUND');
  }

  const validPassword = await verifyPassword(currentPassword, user.passwordHash);
  if (!validPassword) {
    throw new AppError('Current password is incorrect.', 401, 'INVALID_CREDENTIALS');
  }

  const passwordHash = await hashPassword(newPassword);
  await userService.updatePassword(req.user.id, passwordHash);
  ok(res, { updated: true });
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
  forgotPasswordPhone,
  resetPasswordPhone,
  requestOtp,
  verifyOtp,
  updateProfile,
  changePassword,
};
