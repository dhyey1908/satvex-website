const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const shiprocketController = require('../controllers/shiprocketController');

const router = express.Router();

// Public — Shiprocket calls this server-to-server, same shape as the
// Cashfree/GoKwik webhooks. No requireAuth: there's no user session to
// attach to a webhook call. Safety comes from the optional x-api-key check
// inside the controller.
router.post('/webhook', asyncHandler(shiprocketController.webhook));

module.exports = router;
