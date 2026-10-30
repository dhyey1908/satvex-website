/*
 * Adds the starter "Proof Stats" content (FLEX / GRIP / SOFT / LIGHT) to the Butterfly claw clip,
 * SWITCHED OFF so nothing shows until you review it in Admin > Products > Edit and turn it on.
 * Leaves a product alone if it already has a proofSection.
 *
 * Usage: node src/scripts/seed-proof-section.js            (dry run - shows what it would do)
 *        node src/scripts/seed-proof-section.js --apply    (writes to the product)
 *        add --slug=<product-slug> to use another product (default: butterfly-claw-clip)
 * It is a single product write: it only sets proofSection.
 */
const { v4: uuid } = require('uuid');
const productService = require('../services/productService');
const { proofSectionSchema } = require('../validators/proofSectionValidators');
const { STARTER_PROOF_SECTION } = require('../utils/proofSection');

async function main() {
  const apply = process.argv.includes('--apply');
  const slug = (process.argv.find((a) => a.startsWith('--slug=')) || '--slug=butterfly-claw-clip').slice(7);

  const product = await productService.findBySlug(slug);
  if (!product) throw new Error(`No product with slug "${slug}".`);
  if (product.proofSection) {
    console.log(`${slug} already has a Proof Stats section - left alone.`);
    return;
  }

  const section = proofSectionSchema.parse({ ...STARTER_PROOF_SECTION, enabled: false });
  section.stats = section.stats.map((s) => ({ ...s, id: `stat_${uuid()}` }));

  console.log(`${slug}: would add ${section.stats.length} boxes (${section.stats.map((s) => s.value).join(', ')}), switched OFF.`);
  if (!apply) {
    console.log('Dry run - nothing written. Add --apply to save it.');
    return;
  }
  await productService.updateProduct(product.productId, { proofSection: section });
  console.log('Saved. Review it in Admin > Products > Edit, then switch it on.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
