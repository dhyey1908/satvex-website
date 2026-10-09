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

// Store-wide, subtotal-based shipping tiers (not per-product). A tier applies
// when subtotal is in [minSubtotal, maxSubtotal] inclusive; maxSubtotal: null
// means "and above" (the open-ended top tier). Tiers are evaluated in order
// and the first match wins, so they should be listed low-to-high with no gaps.
const shippingTierSchema = z.object({
  minSubtotal: z.number().min(0),
  maxSubtotal: z.number().min(0).nullable(),
  charge: z.number().min(0),
});

const shippingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  tiers: z
    .array(shippingTierSchema)
    .min(1)
    .default([
      { minSubtotal: 0, maxSubtotal: 399.99, charge: 59 },
      { minSubtotal: 400, maxSubtotal: 599.99, charge: 39 },
      { minSubtotal: 600, maxSubtotal: null, charge: 0 },
    ]),
});

const codSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  charge: z.number().min(0).default(59),
});

// Not real/measured per-product data — our catalog has no weight/dimensions
// at all, so this is a single default package used for every shipment until
// (if ever) the product model grows real per-product physical dimensions.
const shiprocketDefaultPackageSchema = z.object({
  lengthCm: z.number().positive().default(10),
  breadthCm: z.number().positive().default(10),
  heightCm: z.number().positive().default(5),
  weightKg: z.number().positive().default(0.2),
});

const shiprocketSettingsSchema = z.object({
  // Real account, no sandbox — stays false until manually verified end-to-end.
  enabled: z.boolean().default(false),
  // Must exactly match a pickup location nickname already created in the
  // Shiprocket panel (Settings > Pickup Addresses) — Shiprocket's API
  // rejects an order referencing one that doesn't exist.
  pickupLocation: z.string().trim().default(''),
  defaultPackage: shiprocketDefaultPackageSchema.default({}),
});

const paymentsSettingsSchema = z.object({
  onlineEnabled: z.boolean().default(false),
  onlineTestUserIds: z.array(z.string().trim().min(1)).max(50).default([]),
  // SANDBOX ONLY — mirrors onlineEnabled/onlineTestUserIds exactly. Must stay
  // false in production settings until GoKwik confirms the open questions in
  // gokwik_integration_notes.md (see 18-payment-gateway.md's GoKwik section).
  gokwikEnabled: z.boolean().default(false),
  gokwikTestUserIds: z.array(z.string().trim().min(1)).max(50).default([]),
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
  payments: paymentsSettingsSchema.optional(),
  shiprocket: shiprocketSettingsSchema.optional(),
});

module.exports = { updateSettingsSchema };
