const { z } = require('zod');

const uploadUrlSchema = z.object({
  folder: z.enum(['products', 'variants', 'videos', 'branding', 'banners']),
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4']),
});

// Customer-facing (review images) — deliberately narrower than the admin
// schema above: folder is fixed to 'reviews' server-side (never taken from
// the client, so a customer can never write into 'products'/'banners'/
// etc.), and only image types are allowed (no video).
const reviewUploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
});

module.exports = { uploadUrlSchema, reviewUploadUrlSchema };
