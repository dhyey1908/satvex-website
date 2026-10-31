const { z } = require('zod');

// "Feature Hotspots": one large product photo with 1-8 numbered points; each slide highlights one
// part of the product (product.hotspotSection). Marker positions are PERCENTAGES of the photo's
// width / height, so they stay on the same part of the product at every screen size.

const MAX_HOTSPOTS = 8;
const LIMITS = { title: 24, description: 110, sectionTitle: 80 };
// Where a feature's text sits. "auto" (default) puts it in the gutter on the side nearest the marker.
const LABEL_POSITIONS = ['auto', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const PLACEMENTS = ['after_info', 'before_reviews'];

const imageUrl = z.union([z.string().trim().url().refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL.'), z.literal('')]);
// 0-100, kept to 2 decimals; null = "not placed on the photo yet" (allowed on a draft / switched-off box)
const percent = z
  .number()
  .min(0, 'Position must be between 0 and 100.')
  .max(100, 'Position must be between 0 and 100.')
  .transform((n) => Math.round(n * 100) / 100)
  .nullable()
  .optional();
// width / height of the photo, saved by the admin when it is uploaded so the page can reserve its space
const aspect = z.number().min(0.1).max(10).nullable().optional();

const hotspotSchema = z
  .object({
    id: z.string().min(1).optional(),
    pointX: percent,
    pointY: percent,
    labelPosition: z.enum(LABEL_POSITIONS).default('auto'),
    title: z.string().trim().max(LIMITS.title, `Keep the title to ${LIMITS.title} characters.`).default(''),
    description: z.string().trim().max(LIMITS.description, `Keep the description to ${LIMITS.description} characters.`).default(''),
    // Optional: this feature's own photo (else the section's main photo is used)
    imageUrl: imageUrl.default(''),
    imageAspect: aspect,
    active: z.boolean().default(true),
  });

const hotspotSectionSchema = z
  .object({
    enabled: z.boolean().default(false),
    title: z.string().trim().max(LIMITS.sectionTitle, `Keep the title to ${LIMITS.sectionTitle} characters.`).default(''),
    imageUrl: imageUrl.default(''),
    imageAspect: aspect,
    placement: z.enum(PLACEMENTS).default('after_info'),
    loop: z.boolean().default(true),
    autoplay: z.boolean().default(false),
    hotspots: z.array(hotspotSchema).max(MAX_HOTSPOTS, `Up to ${MAX_HOTSPOTS} features.`).default([]),
  })
  .superRefine((s, ctx) => {
    if (!s.enabled) return;
    if (!s.imageUrl) ctx.addIssue({ code: 'custom', path: ['imageUrl'], message: 'Upload the main photo before switching this on.' });
    if (!s.hotspots.some((h) => h.active)) {
      ctx.addIssue({ code: 'custom', path: ['hotspots'], message: 'Add at least one active feature, or turn the section off.' });
    }
    // While the section is on, every active feature must be complete. While it is off, features can
    // stay drafts (e.g. the starter content, whose markers the owner has yet to place on the photo).
    s.hotspots.forEach((h, i) => {
      if (!h.active) return;
      if (!h.title) ctx.addIssue({ code: 'custom', path: ['hotspots', i, 'title'], message: 'Give the feature a title.' });
      if (!h.description) ctx.addIssue({ code: 'custom', path: ['hotspots', i, 'description'], message: 'Write a short description.' });
      if (h.pointX == null || h.pointY == null) ctx.addIssue({ code: 'custom', path: ['hotspots', i, 'pointX'], message: 'Click the photo to place this feature.' });
    });
  });

module.exports = { hotspotSectionSchema, LABEL_POSITIONS, PLACEMENTS, MAX_HOTSPOTS, LIMITS };
