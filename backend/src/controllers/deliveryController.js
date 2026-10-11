const deliveryEligibilityService = require('../services/deliveryEligibilityService');
const { pincodeCheckSchema } = require('../validators/deliveryValidators');
const { ok } = require('../utils/response');

// Public, read-only check used by the PDP's PincodeCheck widget to show an
// accurate "not deliverable in your state" message up front -- the actual
// enforcement still happens again, independently, at quote/checkout time
// (pricingService.calculateTotals), so this endpoint is purely informational
// and never the only thing standing between a customer and placing an order
// to a disabled state.
async function checkPincode(req, res) {
  const { pincode } = pincodeCheckSchema.parse(req.body);
  const result = await deliveryEligibilityService.isDeliverable(pincode);
  ok(res, result);
}

module.exports = { checkPincode };
