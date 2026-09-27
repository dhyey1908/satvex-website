const customerService = require('../services/customerService');
const settingsService = require('../services/settingsService');
const { updateSettingsSchema } = require('../validators/settingsValidators');
const { ok } = require('../utils/response');

async function dashboard(req, res) {
  const stats = await customerService.getDashboardStats();
  ok(res, { stats });
}

async function listCustomers(req, res) {
  const customers = await customerService.listCustomersWithOrderCounts();
  ok(res, { customers });
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

module.exports = { dashboard, listCustomers, getSettings, updateSettings };
