const { z } = require('zod');

const pincodeCheckSchema = z.object({
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.'),
});

module.exports = { pincodeCheckSchema };
