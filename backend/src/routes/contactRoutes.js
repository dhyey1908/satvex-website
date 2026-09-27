const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { contactLimiter } = require('../middleware/rateLimit');
const contactController = require('../controllers/contactController');

const router = express.Router();

router.post('/', contactLimiter, asyncHandler(contactController.submit));

module.exports = router;
