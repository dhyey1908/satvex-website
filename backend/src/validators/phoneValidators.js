const { z } = require('zod');
const { indianMobile } = require('./fieldRules');

const sendOtpSchema = z.object({
  phone: indianMobile,
});

const verifyOtpSchema = z.object({
  phone: indianMobile,
  code: z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code.'),
});

module.exports = { sendOtpSchema, verifyOtpSchema };
