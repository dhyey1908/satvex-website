const cartService = require('../services/cartService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const pricingService = require('../services/pricingService');
const { couponSchema, couponUpdateSchema, applyCouponSchema } = require('../validators/couponValidators');
const AppError = require('../utils/AppError');
const { couponsQuerySchema, queryCoupons } = require('../services/adminListQueries');
const { ok, created } = require('../utils/response');

async function applyToCart(req, res) {
  const { code } = applyCouponSchema.parse(req.body);
  const items = (await cartService.getCartForUser(req.user.id)).filter((item) => !item.savedForLater);
  const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

  if (items.length === 0) {
    throw new AppError('Your cart is empty.', 400, 'CART_EMPTY');
  }

  const discount = await pricingService.validateCoupon(code, subtotal, req.user.id);
  ok(res, { ...discount, subtotal });
}

async function adminList(req, res) {
  const query = couponsQuerySchema.parse(req.query);
  const { items, pagination } = queryCoupons(await couponService.listAll(), query);
  ok(res, { coupons: items, pagination });
}

async function adminCreate(req, res) {
  const data = couponSchema.parse(req.body);
  const coupon = await couponService.create(data);
  created(res, { coupon });
}

async function adminUpdate(req, res) {
  const data = couponUpdateSchema.parse(req.body);
  const coupon = await couponService.update(req.params.code, data);
  ok(res, { coupon });
}

async function adminRemove(req, res) {
  await couponService.remove(req.params.code);
  ok(res, { deleted: true });
}

async function adminRedemptions(req, res) {
  const redemptions = await couponRedemptionService.listForCoupon(req.params.code);
  ok(res, { redemptions });
}

module.exports = { applyToCart, adminList, adminCreate, adminUpdate, adminRemove, adminRedemptions };
