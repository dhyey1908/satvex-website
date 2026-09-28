const { z } = require('zod');

const addressSchema = z.object({
  label: z.enum(['Home', 'Work', 'Other']).default('Home'),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
  line1: z.string().trim().min(3).max(200),
  landmark: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.'),
  country: z.string().trim().min(2).max(100),
  isDefault: z.boolean().default(false),
});

const addressUpdateSchema = addressSchema.partial();

module.exports = { addressSchema, addressUpdateSchema };
