const { z } = require('zod');

const heroBannerSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['image', 'video']),
  mediaUrl: z.string().trim().url(),
  link: z.string().trim().max(300).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

const pillarSchema = z.object({
  title: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(200),
});

const taxSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  percent: z.number().min(0).max(100).default(18),
});

const shippingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  charge: z.number().min(0).default(50),
  // 0/undefined means "no free-shipping threshold" — shipping always charges.
  freeThreshold: z.number().min(0).optional(),
});

const codSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  charge: z.number().min(0).default(40),
});

const updateSettingsSchema = z.object({
  contactPhone: z.string().trim().max(20).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  instagramUrl: z.string().trim().url().optional().or(z.literal('')),
  brandName: z.string().trim().max(60).optional(),
  logoUrl: z.string().trim().url().optional().or(z.literal('')),
  heroBanners: z.array(heroBannerSchema).max(10).optional(),
  authImage: z.string().trim().url().optional().or(z.literal('')),
  aboutImage: z.string().trim().url().optional().or(z.literal('')),
  whyPillars: z.array(pillarSchema).length(4).optional(),
  tax: taxSettingsSchema.optional(),
  shipping: shippingSettingsSchema.optional(),
  cod: codSettingsSchema.optional(),
});

module.exports = { updateSettingsSchema };
