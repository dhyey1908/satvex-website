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
const gokwikRoutes = require('./gokwikRoutes');
const shiprocketRoutes = require('./shiprocketRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
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
router.use('/gokwik', gokwikRoutes);
router.use('/shiprocket', shiprocketRoutes);

module.exports = router;
