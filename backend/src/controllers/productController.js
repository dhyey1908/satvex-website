const { v4: uuid } = require('uuid');
const productService = require('../services/productService');
const { productSchema, productUpdateSchema } = require('../validators/productValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');
const { productForViewer } = require('../utils/productVisibility');
const offerService = require('../services/offerService');
const settingsService = require('../services/settingsService');
const { checkPrices } = require('../services/priceGuardService');
const { productsQuerySchema, queryProducts } = require('../services/adminListQueries');

function assignIdsIfMissing(list, prefix) {
  return (list || []).map((item) => ({ ...item, id: item.id || `${prefix}_${uuid()}` }));
}

const forViewer = productForViewer;

// Customers get the display-only offer figures; admins get the raw product so
// the product form can save it back unchanged.
async function forResponse(product, isAdmin) {
  if (isAdmin) return forViewer(product, true);
  const [decorated] = await offerService.decorateProducts([forViewer(product, false)]);
  return decorated;
}

async function list(req, res) {
  const isAdmin = req.user?.role === 'admin';
  const products = await productService.listProducts({ onlyActive: !isAdmin });
  const visible = products.map((p) => forViewer(p, isAdmin));
  ok(res, { products: isAdmin ? visible : await offerService.decorateProducts(visible) });
}

// Admin catalogue: search/filter/sort/pagination over every product (active
// or not), with each row's listed price, best discount and stock status
// worked out here so the screen only displays them.
async function adminList(req, res) {
  const query = productsQuerySchema.parse(req.query);
  const products = await productService.listProducts({ onlyActive: false });
  const { items, pagination, facets } = queryProducts(products, query);
  ok(res, { products: items.map((p) => forViewer(p, true)), pagination, facets });
}

async function getById(req, res) {
  const isAdmin = req.user?.role === 'admin';
  const product = await productService.findById(req.params.id);
  if (!product || (!product.isActive && !isAdmin)) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }
  ok(res, { product: await forResponse(product, isAdmin) });
}

async function getBySlug(req, res) {
  const isAdmin = req.user?.role === 'admin';
  const product = await productService.findBySlug(req.params.slug);
  if (!product || (!product.isActive && !isAdmin)) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }
  ok(res, { product: await forResponse(product, isAdmin) });
}

// Price guardrails: a price below the configured minimum, or more than the allowed
// % under the MRP, is not saved until the admin explicitly confirms it (the
// browser re-sends the same request with confirmPriceWarnings: true). Enforced
// here, so it cannot be skipped by calling the API directly.
async function assertPricesConfirmed(req, sellingOptions, previous) {
  if (!sellingOptions || req.body?.confirmPriceWarnings === true) return;
  const settings = await settingsService.getSettings();
  const warnings = checkPrices(sellingOptions, previous, settings.pricing);
  if (warnings.length > 0) {
    throw new AppError('Please confirm these prices before saving.', 409, 'PRICE_CONFIRMATION_REQUIRED', { warnings });
  }
}

async function create(req, res) {
  const data = productSchema.parse(req.body);
  data.variants = assignIdsIfMissing(data.variants, 'var');
  data.sellingOptions = assignIdsIfMissing(data.sellingOptions, 'opt');
  data.testimonialVideos = assignIdsIfMissing(data.testimonialVideos, 'vid');
  await assertPricesConfirmed(req, data.sellingOptions, []);
  const product = await productService.createProduct(data);
  created(res, { product });
}

async function update(req, res) {
  const data = productUpdateSchema.parse(req.body);
  if (data.variants) data.variants = assignIdsIfMissing(data.variants, 'var');
  if (data.sellingOptions) data.sellingOptions = assignIdsIfMissing(data.sellingOptions, 'opt');
  if (data.testimonialVideos) data.testimonialVideos = assignIdsIfMissing(data.testimonialVideos, 'vid');
  if (data.sellingOptions) {
    const existing = await productService.findById(req.params.id);
    await assertPricesConfirmed(req, data.sellingOptions, existing?.sellingOptions || []);
  }
  const product = await productService.updateProduct(req.params.id, data);
  ok(res, { product });
}

async function remove(req, res) {
  await productService.deleteProduct(req.params.id);
  ok(res, { deleted: true });
}

module.exports = { list, adminList, getById, getBySlug, create, update, remove };
