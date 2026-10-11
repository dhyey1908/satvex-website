const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const deliveryController = require('../controllers/deliveryController');

const router = express.Router();

router.post('/check', asyncHandler(deliveryController.checkPincode));

module.exports = router;
