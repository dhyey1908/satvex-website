const s3Service = require('../services/s3Service');
const { uploadUrlSchema } = require('../validators/mediaValidators');
const { ok } = require('../utils/response');

async function getUploadUrl(req, res) {
  const input = uploadUrlSchema.parse(req.body);
  const result = await s3Service.createUploadUrl(input);
  ok(res, result);
}

module.exports = { getUploadUrl };
