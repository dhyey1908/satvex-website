const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.use(requireAuth);

router.post('/quote', asyncHandler(orderController.quote));
router.post('/', asyncHandler(orderController.checkout));
router.get('/', asyncHandler(orderController.listMyOrders));
router.get('/:id', asyncHandler(orderController.getMyOrder));
router.post('/:id/cancel', asyncHandler(orderController.cancelMyOrder));
router.post('/:id/reorder', asyncHandler(orderController.reorder));

module.exports = router;
