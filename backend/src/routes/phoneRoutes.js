const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { otpLimiter } = require('../middleware/rateLimit');
const phoneController = require('../controllers/phoneController');

const router = express.Router();

router.use(requireAuth);

router.post('/send-otp', otpLimiter, asyncHandler(phoneController.sendOtp));
router.post('/verify-otp', otpLimiter, asyncHandler(phoneController.verifyOtp));

module.exports = router;
