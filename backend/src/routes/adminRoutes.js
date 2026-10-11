const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { uploadUrlLimiter } = require('../middleware/rateLimit');
const adminController = require('../controllers/adminController');
const orderController = require('../controllers/orderController');
const contactController = require('../controllers/contactController');
const mediaController = require('../controllers/mediaController');
const couponController = require('../controllers/couponController');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/dashboard', asyncHandler(adminController.dashboard));

router.get('/customers', asyncHandler(adminController.listCustomers));

router.get('/orders', asyncHandler(orderController.adminListOrders));
router.get('/orders/:id', asyncHandler(orderController.adminGetOrder));
router.put('/orders/:id/status', asyncHandler(orderController.adminUpdateStatus));
router.post('/orders/:id/refund', asyncHandler(orderController.adminRefund));
router.post('/orders/:id/retry-shipment', asyncHandler(orderController.adminRetryShipment));
router.post('/shiprocket/test-connection', asyncHandler(orderController.adminTestShiprocketConnection));

router.get('/contacts', asyncHandler(contactController.adminList));

router.get('/settings', asyncHandler(adminController.getSettings));
router.put('/settings', asyncHandler(adminController.updateSettings));

router.post('/media/upload-url', uploadUrlLimiter, asyncHandler(mediaController.getUploadUrl));

router.get('/coupons', asyncHandler(couponController.adminList));
router.post('/coupons', asyncHandler(couponController.adminCreate));
router.put('/coupons/:code', asyncHandler(couponController.adminUpdate));
router.delete('/coupons/:code', asyncHandler(couponController.adminRemove));
router.get('/coupons/:code/redemptions', asyncHandler(couponController.adminRedemptions));

router.get('/reviews', asyncHandler(reviewController.adminList));
router.delete('/reviews/:id', asyncHandler(reviewController.adminRemove));

module.exports = router;
