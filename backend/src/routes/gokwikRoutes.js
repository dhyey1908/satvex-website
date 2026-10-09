const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const gokwikController = require('../controllers/gokwikController');

const router = express.Router();

// Public — GoKwik calls this server-to-server, same shape as the Cashfree
// webhook route. No requireAuth: there's no user session to attach to a
// webhook call. Safety comes from header-credential verification plus a
// mandatory payment/verify re-confirmation inside the controller.
router.post('/webhook', asyncHandler(gokwikController.webhook));

module.exports = router;
