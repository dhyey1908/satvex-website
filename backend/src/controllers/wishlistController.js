const wishlistService = require('../services/wishlistService');
const productService = require('../services/productService');
const { addWishlistItemSchema } = require('../validators/wishlistValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

async function getWishlist(req, res) {
  const entries = await wishlistService.listForUser(req.user.id);

  const items = await Promise.all(
    entries.map(async (entry) => {
      const product = await productService.findById(entry.productId);
      if (!product) {
        return { productId: entry.productId, addedAt: entry.addedAt, available: false };
      }
      // Same "cheapest active selling option" reference used by ProductCard,
      // so the wishlist can show the same discount badge/strike-through —
      // display only, `basePrice` itself is unchanged.
      const activeOptions = (product.sellingOptions || []).filter((o) => o.isActive);
      const cheapestOption = activeOptions.reduce((min, o) => (!min || o.price < min.price ? o : min), null);
      return {
        productId: product.productId,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] || null,
        basePrice: product.basePrice,
        compareAtPrice: cheapestOption?.compareAtPrice ?? null,
        isActive: product.isActive,
        addedAt: entry.addedAt,
        available: true,
      };
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
