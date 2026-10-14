const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimit');
const phoneController = require('../controllers/phoneController');

const router = express.Router();

router.use(requireAuth);

router.post('/send-otp', otpSendLimiter, asyncHandler(phoneController.sendOtp));
router.post('/verify-otp', otpVerifyLimiter, asyncHandler(phoneController.verifyOtp));

module.exports = router;
