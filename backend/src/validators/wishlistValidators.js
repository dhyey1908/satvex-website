const { z } = require('zod');

const addWishlistItemSchema = z.object({
  productId: z.string().min(1),
});

module.exports = { addWishlistItemSchema };
