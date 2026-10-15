const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { otpSendThrottle, otpVerifyThrottle } = require('../middleware/ipThrottle');
const phoneController = require('../controllers/phoneController');

const router = express.Router();

router.use(requireAuth);

router.post('/send-otp', otpSendThrottle, asyncHandler(phoneController.sendOtp));
router.post('/verify-otp', otpVerifyThrottle, asyncHandler(phoneController.verifyOtp));

module.exports = router;
