const { z } = require('zod');

const checkoutSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
      // Optional for COD (email is no longer mandatory account-wide) but
      // still required for Online — Cashfree's Orders API requires
      // customer_email, so there's a real external constraint here, not
      // just a product choice. Enforced below via refine.
      email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
    }),
    address: z.object({
      line1: z.string().trim().min(3).max(200),
      landmark: z.string().trim().max(200).optional().or(z.literal('')),
      city: z.string().trim().min(2).max(100),
      state: z.string().trim().min(2).max(100),
      pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.'),
      country: z.string().trim().min(2).max(100),
    }),
    couponCode: z.string().trim().min(1).optional(),
    paymentMethod: z.enum(['COD', 'Online']).default('COD'),
  })
  .refine((data) => data.paymentMethod !== 'Online' || Boolean(data.customer.email), {
    message: 'An email address is required for online payment.',
    path: ['customer', 'email'],
  });

const quoteSchema = z.object({
  couponCode: z.string().trim().min(1).optional(),
  paymentMethod: z.enum(['COD', 'Online']).default('COD'),
  // Optional — cart-page preview before an address is chosen won't have
  // this; checkout always does. Without it, shipping uses the flat
  // fallback charge (see pricingService.calculateTotals).
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.').optional(),
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
