const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { contactLimiter, uploadUrlLimiter } = require('../middleware/rateLimit');
const contactController = require('../controllers/contactController');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

router.post('/', contactLimiter, asyncHandler(contactController.submit));
router.post('/upload-url', uploadUrlLimiter, asyncHandler(mediaController.getEnquiryUploadUrl));

module.exports = router;
