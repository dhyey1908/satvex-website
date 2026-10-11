const AppError = require('../utils/AppError');
const settingsService = require('./settingsService');
const pincodeService = require('./pincodeService');

// Off by default (settings.delivery.enabled = false), same rollout pattern
// as shiprocket.enabled/payments.onlineEnabled elsewhere in this app — so
// shipping existing live checkout behavior with this code deployed never
// blocks anyone until an admin explicitly turns it on. Once turned on,
// delivery.enabledStates is a real allowlist: a state not in it is treated
// as disabled, which is the literal "by default, only enabled states are
// eligible" rule once the feature itself is live.
async function isDeliverable(pincode) {
  const settings = await settingsService.getSettings();
  if (!settings.delivery?.enabled) return { deliverable: true, state: null };

  const state = await pincodeService.lookupState(pincode);
  if (!state) {
    // Couldn't resolve a state for this pincode at all -- never treat an
    // unverifiable address as deliverable just because nothing contradicted it.
    return { deliverable: false, state: null };
  }

  const enabledStates = settings.delivery.enabledStates || [];
  const deliverable = enabledStates.some((s) => s.trim().toLowerCase() === state.trim().toLowerCase());
  return { deliverable, state };
}

// Throws a clear, customer-facing AppError when the given pincode isn't
// currently deliverable. This is the single enforcement point called from
// both the checkout quote preview and the real order-placement path (via
// pricingService.calculateTotals), so neither can be bypassed independently
// by calling one endpoint but not the other, or by changing an unrelated
// address field — eligibility is derived only from the pincode itself.
async function assertDeliverable(pincode) {
  const { deliverable, state } = await isDeliverable(pincode);
  if (!deliverable) {
    throw new AppError(
      state
        ? `Sorry, we don't currently deliver to ${state}. Please check your pincode or use a different address.`
        : "We couldn't verify that pincode for delivery. Please check it and try again.",
      400,
      'PINCODE_NOT_SERVICEABLE'
    );
  }
}

module.exports = { isDeliverable, assertDeliverable };
