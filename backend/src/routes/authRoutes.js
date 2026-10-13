const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, passwordResetLimiter, otpLimiter, refreshLimiter } = require('../middleware/rateLimit');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, asyncHandler(authController.register));
router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
// No requireAuth — by definition the access token is expired/missing when
// this is called. Authorization comes entirely from the refresh cookie
// itself (validated inside the controller).
router.post('/refresh', refreshLimiter, asyncHandler(authController.refresh));
router.get('/me', requireAuth, asyncHandler(authController.me));
router.post('/forgot-password', passwordResetLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', passwordResetLimiter, asyncHandler(authController.resetPassword));
router.post('/forgot-password-phone', passwordResetLimiter, asyncHandler(authController.forgotPasswordPhone));
router.post('/reset-password-phone', passwordResetLimiter, asyncHandler(authController.resetPasswordPhone));
// The customer-facing auth flow: phone + OTP only. request-otp also serves
// as signup (verify-otp creates the account if the number is new) — see
// authController.verifyOtp.
router.post('/request-otp', otpLimiter, asyncHandler(authController.requestOtp));
router.post('/verify-otp', otpLimiter, asyncHandler(authController.verifyOtp));
router.put('/me', requireAuth, asyncHandler(authController.updateProfile));
router.put('/me/password', requireAuth, passwordResetLimiter, asyncHandler(authController.changePassword));

module.exports = router;
