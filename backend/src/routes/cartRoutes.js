const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(cartController.getCart));
router.post('/', asyncHandler(cartController.addToCart));
router.put('/:id', asyncHandler(cartController.updateCartItem));
router.delete('/:id', asyncHandler(cartController.removeCartItem));
router.put('/:id/saved-for-later', asyncHandler(cartController.updateSavedForLater));

module.exports = router;
