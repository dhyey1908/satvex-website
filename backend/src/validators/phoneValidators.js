const { z } = require('zod');

const sendOtpSchema = z.object({
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
});

const verifyOtpSchema = z.object({
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
  code: z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code.'),
});

module.exports = { sendOtpSchema, verifyOtpSchema };
