const { z } = require('zod');

const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
    email: z.string().trim().email('Invalid email address'),
  }),
  address: z.object({
    line1: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    pincode: z.string().trim().regex(/^[0-9]{4,10}$/, 'Invalid pincode'),
    country: z.string().trim().min(2).max(100),
  }),
  couponCode: z.string().trim().min(1).optional(),
  paymentMethod: z.enum(['COD', 'Online']).default('COD'),
});

const quoteSchema = z.object({
  couponCode: z.string().trim().min(1).optional(),
  paymentMethod: z.enum(['COD', 'Online']).default('COD'),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled']),
});

// Refund amount is never taken from the client (Phase 1 is full-refund-only
// — always the order's own stored total); this just allows an optional note.
const refundSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

module.exports = { checkoutSchema, quoteSchema, updateOrderStatusSchema, refundSchema };
