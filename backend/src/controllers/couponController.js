const cartService = require('../services/cartService');
const directCheckoutService = require('../services/directCheckoutService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const orderService = require('../services/orderService');
const pricingService = require('../services/pricingService');
const { couponSchema, couponUpdateSchema, applyCouponSchema } = require('../validators/couponValidators');
const AppError = require('../utils/AppError');
const { chipCoupons } = require('../utils/couponStatus');
const { couponsQuerySchema, queryCoupons } = require('../services/adminListQueries');
const { ok, created } = require('../utils/response');

async function applyToCart(req, res) {
  const { code, directSession } = applyCouponSchema.parse(req.body);
  // A Buy Now checkout has its own one item (the bag may be empty, or hold other things): price the code on THAT.
  const items = directSession
    ? await directCheckoutService.resolveItems(directSession, req.user.id)
    : (await cartService.getCartForUser(req.user.id)).filter((item) => !item.savedForLater);
  const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

  if (items.length === 0) {
    throw new AppError('Your cart is empty.', 400, 'CART_EMPTY');
  }

  const discount = await pricingService.validateCoupon(code, subtotal, req.user.id);
  ok(res, { ...discount, subtotal });
}

// Public: the codes the admin has switched on as quick-apply chips (and that can still be used today).
async function listChips(req, res) {
  ok(res, { chips: chipCoupons(await couponService.listAll()) });
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

// Who used a coupon. The orders are the record of it (every order keeps its coupon code, discount and customer), so the
// history is built from them: a coupon without "one use per customer" writes no redemption row, which used to leave
// this list empty even though the usage count said it had been used. Cancelled and expired orders are not uses (their
// coupon was released). Recorded redemptions whose order is not found are kept too.
async function adminRedemptions(req, res) {
  const code = String(req.params.code).toUpperCase();
  const [orders, recorded] = await Promise.all([orderService.listEverything(), couponRedemptionService.listForCoupon(code)]);
  const fromOrders = orders
    .filter((o) => String(o.couponCode || '').toUpperCase() === code && o.status !== 'Cancelled' && o.paymentStatus !== 'expired')
    .map((o) => ({
      redemptionId: o.orderId,
      orderId: o.orderId,
      customerName: o.customer?.name || '',
      customerPhone: o.customer?.phone || '',
      customerEmail: o.customer?.email || '',
      discountAmount: Number(o.discountAmount || 0),
      createdAt: o.createdAt,
    }));
  const seen = new Set(fromOrders.map((r) => r.orderId));
  const extra = recorded.filter((r) => !seen.has(r.orderId));
  const redemptions = [...fromOrders, ...extra].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  ok(res, { redemptions });
}

module.exports = { listChips, applyToCart, adminList, adminCreate, adminUpdate, adminRemove, adminRedemptions };
