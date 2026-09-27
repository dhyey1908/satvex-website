const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const wishlistController = require('../controllers/wishlistController');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(wishlistController.getWishlist));
router.post('/', asyncHandler(wishlistController.addToWishlist));
router.delete('/:productId', asyncHandler(wishlistController.removeFromWishlist));

module.exports = router;
