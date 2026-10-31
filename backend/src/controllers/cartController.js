const cartService = require('../services/cartService');
const pricingService = require('../services/pricingService');
const { addCartItemSchema, updateCartItemSchema, savedForLaterSchema } = require('../validators/cartValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

// The whole cart, in one shape, for every response: the browser REPLACES its cart with this, so it can never be
// left half-updated. itemCount = the sum of the quantities (a Combo of 3 x 2 counts as 2 bag items, never as 6
// pieces); lineCount = the number of separate lines.
function summarize(items) {
  const activeItems = items.filter((item) => !item.savedForLater);
  const savedItems = items.filter((item) => item.savedForLater);
  const total = Number(activeItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const itemCount = activeItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return { items: activeItems, savedItems, total, itemCount, lineCount: activeItems.length };
}

async function fullCart(userId) {
  return summarize(await cartService.getCartForUser(userId));
}

async function getCart(req, res) {
  ok(res, await fullCart(req.user.id));
}

async function addToCart(req, res) {
  const input = addCartItemSchema.parse(req.body);
  const lineItem = await pricingService.resolveLineItem(input);
  const item = await cartService.addItem(req.user.id, lineItem, input.quantity, input.requestId);
  created(res, { item, ...(await fullCart(req.user.id)) });
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
  ok(res, { item, ...(await fullCart(req.user.id)) });
}

async function removeCartItem(req, res) {
  await cartService.removeItem(req.user.id, req.params.id);
  ok(res, { deleted: true, ...(await fullCart(req.user.id)) });
}

async function updateSavedForLater(req, res) {
  const { savedForLater } = savedForLaterSchema.parse(req.body);
  await cartService.setSavedForLater(req.user.id, req.params.id, savedForLater);
  ok(res, { updated: true, savedForLater, ...(await fullCart(req.user.id)) });
}

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, updateSavedForLater };
