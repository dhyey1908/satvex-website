const env = require('../config/env');
const realGokwikService = require('./gokwikService');
const mockGokwikService = require('./mockGokwikService');

// Single switch point between the real GoKwik sandbox client and the
// network-free mock — every caller (orderController, gokwikController)
// requires this file instead of gokwikService.js directly, so the mode
// switch is invisible to them. env.gokwik.mode defaults to 'live'.
function activeProvider() {
  return env.gokwik.mode === 'mock' ? mockGokwikService : realGokwikService;
}

module.exports = {
  createOrder: (...args) => activeProvider().createOrder(...args),
  verifyPayment: (...args) => activeProvider().verifyPayment(...args),
  updateOrder: (...args) => activeProvider().updateOrder(...args),
  // Pure/no network in both implementations — always the real one, fine to
  // call directly regardless of mode.
  verifyWebhookHeaders: (...args) => realGokwikService.verifyWebhookHeaders(...args),
  assertValidOrderTotal: (...args) => realGokwikService.assertValidOrderTotal(...args),
};
