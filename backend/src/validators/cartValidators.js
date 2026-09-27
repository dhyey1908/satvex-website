const { z } = require('zod');

const addCartItemSchema = z.object({
  productId: z.string().min(1),
  sellingOptionId: z.string().min(1),
  selectedColors: z.array(z.string().min(1)).min(1).max(20),
  quantity: z.number().int().min(1).max(20).default(1),
});

const updateCartItemSchema = z.object({
  sellingOptionId: z.string().min(1).optional(),
  selectedColors: z.array(z.string().min(1)).min(1).max(20).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
});

const savedForLaterSchema = z.object({
  savedForLater: z.boolean(),
});

module.exports = { addCartItemSchema, updateCartItemSchema, savedForLaterSchema };
