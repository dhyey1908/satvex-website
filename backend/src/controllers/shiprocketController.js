const orderService = require('../services/orderService');
const gokwikService = require('../services/gokwikService');
const env = require('../config/env');
const logger = require('../utils/logger');
const { ok } = require('../utils/response');

// Public endpoint — Shiprocket calls this server-to-server. Per
// shiprocket_integration_notes.md, the only auth option is an optional
// security token sent as x-api-key (not mandatory — we may not have one
// configured yet, so this only checks it when webhookToken is actually set).
async function webhook(req, res) {
  if (env.shiprocket.webhookToken && req.headers['x-api-key'] !== env.shiprocket.webhookToken) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid webhook token.' } });
  }

  const body = req.body || {};
  const shiprocketOrderId = body.sr_order_id;
  if (!shiprocketOrderId) return ok(res, { received: true });

  const order = await orderService.findByShiprocketOrderId(shiprocketOrderId);
  if (!order) return ok(res, { received: true }); // stale/forged event for an order we don't have

  await orderService.recordShipmentTracking(order.orderId, {
    shipmentStatus: body.shipment_status || body.current_status,
    courierName: body.courier_name,
    currentStatus: body.current_status,
  });

  // Forward to GoKwik's order/update, best-effort, only for orders that
  // actually went through GoKwik — see gokwik_integration_notes.md's
  // documented status list. Never blocks acking Shiprocket's webhook.
  if (order.paymentProvider === 'gokwik') {
    const GOKWIK_STATUS_MAP = {
      'IN TRANSIT': 'in-transit',
      DELIVERED: 'delivered',
      RTO: 'rto',
      CANCELLED: 'cancelled',
    };
    const mapped = GOKWIK_STATUS_MAP[body.current_status];
    if (mapped) {
      gokwikService
        .updateOrder({
          orderId: order.orderId,
          gokwikOid: order.gokwikOid,
          status: mapped,
          awbNumber: body.awb,
          shippingProvider: body.courier_name,
        })
        .catch((err) => logger.error('gokwik order/update failed (from shiprocket webhook)', { orderId: order.orderId, message: err.message }));
    }
  }

  ok(res, { received: true });
}

module.exports = { webhook };
