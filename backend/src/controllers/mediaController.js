const s3Service = require('../services/s3Service');
const { uploadUrlSchema, reviewUploadUrlSchema } = require('../validators/mediaValidators');
const { ok } = require('../utils/response');

async function getUploadUrl(req, res) {
  const input = uploadUrlSchema.parse(req.body);
  const result = await s3Service.createUploadUrl(input);
  ok(res, result);
}

// Customer-facing — any logged-in customer can call this (see reviewRoutes.js),
// unlike getUploadUrl above which is admin-only. folder is hardcoded here,
// never taken from the request.
async function getReviewUploadUrl(req, res) {
  const { filename, contentType } = reviewUploadUrlSchema.parse(req.body);
  const result = await s3Service.createUploadUrl({ folder: 'reviews', filename, contentType });
  ok(res, result);
}

module.exports = { getUploadUrl, getReviewUploadUrl };
