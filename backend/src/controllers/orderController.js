const cartService = require('../services/cartService');
const orderService = require('../services/orderService');
const couponService = require('../services/couponService');
const pricingService = require('../services/pricingService');
const { checkoutSchema, updateOrderStatusSchema } = require('../validators/orderValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

const SHIPPING = 0; // Free shipping for v1.
const CANCELLABLE_STATUSES = new Set(['Pending', 'Confirmed']);

async function checkout(req, res) {
  const { customer, address, couponCode } = checkoutSchema.parse(req.body);

  const cartItems = (await cartService.getCartForUser(req.user.id)).filter((item) => !item.savedForLater);
  if (cartItems.length === 0) {
    throw new AppError('Your cart is empty.', 400, 'CART_EMPTY');
  }

  // Re-derive every line item from current product data. Cart snapshots can go
  // stale between add-to-cart and checkout (e.g. admin changed a price).
  const orderItems = await Promise.all(
    cartItems.map(async (cartItem) => {
      const lineItem = await pricingService.resolveLineItem({
        productId: cartItem.productId,
        sellingOptionId: cartItem.sellingOptionId,
        selectedColors: cartItem.selectedColors,
      });
      const subtotal = Number((lineItem.unitPrice * cartItem.quantity).toFixed(2));
      return { ...lineItem, quantity: cartItem.quantity, subtotal };
    })
  );

  const subtotal = Number(orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

  // Coupon is re-validated fresh here (never trust a discount the client computed
  // earlier at cart preview time) and usage is only incremented on a real order.
  let discount = null;
  if (couponCode) {
    discount = await pricingService.validateCoupon(couponCode, subtotal);
  }

  const discountAmount = discount?.discountAmount || 0;
  const total = Number((subtotal - discountAmount + SHIPPING).toFixed(2));

  const order = await orderService.createOrder({
    userId: req.user.id,
    items: orderItems,
    customer,
    address,
    subtotal,
    couponCode: discount?.code || null,
    discountAmount,
    shipping: SHIPPING,
    total,
  });

  if (discount) {
    const coupon = await couponService.findByCode(discount.code);
    await couponService.incrementUsage(discount.code, coupon.usageLimit);
  }

  await cartService.clearCart(req.user.id);

  created(res, { order });
}

async function listMyOrders(req, res) {
  const orders = await orderService.listForUser(req.user.id);
  ok(res, { orders });
}

async function getMyOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  ok(res, { order });
}

async function cancelMyOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  if (!CANCELLABLE_STATUSES.has(order.status)) {
    throw new AppError(`Orders can only be cancelled while ${[...CANCELLABLE_STATUSES].join('/')}.`, 400, 'NOT_CANCELLABLE');
  }
  await orderService.updateStatus(req.params.id, 'Cancelled');
  ok(res, { updated: true, status: 'Cancelled' });
}

async function reorder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }

  const results = await Promise.allSettled(
    order.items.map(async (item) => {
      const lineItem = await pricingService.resolveLineItem({
        productId: item.productId,
        sellingOptionId: item.sellingOptionId,
        selectedColors: item.selectedColors,
      });
      return cartService.addItem(req.user.id, lineItem, item.quantity);
    })
  );

  const addedCount = results.filter((r) => r.status === 'fulfilled').length;
  const unavailableCount = results.length - addedCount;
  ok(res, { addedCount, unavailableCount });
}

async function adminListOrders(req, res) {
  const { status, search } = req.query;
  const orders = await orderService.listAll({ status, search });
  ok(res, { orders });
}

async function adminGetOrder(req, res) {
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  ok(res, { order });
}

async function adminUpdateStatus(req, res) {
  const { status } = updateOrderStatusSchema.parse(req.body);
  const order = await orderService.findById(req.params.id);
  if (!order) {
    throw new AppError('Order not found.', 404, 'NOT_FOUND');
  }
  await orderService.updateStatus(req.params.id, status);
  ok(res, { updated: true, status });
}

module.exports = {
  checkout,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  reorder,
  adminListOrders,
  adminGetOrder,
  adminUpdateStatus,
};
