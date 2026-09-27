const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const couponController = require('../controllers/couponController');

const router = express.Router();

router.post('/apply', requireAuth, asyncHandler(couponController.applyToCart));

module.exports = router;
