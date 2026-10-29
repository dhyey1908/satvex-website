const { z } = require('zod');

// One photo of a colour / one common photo. alt text is optional (the storefront
// falls back to "SATVEX <product> - <colour>").
const photoUrl = z.string().trim().url().refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL.');
const imageSchema = z.object({
  url: photoUrl,
  alt: z.string().trim().max(160).optional().default(''),
  isPrimary: z.boolean().optional().default(false),
});

const variantSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  colorName: z.string().trim().min(1).max(60),
  colorCode: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color code must be a hex value like #FFAABB'),
  // Empty until a real image is uploaded via the admin panel — the frontend
  // shows a neutral placeholder in the meantime rather than a fake photo.
  image: z.string().trim().default(''),
  // All photos of THIS colour (up to 10), shown only while the colour is selected;
  // exactly one is the primary (swatch / cards / cart). `image` above is kept as the primary's URL.
  images: z.array(imageSchema).max(10, 'Up to 10 photos per colour.').optional(),
  isActive: z.boolean().default(true),
  // Distinct from isActive: isActive controls whether this color is part of
  // the product's lineup at all (hidden entirely when false); inStock
  // controls whether an active color is currently purchasable — an
  // out-of-stock color still shows on the product page (so customers know
  // the shade exists) but can't be selected/added to cart.
  inStock: z.boolean().default(true),
});

const sellingOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  quantity: z.number().int().min(1).max(20),
  price: z.number().min(0),
  // Optional; when set and greater than price, the frontend shows a sale badge.
  compareAtPrice: z.number().min(0).optional(),
  // Internal cost of this pack to the store (COGS) — admin-only, powers the
  // Financial Analytics profit figures. Never shown to customers (see
  // orderController.toCustomerOrder). null/absent = cost unknown.
  costPrice: z.number().min(0).nullable().optional(),
  isActive: z.boolean().default(true),
  allowDuplicateColors: z.boolean().default(false),
});

const MAX_TESTIMONIAL_VIDEOS = 20;

// Only ever rendered as a media src, but still refuse non-http(s) schemes
// (javascript:, data:, file:) so a stored value can never be anything but a
// normal remote asset URL.
const mediaUrl = z
  .string()
  .trim()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL.');

// Customer video testimonials shown in the slider above the reviews. Array
// order IS the display order. The id is assigned server-side for new items
// (see productController.assignIdsIfMissing).
const testimonialVideoSchema = z.object({
  id: z.string().min(1).optional(),
  videoUrl: mediaUrl,
  // Optional poster; without one the storefront shows the video's first frame.
  thumbnailUrl: mediaUrl.optional().or(z.literal('')),
  customerName: z.string().trim().max(60).optional().or(z.literal('')),
  caption: z.string().trim().max(160).optional().or(z.literal('')),
});

const productSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric and hyphen-separated'),
  shortDescription: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  // Optional "How to Wear" / fit content for the PDP — left blank until real
  // copy is written; the frontend hides the accordion item when empty rather
  // than showing filler text.
  howToWear: z.string().trim().max(2000).default('').optional(),
  basePrice: z.number().min(0),
  // Empty until real photos are uploaded via the admin panel.
  images: z.array(z.string().trim().min(1)).default([]),
  // Photos shown for EVERY colour (after the colour's own). `images` above mirrors their URLs.
  commonImages: z.array(imageSchema).max(30, 'Up to 30 common images.').optional(),
  // Which photos the product page lists first: the selected colour's own (default) or the common ones.
  galleryOrder: z.enum(['colour_first', 'common_first']).optional(),
  videoUrl: z.string().trim().url().optional().or(z.literal('')),
  // Computed from published reviews (see reviewService.recomputeProductAggregate) —
  // not admin-editable. Starts at 0 until the product has real reviews.
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().min(0).default(0),
  variants: z.array(variantSchema).min(1, 'At least one color variant is required'),
  sellingOptions: z.array(sellingOptionSchema).min(1, 'At least one selling option is required'),
  testimonialVideos: z
    .array(testimonialVideoSchema)
    .max(MAX_TESTIMONIAL_VIDEOS, `You can add up to ${MAX_TESTIMONIAL_VIDEOS} videos per product.`)
    .default([]),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

const productUpdateSchema = productSchema.partial();

module.exports = {
  productSchema,
  productUpdateSchema,
  variantSchema,
  sellingOptionSchema,
  testimonialVideoSchema,
  MAX_TESTIMONIAL_VIDEOS,
};
