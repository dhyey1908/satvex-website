const { z } = require('zod');

const heroBannerSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['image', 'video']),
  mediaUrl: z.string().trim().url(),
  link: z.string().trim().max(300).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

const updateSettingsSchema = z.object({
  contactPhone: z.string().trim().max(20).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  instagramUrl: z.string().trim().url().optional().or(z.literal('')),
  brandName: z.string().trim().max(60).optional(),
  logoUrl: z.string().trim().url().optional().or(z.literal('')),
  heroBanners: z.array(heroBannerSchema).max(10).optional(),
});

module.exports = { updateSettingsSchema };
