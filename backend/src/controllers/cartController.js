const cartService = require('../services/cartService');
const pricingService = require('../services/pricingService');
const { addCartItemSchema, updateCartItemSchema, savedForLaterSchema } = require('../validators/cartValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

function summarize(items) {
  const activeItems = items.filter((item) => !item.savedForLater);
  const savedItems = items.filter((item) => item.savedForLater);
  const total = Number(activeItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  return { items: activeItems, savedItems, total, itemCount: activeItems.length };
}

async function getCart(req, res) {
  const items = await cartService.getCartForUser(req.user.id);
  ok(res, summarize(items));
}

async function addToCart(req, res) {
  const input = addCartItemSchema.parse(req.body);
  const lineItem = await pricingService.resolveLineItem(input);
  const item = await cartService.addItem(req.user.id, lineItem, input.quantity);
  created(res, { item });
}

async function updateCartItem(req, res) {
  const input = updateCartItemSchema.parse(req.body);
  const existing = await cartService.getCartItem(req.user.id, req.params.id);
  if (!existing) {
    throw new AppError('Cart item not found.', 404, 'NOT_FOUND');
  }

  const lineItem = await pricingService.resolveLineItem({
    productId: existing.productId,
    sellingOptionId: input.sellingOptionId || existing.sellingOptionId,
    selectedColors: input.selectedColors || existing.selectedColors,
  });

  const item = await cartService.updateItem(req.user.id, req.params.id, lineItem, input.quantity);
  ok(res, { item });
}

async function removeCartItem(req, res) {
  await cartService.removeItem(req.user.id, req.params.id);
  ok(res, { deleted: true });
}

async function updateSavedForLater(req, res) {
  const { savedForLater } = savedForLaterSchema.parse(req.body);
  await cartService.setSavedForLater(req.user.id, req.params.id, savedForLater);
  ok(res, { updated: true, savedForLater });
}

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, updateSavedForLater };
