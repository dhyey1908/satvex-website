const { z } = require('zod');
const { deliveryMobile, placeName, indiaOnly } = require('./fieldRules');
const { ENGLISH_MESSAGE, TOO_LONG_MESSAGE, isEnglishName, isEnglishAddressText, addressTextProblem } = require('../utils/addressRules');

// Delivery details are English-only: they are printed on the courier label and read by a delivery agent.
const lettersIn = (s) => (s.match(/[A-Za-z]/g) || []).length;
const deliveryName = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(100)
  .superRefine((v, ctx) => {
    if (!isEnglishName(v)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: ENGLISH_MESSAGE });
    else if (lettersIn(v) < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please enter your full name.' });
  });
const deliveryCity = z
  .string()
  .trim()
  .min(2, 'City must be at least 2 characters.')
  .max(100)
  .superRefine((v, ctx) => {
    if (!isEnglishAddressText(v)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: ENGLISH_MESSAGE });
    else if (/[0-9]/.test(v)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'City can only contain letters.' });
  });

// The delivery address as checkout and the admin address editor both take it. The line1/landmark rules (English only,
// junk text, landmark required, 10-190 characters together) live in utils/addressRules.js.
const addressSchema = z
  .object({
    // The size limits are checked together by addressTextProblem (line1 + landmark), so these only stop a huge payload.
    line1: z.string().trim().min(1, 'Please enter your address.').max(600, TOO_LONG_MESSAGE),
    landmark: z.string().trim().max(600, TOO_LONG_MESSAGE).optional().or(z.literal('')),
    city: deliveryCity,
    state: placeName('State'),
    pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.'),
    country: indiaOnly,
  })
  .superRefine((address, ctx) => {
    const problem = addressTextProblem(address);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [problem.field], message: problem.message });
  });

const checkoutSchema = z.object({
  customer: z.object({
    name: deliveryName,
    phone: deliveryMobile,
    // Fully optional, for both COD and Online. The email field was removed
    // from checkout UI entirely; PayU requires a non-empty email on its
    // payment form, so the controller falls back to a placeholder address
    // when none is on file rather than requiring it here.
    email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  }),
  address: addressSchema,
  // 128 is far above any real code and keeps a hostile value from ever reaching
  // a DynamoDB key lookup (a ~2 KB key made that call throw a 500).
  couponCode: z.string().trim().min(1).max(64).optional(),
  paymentMethod: z.enum(['COD', 'Online']).default('COD'),
  // The total the customer was shown and agreed to. The server still prices the
  // order itself; this only lets it refuse (409 PRICE_CHANGED) instead of
  // charging a different amount than the one on the customer's screen.
  expectedTotal: z.number().nonnegative().max(10000000).optional(),
  // "Buy Now": order from this one-item session instead of the bag (see directCheckoutService).
  directSession: z.string().trim().min(1).max(2000).optional(),
});

const quoteSchema = z.object({
  couponCode: z.string().trim().min(1).max(64).optional(),
  paymentMethod: z.enum(['COD', 'Online']).default('COD'),
  // Optional — cart-page preview before an address is chosen won't have
  // this; checkout always does. Without it, shipping uses the flat
  // fallback charge (see pricingService.calculateTotals).
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.').optional(),
  // "Buy Now": price this one-item session instead of the bag.
  directSession: z.string().trim().min(1).max(2000).optional(),
});

// Why an admin cancelled an order (the cancel dialog in Orders). Only used with status 'Cancelled'.
const CANCEL_REASONS = ['No answer', 'Customer cancelled', 'Fake order', 'Other'];

const updateOrderStatusSchema = z.object({
  status: z.enum(['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled']),
  cancelReason: z.enum(CANCEL_REASONS).optional(),
  cancelNote: z.string().trim().max(300).optional(),
});

// Admin "Edit address": the same address rules as checkout.
const adminAddressSchema = z.object({ address: addressSchema });

// Refund amount is never taken from the client (Phase 1 is full-refund-only
// — always the order's own stored total); this just allows an optional note.
const refundSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

module.exports = { CANCEL_REASONS, adminAddressSchema, checkoutSchema, addressSchema, quoteSchema, updateOrderStatusSchema, refundSchema };
