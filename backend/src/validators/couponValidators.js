const { z } = require('zod');

const couponBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, 'Code must be 3-20 letters/numbers'),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().positive(),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().optional().or(z.literal('')),
  // Smallest order (after nothing is deducted: the cart subtotal) the coupon works on.
  minOrderValue: z.number().min(0).max(1000000).optional(),
  usageLimit: z.number().int().positive().optional(),
  oneUsePerCustomer: z.boolean().default(false),
  // Show this code as a one-tap chip on the bag and checkout (only while the coupon is also active / valid / not used up).
  showAsChip: z.boolean().default(false),
});

function withPercentageCap(schema) {
  return schema.refine((data) => data.discountType !== 'percentage' || !data.discountValue || data.discountValue <= 100, {
    message: 'Percentage discount cannot exceed 100.',
    path: ['discountValue'],
  });
}

// A flat coupon worth more than the minimum order it needs would be a free order.
function withFlatBelowMinimum(schema) {
  return schema.refine(
    (data) => data.discountType !== 'flat' || !data.minOrderValue || !data.discountValue || data.discountValue < data.minOrderValue,
    { message: 'A flat discount must be smaller than the minimum order value.', path: ['discountValue'] }
  );
}

const couponSchema = withFlatBelowMinimum(withPercentageCap(couponBaseSchema));
const couponUpdateSchema = withFlatBelowMinimum(withPercentageCap(couponBaseSchema.omit({ code: true }).partial()));

const applyCouponSchema = z.object({
  code: z.string().trim().min(1),
  // "Buy Now": check the code against that one-item session instead of the bag.
  directSession: z.string().trim().min(1).max(2000).optional(),
});

module.exports = { couponSchema, couponUpdateSchema, applyCouponSchema };
