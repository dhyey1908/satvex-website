const env = require('../config/env');
const realShiprocketService = require('./shiprocketService');
const mockShiprocketService = require('./mockShiprocketService');

// Single switch point between the real Shiprocket client and the
// network-free mock — every caller (shipmentService, shiprocketController)
// requires this file instead of shiprocketService.js directly, so the mode
// switch is invisible to them. env.shiprocket.mode defaults to 'live'.
function activeProvider() {
  return env.shiprocket.mode === 'mock' ? mockShiprocketService : realShiprocketService;
}

module.exports = {
  getServiceability: (...args) => activeProvider().getServiceability(...args),
  listPickupAddresses: (...args) => activeProvider().listPickupAddresses(...args),
  createOrder: (...args) => activeProvider().createOrder(...args),
  assignAwb: (...args) => activeProvider().assignAwb(...args),
  schedulePickup: (...args) => activeProvider().schedulePickup(...args),
  generateLabel: (...args) => activeProvider().generateLabel(...args),
  cancelOrder: (...args) => activeProvider().cancelOrder(...args),
  trackByAwb: (...args) => activeProvider().trackByAwb(...args),
};
