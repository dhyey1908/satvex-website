const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Public — Cashfree calls this server-to-server. No requireAuth: there's no
// user session to attach to a webhook call. Safety comes from signature
// verification inside the controller, not from auth middleware.
router.post('/cashfree/webhook', asyncHandler(paymentController.webhook));

module.exports = router;
