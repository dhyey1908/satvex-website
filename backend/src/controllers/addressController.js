const addressService = require('../services/addressService');
const { addressSchema, addressUpdateSchema } = require('../validators/addressValidators');
const { ok, created } = require('../utils/response');

async function list(req, res) {
  const addresses = await addressService.listForUser(req.user.id);
  ok(res, { addresses });
}

async function create(req, res) {
  const data = addressSchema.parse(req.body);
  const address = await addressService.create(req.user.id, data);
  created(res, { address });
}

async function update(req, res) {
  const data = addressUpdateSchema.parse(req.body);
  const address = await addressService.update(req.user.id, req.params.id, data);
  ok(res, { address });
}

async function remove(req, res) {
  await addressService.remove(req.user.id, req.params.id);
  ok(res, { deleted: true });
}

module.exports = { list, create, update, remove };
