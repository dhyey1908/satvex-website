const deliveryEligibilityService = require('../services/deliveryEligibilityService');
const deliveryCheckService = require('../services/deliveryCheckService');
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

// GET /api/delivery/check?pincode= - can a courier reach this pincode, by when, and can it be Cash on Delivery?
// (Shiprocket, cached 24h per pincode.) Shared by checkout and the product page's pincode box. Checkout asks the
// same service again when the order is placed, so what this says is a courtesy, not the enforcement.
async function deliveryCheck(req, res) {
  const { pincode } = pincodeCheckSchema.parse(req.query);
  const result = await deliveryCheckService.checkPincode(pincode);
  ok(res, {
    pincode,
    status: result.status,
    deliverable: result.status === 'no_courier' ? false : result.status === 'ok' ? true : null,
    cod: result.status === 'ok' ? result.cod : null,
    deliveryBy: result.deliveryBy || null,
  });
}

module.exports = { checkPincode, deliveryCheck };
