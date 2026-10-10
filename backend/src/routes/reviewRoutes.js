const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { uploadUrlLimiter } = require('../middleware/rateLimit');
const reviewController = require('../controllers/reviewController');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

router.get('/mine', requireAuth, asyncHandler(reviewController.listMine));
router.post('/upload-url', requireAuth, uploadUrlLimiter, asyncHandler(mediaController.getReviewUploadUrl));

module.exports = router;
