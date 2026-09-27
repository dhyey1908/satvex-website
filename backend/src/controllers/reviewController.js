const reviewService = require('../services/reviewService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const userService = require('../services/userService');
const { createReviewSchema, moderateReviewSchema } = require('../validators/reviewValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');

async function listForProduct(req, res) {
  const reviews = await reviewService.listForProduct(req.params.id, { onlyApproved: true });
  ok(res, { reviews });
}

async function create(req, res) {
  const product = await productService.findById(req.params.id);
  if (!product) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }

  const purchased = await orderService.hasUserPurchasedProduct(req.user.id, req.params.id);
  if (!purchased) {
    throw new AppError('You can review this product after purchasing it.', 403, 'NOT_ELIGIBLE');
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

async function adminList(req, res) {
  const { status } = req.query;
  const reviews = await reviewService.listAllForAdmin({ status });
  ok(res, { reviews });
}

async function adminModerate(req, res) {
  const { status } = moderateReviewSchema.parse(req.body);
  const review = await reviewService.setStatus(req.params.id, status);
  if (!review) {
    throw new AppError('Review not found.', 404, 'NOT_FOUND');
  }
  ok(res, { review });
}

async function adminRemove(req, res) {
  await reviewService.remove(req.params.id);
  ok(res, { deleted: true });
}

module.exports = { listForProduct, create, adminList, adminModerate, adminRemove };
