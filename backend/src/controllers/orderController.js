const { v4: uuid } = require('uuid');
const cartService = require('../services/cartService');
const orderService = require('../services/orderService');
const couponService = require('../services/couponService');
const couponRedemptionService = require('../services/couponRedemptionService');
const pricingService = require('../services/pricingService');
const { checkoutSchema, quoteSchema, updateOrderStatusSchema } = require('../validators/orderValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

const CANCELLABLE_STATUSES = new Set(['Pending', 'Confirmed']);

// Shared by checkout and the quote preview — re-derives every line item from
// current product/variant data (price, availability, stock) rather than
// trusting anything cached in the cart snapshot.
async function resolveOrderItems(userId) {
  const cartItems = (await cartService.getCartForUser(userId)).filter((item) => !item.savedForLater);
  if (cartItems.length === 0) {
    throw new AppError('Your cart is empty.', 400, 'CART_EMPTY');
  }
  return Promise.all(
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
}

// Read-only preview of the full breakdown (subtotal/discount/GST/shipping/COD/
// total) so the frontend never has to guess/recompute any of it — Cart and
// Checkout just display what this returns. Never mutates coupon usage.
async function quote(req, res) {
  const { couponCode, paymentMethod } = quoteSchema.parse(req.body);
  const orderItems = await resolveOrderItems(req.user.id);
  const totals = await pricingService.calculateTotals({
    items: orderItems,
    couponCode,
    paymentMethod,
    userId: req.user.id,
  });
  ok(res, { ...totals, items: orderItems });
}

async function checkout(req, res) {
  const { customer, address, couponCode, paymentMethod } = checkoutSchema.parse(req.body);

  const orderItems = await resolveOrderItems(req.user.id);

  // Coupon (incl. per-customer eligibility) and GST/shipping/COD are all
  // re-validated and computed fresh here — never trust a total the client
  // computed earlier at cart/quote preview time.
  const totals = await pricingService.calculateTotals({
    items: orderItems,
    couponCode,
    paymentMethod,
    userId: req.user.id,
  });

  // The order's id is minted up front so the one-use-per-customer redemption
  // record (written before the order itself) can reference it immediately —
  // no separate backfill write needed.
  const orderId = uuid();

  // Coupon usage (both the global limit and the per-customer redemption
  // record) is committed BEFORE the order is created, not after: if either
  // atomic check loses a race, we throw here and no order is created at all
  // — avoiding an orphaned order that already reflected a discount its
  // coupon didn't actually have room to grant.
  let coupon = null;
  if (totals.couponCode) {
    coupon = await couponService.findByCode(totals.couponCode);
    if (coupon.oneUsePerCustomer) {
      await couponRedemptionService.record({
        code: coupon.code,
        userId: req.user.id,
        orderId,
        customerName: customer.name,
        customerEmail: customer.email,
        discountAmount: totals.discountAmount,
      });
    }
    try {
      await couponService.incrementUsage(coupon.code, coupon.usageLimit);
    } catch (err) {
      if (coupon.oneUsePerCustomer) {
        await couponRedemptionService.remove(coupon.code, req.user.id).catch(() => {});
      }
      throw err;
    }
  }

  const order = await orderService.createOrder({
    orderId,
    userId: req.user.id,
    items: orderItems,
    customer,
    address,
    subtotal: totals.subtotal,
    couponCode: totals.couponCode,
    discountAmount: totals.discountAmount,
    gstPercent: totals.gstPercent,
    gstAmount: totals.gstAmount,
    shipping: totals.shipping,
    paymentMethod: totals.paymentMethod,
    codCharge: totals.codCharge,
    total: totals.total,
  });

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
  quote,
  checkout,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  reorder,
  adminListOrders,
  adminGetOrder,
  adminUpdateStatus,
};
