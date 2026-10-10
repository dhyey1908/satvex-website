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

// Dynamic, Shiprocket-rate-based shipping (replaces the old flat
// charge/threshold pair). See pricingService.js / shippingRateService.js.
const shippingSettingsSchema = z.object({
  // Added to every real Shiprocket quote, flat Rs.
  handlingMargin: z.number().min(0).default(0),
  // Floor/ceiling applied after the margin, before rounding. null = no cap.
  minCharge: z.number().min(0).default(0),
  maxCharge: z.number().min(0).nullable().default(null),
  // Final charge is rounded to the nearest multiple of this.
  roundTo: z.union([z.literal(1), z.literal(5)]).default(1),
  // Used whenever a real quote can't be obtained: Shiprocket not connected,
  // pincode unserviceable, request times out, or the API errors.
  fallbackFlatCharge: z.number().min(0).default(59),
  // Free shipping when (taxable amount + GST, after coupon, before shipping
  // and COD fee) is at or above this. Admin-editable, Rs.
  freeThreshold: z.number().min(0).default(700),
  // TODO(confirm): whether Shiprocket's freight_charge already includes
  // GST — not stated anywhere in available docs. Default false (we add
  // settings.tax.percent on top) until a real response is checked via
  // scripts/shiprocket-sample-rate.js, then this can be flipped with no
  // code change.
  rateIncludesGst: z.boolean().default(false),
  // TODO(confirm): whether the cod=1 quote already includes Shiprocket's
  // own COD handling charge (would mean our flat COD fee double-charges
  // it). Default false — treat the quote as freight-only, our flat COD fee
  // always applies, until a real response is checked.
  rateIncludesCodCharge: z.boolean().default(false),
  // 'lowest_rate' | 'fastest' — 'best rated' is NOT implemented: the real
  // serviceability response (per shiprocket_integration_notes.md) has no
  // rating/score field, only courier_name/cutoff_time/etd/freight_charge/
  // is_surface/rto_charges.
  courierSelectionRule: z.enum(['lowest_rate', 'fastest']).default('lowest_rate'),
});

const codSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  charge: z.number().min(0).default(59),
  // Optional discount for choosing Online/prepaid instead of COD. Applied to
  // (taxable amount + GST), never to shipping/COD fee. Default 0 = off.
  prepaidDiscountType: z.enum(['none', 'percentage', 'flat']).default('none'),
  prepaidDiscountValue: z.number().min(0).default(0),
});

// Not real/measured per-product data — the catalog has no weight/dimensions
// at all, and the whole store ships under 500g (max 3 combos/order per the
// brief), so one fixed default package is used for every shipment.
const shiprocketDefaultPackageSchema = z.object({
  lengthCm: z.number().positive().default(10),
  breadthCm: z.number().positive().default(10),
  heightCm: z.number().positive().default(5),
  weightKg: z.number().positive().max(0.5).default(0.3),
});

const shiprocketSettingsSchema = z.object({
  // Stays false until a real Shiprocket account is connected — while false,
  // shippingRateService never attempts a rate-quote call (fallbackFlatCharge
  // is used instead) and shipmentService never attempts to book a real
  // shipment. OFF by default per the rollout rule — do not turn on.
  enabled: z.boolean().default(false),
  // Rajkot pickup pincode, used as the 'from' side of every rate quote.
  pickupPincode: z.string().trim().regex(/^[0-9]{6}$/).optional().or(z.literal('')),
  // Must exactly match a pickup location nickname already created in the
  // Shiprocket panel (Settings > Pickup Addresses) — Shiprocket's order/
  // create endpoint rejects one that doesn't exist. Different from
  // pickupPincode above (that's for the rate-quote endpoint, which takes a
  // raw postcode, not a nickname).
  pickupLocation: z.string().trim().default(''),
  defaultPackage: shiprocketDefaultPackageSchema.default({}),
});

const paymentsSettingsSchema = z.object({
  onlineEnabled: z.boolean().default(false),
  onlineTestUserIds: z.array(z.string().trim().min(1)).max(50).default([]),
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
