const reviewService = require('../services/reviewService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const userService = require('../services/userService');
const { createReviewSchema } = require('../validators/reviewValidators');
const AppError = require('../utils/AppError');
const { reviewsQuerySchema, queryReviews } = require('../services/adminListQueries');
const { ok, created } = require('../utils/response');

async function listForProduct(req, res) {
  const reviews = await reviewService.listForProduct(req.params.id);
  ok(res, { reviews });
}

async function getMine(req, res) {
  const review = await reviewService.findForUser(req.params.id, req.user.id);
  ok(res, { review });
}

async function listMine(req, res) {
  const reviews = await reviewService.listForUserAcrossProducts(req.user.id);
  ok(res, { reviews });
}

async function create(req, res) {
  const product = await productService.findById(req.params.id);
  if (!product) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }

  const delivered = await orderService.hasUserReceivedDeliveredProduct(req.user.id, req.params.id);
  if (!delivered) {
    throw new AppError('You can review this product after it has been delivered.', 403, 'NOT_ELIGIBLE');
  }

  const alreadyReviewed = await reviewService.hasReviewed(req.params.id, req.user.id);
  if (alreadyReviewed) {
    throw new AppError('You have already reviewed this product.', 409, 'ALREADY_REVIEWED');
  }

  const data = createReviewSchema.parse(req.body);
  const user = await userService.findById(req.user.id);
  const review = await reviewService.create({
    productId: req.params.id,
    userId: req.user.id,
    userName: user?.name || 'Satvex Customer',
    ...data,
  });
  created(res, { review });
}

async function update(req, res) {
  const existing = await reviewService.findForUser(req.params.id, req.user.id);
  if (!existing) {
    throw new AppError('Review not found.', 404, 'NOT_FOUND');
  }

  const data = createReviewSchema.parse(req.body);
  const review = await reviewService.update(existing.reviewId, data);
  ok(res, { review });
}

async function adminList(req, res) {
  const query = reviewsQuerySchema.parse(req.query);
  const { items, pagination } = queryReviews(await reviewService.listAllForAdmin(), query);
  ok(res, { reviews: items, pagination });
}

async function adminRemove(req, res) {
  await reviewService.remove(req.params.id);
  ok(res, { deleted: true });
}

module.exports = { listForProduct, getMine, listMine, create, update, adminList, adminRemove };
