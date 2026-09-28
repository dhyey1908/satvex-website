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
  usageLimit: z.number().int().positive().optional(),
  oneUsePerCustomer: z.boolean().default(false),
});

function withPercentageCap(schema) {
  return schema.refine((data) => data.discountType !== 'percentage' || !data.discountValue || data.discountValue <= 100, {
    message: 'Percentage discount cannot exceed 100.',
    path: ['discountValue'],
  });
}

const couponSchema = withPercentageCap(couponBaseSchema);
const couponUpdateSchema = withPercentageCap(couponBaseSchema.omit({ code: true }).partial());

const applyCouponSchema = z.object({
  code: z.string().trim().min(1),
});

module.exports = { couponSchema, couponUpdateSchema, applyCouponSchema };
