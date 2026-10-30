const { z } = require('zod');

// The "Proof Stats" block on a product page (above Reviews): a header, an optional
// background photo and 1-6 stat boxes. Stored on the product itself (product.proofSection).

const MAX_STATS = 6;
const MAX_STATEMENT = 90;
// Small fixed set of icons a box can show instead of a number/word (mapped to icons in the storefront).
const PROOF_ICONS = ['feather', 'sparkles', 'heart', 'shield', 'leaf', 'wind', 'sun', 'smile', 'star', 'zap'];
const NEEDS_SOURCE = 'Percentages need a real source. Add your survey details.';
const MIN_SAMPLE_SIZE = 30;
const SAMPLE_TOO_SMALL = `At least ${MIN_SAMPLE_SIZE} survey responses are needed to show percentages.`;
// Colour themes of the block (the colours themselves live in the storefront's theme file).
const PROOF_THEMES = ['lavender', 'plum', 'blush', 'mono'];

const statSchema = z
  .object({
    id: z.string().min(1).optional(),
    valueType: z.enum(['number', 'text', 'icon']),
    value: z.string().trim().max(12).default(''),
    // Shown right after a number: "%", "+", "x"...
    suffix: z.string().trim().max(4).default(''),
    statement: z.string().trim().max(MAX_STATEMENT, `Keep the statement to ${MAX_STATEMENT} characters.`).default(''),
    active: z.boolean().default(true),
  })
  .superRefine((stat, ctx) => {
    // A box that is switched off can stay a half-written draft; only live boxes must be complete.
    if (!stat.active) return;
    if (!stat.statement) {
      ctx.addIssue({ code: 'custom', path: ['statement'], message: 'Write the statement.' });
    }
    if (stat.valueType === 'number' && !/^\d+(\.\d+)?$/.test(stat.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a number, like 98.' });
    }
    if (stat.valueType === 'text' && !stat.value) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the word to show, like FLEX.' });
    }
    if (stat.valueType === 'icon' && !PROOF_ICONS.includes(stat.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Choose an icon.' });
    }
  });

const proofSectionSchema = z
  .object({
    enabled: z.boolean().default(false),
    header: z.string().trim().max(120, 'Keep the header to 120 characters.').default(''),
    theme: z.enum(PROOF_THEMES).default('lavender'),
    stats: z.array(statSchema).max(MAX_STATS, `Up to ${MAX_STATS} stat boxes.`).default([]),
    // Optional override of the footnote; blank = built from the sample size and survey month.
    sourceText: z.string().trim().max(200).default(''),
    sampleSize: z.number().int().min(1).max(10000000).nullable().optional(),
    surveyMonth: z.union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick the survey month.'), z.literal('')]).default(''),
  })
  .superRefine((section, ctx) => {
    const active = section.stats.filter((s) => s.active);
    if (section.enabled && active.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['stats'], message: 'Add at least one active stat box, or turn the section off.' });
    }
    // A number is a claim about real customers, so it needs the survey behind it.
    if (active.some((s) => s.valueType === 'number')) {
      if (!section.sampleSize || !section.surveyMonth) {
        ctx.addIssue({ code: 'custom', path: ['sourceText'], message: NEEDS_SOURCE });
      } else if (section.sampleSize < MIN_SAMPLE_SIZE) {
        ctx.addIssue({ code: 'custom', path: ['sampleSize'], message: SAMPLE_TOO_SMALL });
      }
    }
  });

module.exports = { proofSectionSchema, PROOF_ICONS, PROOF_THEMES, MAX_STATS, MAX_STATEMENT, NEEDS_SOURCE, MIN_SAMPLE_SIZE, SAMPLE_TOO_SMALL };
