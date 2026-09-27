const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { attachUserIfPresent, requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/', attachUserIfPresent, asyncHandler(productController.list));
router.get('/slug/:slug', attachUserIfPresent, asyncHandler(productController.getBySlug));
router.get('/:id', attachUserIfPresent, asyncHandler(productController.getById));

router.post('/', requireAuth, requireAdmin, asyncHandler(productController.create));
router.put('/:id', requireAuth, requireAdmin, asyncHandler(productController.update));
router.delete('/:id', requireAuth, requireAdmin, asyncHandler(productController.remove));

module.exports = router;
