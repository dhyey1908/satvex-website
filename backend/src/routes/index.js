const express = require('express');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const cartRoutes = require('./cartRoutes');
const wishlistRoutes = require('./wishlistRoutes');
const orderRoutes = require('./orderRoutes');
const adminRoutes = require('./adminRoutes');
const contactRoutes = require('./contactRoutes');
const settingsRoutes = require('./settingsRoutes');
const addressRoutes = require('./addressRoutes');
const couponRoutes = require('./couponRoutes');
const reviewRoutes = require('./reviewRoutes');
const paymentRoutes = require('./paymentRoutes');
const shiprocketRoutes = require('./shiprocketRoutes');
const phoneRoutes = require('./phoneRoutes');
const deliveryRoutes = require('./deliveryRoutes');

const { noStore } = require('../middleware/noStore');
const clientErrorController = require('../controllers/clientErrorController');
const asyncHandler = require('../utils/asyncHandler');
const { clientErrorLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Everything that belongs to one customer is never cached (see middleware/noStore).
router.use(['/auth', '/phone', '/cart', '/wishlist', '/orders', '/addresses', '/payments'], noStore);

// The browser reports cart / checkout errors here so they reach our logs instead of vanishing in a customer's console.
router.post('/client-errors', clientErrorLimiter, asyncHandler(clientErrorController.report));

router.use('/auth', authRoutes);
router.use('/phone', phoneRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/orders', orderRoutes);
router.use('/admin', adminRoutes);
router.use('/contact', contactRoutes);
router.use('/settings', settingsRoutes);
router.use('/addresses', addressRoutes);
router.use('/coupons', couponRoutes);
router.use('/reviews', reviewRoutes);
router.use('/payments', paymentRoutes);
router.use('/shiprocket', shiprocketRoutes);
// Same handler under a second path. Shiprocket's panel rejects webhook URLs that
// contain brand words (shiprocket / kartrocket / sr / kr), so the one to register
// there is  <api>/api/courier/webhook ; /shiprocket/webhook is kept so anything
// already pointing at it keeps working.
router.use('/courier', shiprocketRoutes);
router.use('/delivery', deliveryRoutes);

module.exports = router;
