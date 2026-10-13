const wishlistService = require('../services/wishlistService');
const productService = require('../services/productService');
const { addWishlistItemSchema } = require('../validators/wishlistValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');
const { stripProductCost } = require('../utils/productVisibility');

async function getWishlist(req, res) {
  const entries = await wishlistService.listForUser(req.user.id);

  const items = await Promise.all(
    entries.map(async (entry) => {
      const product = await productService.findById(entry.productId);
      if (!product) {
        return { productId: entry.productId, addedAt: entry.addedAt, available: false };
      }
      // Full product record (same shape the Shop page list/detail endpoints
      // return) so the wishlist grid can render the exact same ProductCard,
      // not a stripped-down lookalike.
      return { ...stripProductCost(product), addedAt: entry.addedAt, available: true };
    })
  );

  ok(res, { items });
}

async function addToWishlist(req, res) {
  const { productId } = addWishlistItemSchema.parse(req.body);
  const product = await productService.findById(productId);
  if (!product) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }
  await wishlistService.addProduct(req.user.id, productId);
  created(res, { added: true });
}

async function removeFromWishlist(req, res) {
  await wishlistService.removeProduct(req.user.id, req.params.productId);
  ok(res, { deleted: true });
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
