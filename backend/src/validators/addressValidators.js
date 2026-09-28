const { z } = require('zod');

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
  line1: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[0-9]{4,10}$/, 'Invalid pincode'),
  country: z.string().trim().min(2).max(100),
  isDefault: z.boolean().default(false),
});

const addressUpdateSchema = addressSchema.partial();

module.exports = { addressSchema, addressUpdateSchema };
