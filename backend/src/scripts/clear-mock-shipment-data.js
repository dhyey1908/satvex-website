/*
 * One-off script — not part of the deployed app. Clears the fake
 * "MOCK-SR-..." shiprocketOrderId/awbCode/courierName/shipmentStatus
 * left on a handful of orders from old stub testing, unrelated to the
 * real Shiprocket integration. DB write only — no Shiprocket API call.
 *
 *   TABLE_ORDERS=satvex_orders_prod AWS_PROFILE=satvex node src/scripts/clear-mock-shipment-data.js
 */
require('dotenv').config();
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.orders;

async function main() {
  const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
  const mockOrders = (result.Items || []).filter((o) => String(o.shiprocketOrderId || '').startsWith('MOCK-SR-'));

  console.log(`Found ${mockOrders.length} order(s) with mock Shiprocket data.`);
  for (const order of mockOrders) {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { orderId: order.orderId },
        UpdateExpression:
          'REMOVE shiprocketOrderId, awbCode, courierName, shiprocketShipmentId, labelUrl, invoiceUrl SET shipmentStatus = :notCreated, updatedAt = :now',
        ExpressionAttributeValues: { ':notCreated': 'not_created', ':now': new Date().toISOString() },
      })
    );
    console.log('Cleared:', order.orderId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
