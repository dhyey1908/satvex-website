const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require('../validators/authValidators');
const userService = require('../services/userService');
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

  const existing = await userService.findByEmail(email);
  if (existing) {
    throw new AppError('An account with this email already exists.', 409, 'EMAIL_IN_USE');
  }

  const passwordHash = await hashPassword(password);
  const user = await userService.createUser({ name, email, phone, passwordHash });

  const token = issueSession(res, user);
  created(res, { user: userService.toPublicUser(user), token });
}

async function login(req, res) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await userService.findByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
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

    const resetLink = `${env.publicSiteUrl}/reset-password?token=${rawToken}&uid=${user.userId}`;
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

module.exports = { register, login, logout, me, forgotPassword, resetPassword, updateProfile, changePassword };
