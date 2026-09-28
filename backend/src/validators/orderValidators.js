const { z } = require('zod');

const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^[0-9+\-\s()]{7,15}$/, 'Invalid phone number'),
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

module.exports = { checkoutSchema, quoteSchema, updateOrderStatusSchema };
