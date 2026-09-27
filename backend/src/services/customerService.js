const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const USERS_TABLE = env.tables.users;
const ORDERS_TABLE = env.tables.orders;

// Customer/order volume is expected to stay modest for this store; a Scan here
// keeps the admin views simple without maintaining extra indexes.
async function listCustomersWithOrderCounts() {
  const [usersResult, ordersResult] = await Promise.all([
    docClient.send(new ScanCommand({ TableName: USERS_TABLE })),
    docClient.send(new ScanCommand({ TableName: ORDERS_TABLE })),
  ]);

  const orderCountByUser = {};
  for (const order of ordersResult.Items || []) {
    orderCountByUser[order.userId] = (orderCountByUser[order.userId] || 0) + 1;
  }

  return (usersResult.Items || [])
    .filter((user) => user.role !== 'admin')
    .map((user) => ({
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      createdAt: user.createdAt,
      orderCount: orderCountByUser[user.userId] || 0,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
