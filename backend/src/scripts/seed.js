/*
 * Seeds the initial Satvex product: Butterfly, 8 color variants, 3 selling options.
 * Safe to re-run — does nothing if a product with this slug already exists.
 * Usage: npm run seed
 */
const productService = require('../services/productService');

const COLORS = [
  { colorName: 'Pink', colorCode: '#F5A9C6' },
  { colorName: 'Blue', colorCode: '#6FA8DC' },
  { colorName: 'Purple', colorCode: '#B285D1' },
  { colorName: 'Red', colorCode: '#E06666' },
  { colorName: 'Green', colorCode: '#7FBF7F' },
  { colorName: 'Yellow', colorCode: '#F4D35E' },
  { colorName: 'White', colorCode: '#F5F5F5' },
  { colorName: 'Black', colorCode: '#2B2B2B' },
];

async function main() {
  const slug = 'butterfly';
  const existing = await productService.findBySlug(slug);
  if (existing) {
    console.log(`Product "${slug}" already exists (id: ${existing.productId}). Skipping seed.`);
    return;
  }

  const variants = COLORS.map((c, i) => ({
    id: `var_${i + 1}`,
    name: `Butterfly - ${c.colorName}`,
    colorName: c.colorName,
    colorCode: c.colorCode,
    image: '', // upload the real photo for this color via the admin panel
    isActive: true,
  }));

  const sellingOptions = [
    { id: 'opt_single', name: 'Single', quantity: 1, price: 499, isActive: true, allowDuplicateColors: false },
    { id: 'opt_combo2', name: 'Combo of 2', quantity: 2, price: 899, isActive: true, allowDuplicateColors: false },
    { id: 'opt_combo3', name: 'Combo of 3', quantity: 3, price: 1249, isActive: true, allowDuplicateColors: false },
  ];

  const product = await productService.createProduct({
    name: 'Butterfly',
    slug,
    shortDescription: 'A delicate butterfly accessory in 8 signature colors.',
    description:
      'The Satvex Butterfly accessory. Available as a single piece or as a curated combo, in 8 colors.',
    basePrice: 499,
    images: [], // upload real product photos via the admin panel
    videoUrl: '',
    rating: 4.8,
    variants,
    sellingOptions,
    isActive: true,
    isFeatured: true,
  });

  console.log(`Seeded product "${product.name}" (id: ${product.productId}) with ${variants.length} colors and ${sellingOptions.length} selling options.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
