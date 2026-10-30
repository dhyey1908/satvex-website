/*
 * Adds the starter "Feature Hotspots" content (flexible body / rounded teeth / strong spring /
 * feather-light) to a product, SWITCHED OFF and with no marker positions: the owner places the
 * markers on the real photo in Admin > Products > Edit > Feature Hotspots, then switches it on.
 * Leaves a product alone if it already has a hotspotSection.
 *
 * Usage: node src/scripts/seed-hotspots.js --slug=<product-slug>           (dry run - shows what it would do)
 *        node src/scripts/seed-hotspots.js --slug=<product-slug> --apply   (writes to the product)
 * It is a single product write: it only sets hotspotSection.
 */
const { v4: uuid } = require('uuid');
const productService = require('../services/productService');
const { hotspotSectionSchema } = require('../validators/hotspotValidators');
const { STARTER_HOTSPOT_SECTION } = require('../utils/hotspots');

async function main() {
  const apply = process.argv.includes('--apply');
  const slugArg = process.argv.find((a) => a.startsWith('--slug='));
  if (!slugArg) throw new Error('Say which product: --slug=<product-slug>');
  const slug = slugArg.slice(7);

  const product = await productService.findBySlug(slug);
  if (!product) throw new Error(`No product with slug "${slug}".`);
  if (product.hotspotSection) {
    console.log(`${slug} already has a Feature Hotspots section - left alone.`);
    return;
  }

  const section = hotspotSectionSchema.parse({ ...STARTER_HOTSPOT_SECTION, enabled: false });
  section.hotspots = section.hotspots.map((h) => ({ ...h, id: `hs_${uuid()}` }));

  console.log(`${slug}: would add ${section.hotspots.length} features (${section.hotspots.map((h) => h.title).join(', ')}), switched OFF, markers not placed.`);
  if (!apply) {
    console.log('Dry run - nothing written. Add --apply to save it.');
    return;
  }
  await productService.updateProduct(product.productId, { hotspotSection: section });
  console.log('Saved. Upload the main photo and place the markers in Admin > Products > Edit, then switch it on.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
