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
const productController = require('../controllers/productController');
const adminSecurityController = require('../controllers/adminSecurityController');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Two-step sign-in (authenticator app) for the admin account itself.
router.get('/security', asyncHandler(adminSecurityController.status));
router.post('/security/totp/setup', asyncHandler(adminSecurityController.totpSetup));
router.post('/security/totp/enable', asyncHandler(adminSecurityController.totpEnable));
router.post('/security/totp/disable', asyncHandler(adminSecurityController.totpDisable));

router.get('/dashboard', asyncHandler(adminController.dashboard));

router.get('/customers', asyncHandler(adminController.listCustomers));

router.get('/analytics/financial', asyncHandler(adminController.financialAnalytics));

router.get('/orders', asyncHandler(orderController.adminListOrders));
router.get('/orders/:id', asyncHandler(orderController.adminGetOrder));
router.put('/orders/:id/status', asyncHandler(orderController.adminUpdateStatus));
router.post('/orders/:id/refund', asyncHandler(orderController.adminRefund));
router.post('/orders/:id/retry-shipment', asyncHandler(orderController.adminRetryShipment));
router.post('/orders/:id/link-shipment', asyncHandler(orderController.adminLinkManualShipment));
router.delete('/orders/:id/link-shipment', asyncHandler(orderController.adminUnlinkManualShipment));
router.get('/shipments/sync-issues', asyncHandler(orderController.adminShipmentSyncIssues));
router.post('/shipments/retry-all', asyncHandler(orderController.adminRetryAllShipments));
router.post('/shiprocket/test-connection', asyncHandler(orderController.adminTestShiprocketConnection));

router.get('/contacts', asyncHandler(contactController.adminList));
router.put('/contacts/:id/status', asyncHandler(contactController.adminUpdateStatus));

router.get('/products', asyncHandler(productController.adminList));

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
