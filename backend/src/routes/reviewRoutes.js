const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

router.get('/mine', requireAuth, asyncHandler(reviewController.listMine));

module.exports = router;
