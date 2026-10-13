const { z } = require('zod');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

// Query-string params arrive as strings and may be empty — treat '' as "no filter".
const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const financialAnalyticsQuerySchema = z
  .object({
    from: optional(isoDate),
    to: optional(isoDate),
    paymentMethod: optional(z.enum(['COD', 'Online'])),
    status: optional(z.enum(['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'])),
    bucket: optional(
      z.enum(['expired', 'awaiting_payment', 'refunded', 'cancelled', 'rto', 'collected', 'cod_pending'])
    ),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"From" date must not be after "To" date.', path: ['to'] });

module.exports = { financialAnalyticsQuerySchema };
