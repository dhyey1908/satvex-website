const customerService = require('../services/customerService');
const settingsService = require('../services/settingsService');
const financialAnalyticsService = require('../services/financialAnalyticsService');
const { updateSettingsSchema } = require('../validators/settingsValidators');
const { financialAnalyticsQuerySchema } = require('../validators/analyticsValidators');
const { customersQuerySchema, queryCustomers } = require('../services/adminListQueries');
const { ok } = require('../utils/response');

async function dashboard(req, res) {
  const stats = await customerService.getDashboardStats();
  ok(res, { stats });
}

async function listCustomers(req, res) {
  const query = customersQuerySchema.parse(req.query);
  const rows = await customerService.listCustomersWithOrderCounts();
  const { items, pagination } = queryCustomers(rows, query);
  ok(res, { customers: items, pagination });
}

async function getSettings(req, res) {
  const settings = await settingsService.getSettings();
  ok(res, { settings });
}

async function updateSettings(req, res) {
  const data = updateSettingsSchema.parse(req.body);
  const settings = await settingsService.updateSettings(data);
  ok(res, { settings });
}

// Pricing & Financial Analytics — every figure is computed server-side from
// the real order records (see financialAnalyticsService.js).
async function financialAnalytics(req, res) {
  const filters = financialAnalyticsQuerySchema.parse(req.query);
  const report = await financialAnalyticsService.getFinancialAnalytics(filters);
  ok(res, report);
}

module.exports = { dashboard, listCustomers, getSettings, updateSettings, financialAnalytics };
