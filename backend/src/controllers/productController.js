const { v4: uuid } = require('uuid');
const productService = require('../services/productService');
const { productSchema, productUpdateSchema } = require('../validators/productValidators');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');
const { productForViewer } = require('../utils/productVisibility');
const { productsQuerySchema, queryProducts } = require('../services/adminListQueries');

function assignIdsIfMissing(list, prefix) {
  return (list || []).map((item) => ({ ...item, id: item.id || `${prefix}_${uuid()}` }));
}

const forViewer = productForViewer;

async function list(req, res) {
  const isAdmin = req.user?.role === 'admin';
  const products = await productService.listProducts({ onlyActive: !isAdmin });
  ok(res, { products: products.map((p) => forViewer(p, isAdmin)) });
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
  ok(res, { product: forViewer(product, isAdmin) });
}

async function getBySlug(req, res) {
  const isAdmin = req.user?.role === 'admin';
  const product = await productService.findBySlug(req.params.slug);
  if (!product || (!product.isActive && !isAdmin)) {
    throw new AppError('Product not found.', 404, 'NOT_FOUND');
  }
  ok(res, { product: forViewer(product, isAdmin) });
}

async function create(req, res) {
  const data = productSchema.parse(req.body);
  data.variants = assignIdsIfMissing(data.variants, 'var');
  data.sellingOptions = assignIdsIfMissing(data.sellingOptions, 'opt');
  const product = await productService.createProduct(data);
  created(res, { product });
}

async function update(req, res) {
  const data = productUpdateSchema.parse(req.body);
  if (data.variants) data.variants = assignIdsIfMissing(data.variants, 'var');
  if (data.sellingOptions) data.sellingOptions = assignIdsIfMissing(data.sellingOptions, 'opt');
  const product = await productService.updateProduct(req.params.id, data);
  ok(res, { product });
}

async function remove(req, res) {
  await productService.deleteProduct(req.params.id);
  ok(res, { deleted: true });
}

module.exports = { list, adminList, getById, getBySlug, create, update, remove };
