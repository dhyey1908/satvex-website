const { z } = require('zod');

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,15}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  message: z.string().trim().min(5).max(2000),
});

module.exports = { contactSchema };
