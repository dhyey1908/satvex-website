const { z } = require('zod');

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.')
    .optional()
    .or(z.literal('')),
  message: z.string().trim().min(5).max(2000),
});

module.exports = { contactSchema };
