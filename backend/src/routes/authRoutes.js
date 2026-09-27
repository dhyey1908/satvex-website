const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimit');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, asyncHandler(authController.register));
router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));
router.post('/forgot-password', passwordResetLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', passwordResetLimiter, asyncHandler(authController.resetPassword));
router.put('/me', requireAuth, asyncHandler(authController.updateProfile));
router.put('/me/password', requireAuth, passwordResetLimiter, asyncHandler(authController.changePassword));

module.exports = router;
