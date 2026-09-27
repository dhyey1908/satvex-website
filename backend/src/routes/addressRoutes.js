const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const addressController = require('../controllers/addressController');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(addressController.list));
router.post('/', asyncHandler(addressController.create));
router.put('/:id', asyncHandler(addressController.update));
router.delete('/:id', asyncHandler(addressController.remove));

module.exports = router;
