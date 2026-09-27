const { z } = require('zod');

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
  isActive: z.boolean().default(true),
});

const sellingOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  quantity: z.number().int().min(1).max(20),
  price: z.number().min(0),
  // Optional; when set and greater than price, the frontend shows a sale badge.
  compareAtPrice: z.number().min(0).optional(),
  isActive: z.boolean().default(true),
  allowDuplicateColors: z.boolean().default(false),
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
  basePrice: z.number().min(0),
  // Empty until real photos are uploaded via the admin panel.
  images: z.array(z.string().trim().min(1)).default([]),
  videoUrl: z.string().trim().url().optional().or(z.literal('')),
  rating: z.number().min(0).max(5).default(4.8),
  reviewCount: z.number().int().min(0).default(0),
  variants: z.array(variantSchema).min(1, 'At least one color variant is required'),
  sellingOptions: z.array(sellingOptionSchema).min(1, 'At least one selling option is required'),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

const productUpdateSchema = productSchema.partial();

module.exports = { productSchema, productUpdateSchema, variantSchema, sellingOptionSchema };
