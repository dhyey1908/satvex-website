const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const { scanAll } = require('../utils/listQuery');
const { buildCustomerRows } = require('./adminListQueries');

const USERS_TABLE = env.tables.users;
const ORDERS_TABLE = env.tables.orders;

// Customer/order volume is expected to stay modest for this store; a Scan here
// keeps the admin views simple without maintaining extra indexes.
// One row per customer with their order count and total spend (see
// buildCustomerRows for what counts as spent). Search/sort/pagination run on
// top of this in the controller, over every customer.
async function listCustomersWithOrderCounts() {
  const [users, orders] = await Promise.all([
    scanAll(docClient, USERS_TABLE),
    scanAll(docClient, ORDERS_TABLE),
  ]);
  return buildCustomerRows(users, orders);
}

async function getDashboardStats() {
  const [usersResult, ordersResult, productsResult] = await Promise.all([
    docClient.send(new ScanCommand({ TableName: USERS_TABLE })),
    docClient.send(new ScanCommand({ TableName: ORDERS_TABLE })),
    docClient.send(new ScanCommand({ TableName: env.tables.products })),
  ]);

  const users = (usersResult.Items || []).filter((u) => u.role !== 'admin');
  const orders = ordersResult.Items || [];
  const products = productsResult.Items || [];

  const pendingStatuses = new Set(['Pending', 'Confirmed', 'Processing', 'Shipped']);
  const completedStatuses = new Set(['Delivered']);

  return {
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.isActive).length,
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => pendingStatuses.has(o.status)).length,
    completedOrders: orders.filter((o) => completedStatuses.has(o.status)).length,
    totalCustomers: users.length,
  };
}

module.exports = { listCustomersWithOrderCounts, getDashboardStats };
