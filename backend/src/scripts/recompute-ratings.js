/*
 * Recomputes every product's stored rating/reviewCount from the reviews the
 * storefront is allowed to show (verified purchases only, unless
 * settings.reviews.showUnverified is true). Run once after deploying the
 * verified-reviews change so the product header matches the review list.
 * Usage: npm run recompute-ratings          (uses .env + your AWS profile)
 * Writes only rating/reviewCount on product rows; reviews are never touched.
 */
const productService = require('../services/productService');
const reviewService = require('../services/reviewService');

async function main() {
  const products = await productService.listProducts({ onlyActive: false });
  for (const p of products) {
    await reviewService.recomputeProductAggregate(p.productId);
    console.log(`recomputed ${p.slug}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
