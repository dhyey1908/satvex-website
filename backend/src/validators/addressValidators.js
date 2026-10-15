const { z } = require('zod');
const { deliveryMobile, personName, placeName, streetLine, indiaOnly } = require('./fieldRules');

const addressSchema = z.object({
  label: z.enum(['Home', 'Work', 'Other']).default('Home'),
  fullName: personName,
  phone: deliveryMobile,
  line1: streetLine,
  landmark: z.string().trim().max(200).optional().or(z.literal('')),
  city: placeName('City'),
  state: placeName('State'),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode.'),
  country: indiaOnly,
  isDefault: z.boolean().default(false),
});

const addressUpdateSchema = addressSchema.partial();

module.exports = { addressSchema, addressUpdateSchema };
