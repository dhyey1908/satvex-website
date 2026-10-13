const { z } = require('zod');

const ENQUIRY_TYPES = [
  'order_tracking',
  'return_refund_exchange',
  'payment_issue',
  'product_enquiry',
  'cancel_order',
  'general_enquiry',
];

const ORDER_ID_REQUIRED_TYPES = new Set([
  'order_tracking',
  'return_refund_exchange',
  'payment_issue',
  'cancel_order',
]);

const RETURN_REASONS = ['damaged', 'defective', 'wrong_item', 'missing_item', 'other'];
const RETURN_RESOLUTIONS = ['refund', 'replacement', 'exchange'];
const PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'cod', 'other'];
const ATTACHMENT_ALLOWED_TYPES = new Set(['return_refund_exchange', 'payment_issue']);

const contactSchema = z
  .object({
    enquiryType: z.enum(ENQUIRY_TYPES).default('general_enquiry'),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.')
      .optional()
      .or(z.literal('')),
    message: z.string().trim().min(5).max(2000),

    orderId: z.string().trim().max(64).optional().or(z.literal('')),

    // Return / Refund / Exchange — `.or(z.literal(''))` because the
    // frontend form always includes these keys (as '' when unselected,
    // e.g. on every non-return enquiry type), not just when relevant.
    returnReason: z.enum(RETURN_REASONS).optional().or(z.literal('')),
    returnResolution: z.enum(RETURN_RESOLUTIONS).optional().or(z.literal('')),

    // Payment Issue
    paymentMethod: z.enum(PAYMENT_METHODS).optional().or(z.literal('')),
    transactionRef: z.string().trim().max(100).optional().or(z.literal('')),

    // Cancel Order
    cancelReason: z.string().trim().max(200).optional().or(z.literal('')),

    // Already-uploaded CloudFront URLs (see reviewValidators.js's `images`
    // for the identical pattern) — type/size were enforced at the
    // presigned-upload step, a URL carries no content-type to re-check here.
    attachments: z.array(z.string().trim().url()).max(10, 'Up to 10 files.').default([]),
  })
  .superRefine((data, ctx) => {
    if (ORDER_ID_REQUIRED_TYPES.has(data.enquiryType) && !data.orderId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderId'], message: 'Order ID is required.' });
    }
    if (data.enquiryType === 'return_refund_exchange' && !data.returnReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['returnReason'], message: 'Please select a reason.' });
    }
    if (data.enquiryType === 'payment_issue' && !data.paymentMethod) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentMethod'], message: 'Please select a payment method.' });
    }
    if (data.attachments.length > 0 && !ATTACHMENT_ALLOWED_TYPES.has(data.enquiryType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'Attachments are not allowed for this enquiry type.' });
    }
  });

module.exports = {
  contactSchema,
  ENQUIRY_TYPES,
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  PAYMENT_METHODS,
};
