const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const deliveryController = require('../controllers/deliveryController');
const { deliveryCheckLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/check', asyncHandler(deliveryController.checkPincode));
router.get('/check', deliveryCheckLimiter, asyncHandler(deliveryController.deliveryCheck));

module.exports = router;
