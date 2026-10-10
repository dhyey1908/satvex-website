const orderService = require('../services/orderService');
const env = require('../config/env');
const { ok } = require('../utils/response');

// Public endpoint — Shiprocket calls this server-to-server. Per
// shiprocket_integration_notes.md, the only documented auth option is an
// optional security token sent as x-api-key (no signature scheme is
// documented at all — TODO(confirm) with Shiprocket support before this
// goes anywhere near a real volume of traffic). Only enforced when a token
// is actually configured (SHIPROCKET_WEBHOOK_TOKEN) — while Shiprocket
// isn't connected, settings.shiprocket.enabled stays false regardless, so
// this endpoint doing nothing destructive either way is the real safety
// net, not this check alone.
//
// Idempotency: recordShipmentTracking is a plain SET (last-write-wins), so
// a duplicate/repeated delivery of the exact same event is harmless — it
// just rewrites the same status again. findByShiprocketOrderId uses a GSI
// query (never a Scan), and an order we don't recognize is acked and
// dropped rather than erroring, since Shiprocket retries on non-2xx.
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
    rawPayload: body,
    estimatedDeliveryDate: body.etd || null,
  });

  ok(res, { received: true });
}

module.exports = { webhook };
