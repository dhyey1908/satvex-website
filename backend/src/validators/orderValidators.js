const { z } = require('zod');
const { deliveryMobile, personName, placeName, streetLine, indiaOnly } = require('./fieldRules');

const checkoutSchema = z.object({
  customer: z.object({
    name: personName,
    phone: deliveryMobile,
    // Fully optional, for both COD and Online. The email field was removed
    // from checkout UI entirely; PayU requires a non-empty email on its
    // payment form, so the controller falls back to a placeholder address
    // when none is on file rather than requiring it here.
    email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  }),
  address: z.object({
    line1: streetLine,
    landmark: z.string().trim().max(200).optional().or(z.literal('')),
    city: placeName('City'),
    state: placeName('State'),
    pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.'),
    country: indiaOnly,
  }),
  // 128 is far above any real code and keeps a hostile value from ever reaching
  // a DynamoDB key lookup (a ~2 KB key made that call throw a 500).
  couponCode: z.string().trim().min(1).max(64).optional(),
  paymentMethod: z.enum(['COD', 'Online']).default('COD'),
  // The total the customer was shown and agreed to. The server still prices the
  // order itself; this only lets it refuse (409 PRICE_CHANGED) instead of
  // charging a different amount than the one on the customer's screen.
  expectedTotal: z.number().nonnegative().max(10000000).optional(),
});

const quoteSchema = z.object({
  couponCode: z.string().trim().min(1).max(64).optional(),
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
