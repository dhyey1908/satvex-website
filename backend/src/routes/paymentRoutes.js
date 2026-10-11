const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Public — PayU's hosted checkout POSTs here directly from the customer's
// browser (both surl and furl). No requireAuth: there's no user session to
// attach to a browser-redirect POST. Safety comes from the reverse-hash
// verification plus the authoritative verify_payment call inside the
// controller, not from auth middleware — see paymentController.js.
router.post('/payu/callback', asyncHandler(paymentController.callback));

module.exports = router;
