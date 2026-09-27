const { z } = require('zod');

const uploadUrlSchema = z.object({
  folder: z.enum(['products', 'variants', 'videos', 'branding', 'banners']),
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4']),
});

module.exports = { uploadUrlSchema };
