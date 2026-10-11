/*
 * One-off script — not part of the deployed app. Minimal real-pipeline
 * test: creates ONE real Shiprocket order from a real site order's data,
 * then immediately cancels it. Deliberately does NOT call assignAwb or
 * schedulePickup — no courier is ever assigned, no pickup is ever
 * requested. Does not touch our own order record (no
 * orderService.recordShiprocketOrderCreated call) since the Shiprocket
 * order is cancelled right after anyway.
 *
 *   TABLE_ORDERS=satvex_orders_dev TABLE_SETTINGS=satvex_settings_dev AWS_PROFILE=satvex node src/scripts/test-create-cancel-order.js <orderId>
 */
require('dotenv').config();
const orderService = require('../services/orderService');
const settingsService = require('../services/settingsService');
const shiprocketService = require('../services/shiprocketService');

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: node src/scripts/test-create-cancel-order.js <orderId>');
    process.exit(1);
  }

  const settings = await settingsService.getSettings();
  const order = await orderService.findById(orderId);
  if (!order) {
    console.error('Order not found:', orderId);
    process.exit(1);
  }

  const { lengthCm, breadthCm, heightCm, weightKg } = settings.shiprocket.defaultPackage || {};
  const [firstName, ...rest] = (order.customer?.name || '').trim().split(' ');

  console.log('Creating real Shiprocket order (no AWB, no pickup)...');
  const created = await shiprocketService.createOrder({
    orderId: order.orderId,
    orderDate: order.createdAt.slice(0, 10),
    pickupLocation: settings.shiprocket.pickupLocation,
    billingFirstName: firstName || order.customer?.name || 'Customer',
    billingLastName: rest.join(' '),
    billingAddress: order.address?.line1,
    billingCity: order.address?.city,
    billingPincode: Number(order.address?.pincode),
    billingState: order.address?.state,
    billingCountry: order.address?.country || 'India',
    billingEmail: order.customer?.email,
    billingPhone: Number(order.customer?.phone),
    orderItems: (order.items || []).map((item) => ({
      name: item.productName,
      sku: item.productId,
      units: item.quantity,
      sellingPrice: item.unitPrice,
    })),
    paymentMethod: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
    subTotal: order.subtotal,
    length: lengthCm,
    breadth: breadthCm,
    height: heightCm,
    weight: weightKg,
  });
  console.log('Created. Shiprocket order_id:', created.order_id);

  console.log('Cancelling it immediately (no AWB/pickup was ever requested)...');
  const cancelResult = await shiprocketService.cancelOrder({ shiprocketOrderId: created.order_id });
  console.log('Cancel response:', JSON.stringify(cancelResult, null, 2));
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
