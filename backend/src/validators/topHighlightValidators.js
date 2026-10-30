const { z } = require('zod');

// "Top Highlight": the short feature headline above a product's image gallery
// (product.topHighlight): optional eyebrow, a headline, a subline and up to 4 feature chips.

const MAX_CHIPS = 4;
const LIMITS = { eyebrow: 30, headline: 40, subline: 90, chip: 18 };
// Preset line icons a chip can show (the storefront maps each key to its icon).
const HIGHLIGHT_ICONS = ['flex', 'shield', 'sparkle', 'clock', 'feather', 'heart', 'leaf', 'star', 'check', 'droplet', 'sun', 'truck'];
const HIGHLIGHT_STYLES = ['plain', 'lavender'];

const chipSchema = z.object({
  id: z.string().min(1).optional(),
  icon: z.enum(HIGHLIGHT_ICONS),
  label: z.string().trim().min(1, 'Give each chip a label.').max(LIMITS.chip, `Keep chip labels to ${LIMITS.chip} characters.`),
});

const topHighlightSchema = z
  .object({
    enabled: z.boolean().default(false),
    eyebrow: z.string().trim().max(LIMITS.eyebrow, `Keep the eyebrow to ${LIMITS.eyebrow} characters.`).default(''),
    // Required once the highlight is on (checked below), so a half-written draft can still be saved switched off.
    headline: z.string().trim().max(LIMITS.headline, `Keep the headline to ${LIMITS.headline} characters.`).default(''),
    subline: z.string().trim().max(LIMITS.subline, `Keep the subline to ${LIMITS.subline} characters.`).default(''),
    chips: z.array(chipSchema).max(MAX_CHIPS, `Up to ${MAX_CHIPS} chips.`).default([]),
    style: z.enum(HIGHLIGHT_STYLES).default('plain'),
  })
  .superRefine((h, ctx) => {
    if (h.enabled && !h.headline) {
      ctx.addIssue({ code: 'custom', path: ['headline'], message: 'Write a headline, or turn the highlight off.' });
    }
  });

module.exports = { topHighlightSchema, HIGHLIGHT_ICONS, HIGHLIGHT_STYLES, MAX_CHIPS, LIMITS };
