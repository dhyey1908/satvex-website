const settingsService = require('./settingsService');
const orderService = require('./orderService');
const emailService = require('./emailService');
const logger = require('../utils/logger');

// Emails the ADMIN about order events. Customers are never emailed (the store
// only collects a mobile number). Everything here is best-effort: a missing
// inbox, a broken mailbox or a deleted order must never fail the checkout,
// payment callback or cancellation that triggered it.
//
// Recipient: Settings -> notifications.shipmentAlertEmail (the team inbox for
// automatic alerts), falling back to the contact email.
async function adminInbox() {
  const settings = await settingsService.getSettings();
  return settings.notifications?.shipmentAlertEmail || settings.contactEmail || null;
}

async function notify(orderOrId, event, reason) {
  try {
    const order = typeof orderOrId === 'string' ? await orderService.findById(orderOrId) : orderOrId;
    if (!order) return;
    await emailService.sendAdminOrderEmail({ toEmail: await adminInbox(), order, event, reason });
  } catch (err) {
    logger.error('admin notification failed (non-fatal)', { event, message: err.message });
  }
}

module.exports = {
  codOrderPlaced: (order) => notify(order, 'placed'),
  onlineOrderPaid: (orderId, { late = false } = {}) => notify(orderId, late ? 'paid_late' : 'paid'),
  orderCancelled: (order) => notify(order, 'cancelled'),
  needsReview: (orderId, reason) => notify(orderId, 'needs_review', reason),
};
