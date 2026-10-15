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

const router = express.Router();

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
