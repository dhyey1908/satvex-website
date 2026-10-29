/*
 * Saves the colour-photo model onto products that predate it (the storefront
 * already reads them correctly without this - see utils/productImages.js - so
 * running it is optional housekeeping, not a requirement).
 *
 *   every existing product photo      -> a COMMON photo (same order)
 *   each colour's single variant.image -> that colour's primary photo
 *
 * Usage:  node src/scripts/backfill-product-images.js           (dry run: prints what would change)
 *         node src/scripts/backfill-product-images.js --apply   (writes)
 * Uses .env / your AWS profile; set the TABLE_* variables for production.
 */
const productService = require('../services/productService');
const { normalizeProductImages } = require('../utils/productImages');

async function main() {
  const apply = process.argv.includes('--apply');
  const products = await productService.listProducts({ onlyActive: false });
  let changed = 0;
  for (const p of products) {
    // listProducts already returns the normalised shape; the stored copy is what we compare against.
    const stored = await productService.findById(p.productId);
    const next = normalizeProductImages(stored);
    console.log(`${p.slug}: ${next.commonImages.length} common photo(s); colours: ${next.variants.map((v) => `${v.colorName}=${v.images.length}`).join(', ')}`);
    if (!apply) continue;
    await productService.updateProduct(p.productId, { commonImages: next.commonImages, images: next.images, variants: next.variants });
    changed += 1;
  }
  console.log(apply ? `Updated ${changed} product(s).` : 'Dry run - nothing written. Add --apply to save.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
