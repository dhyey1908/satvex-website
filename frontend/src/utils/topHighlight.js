// Product page "Top Highlight" (above the gallery): limits, preview shape and Save checks.
// The server enforces the same rules (backend/src/validators/topHighlightValidators.js).

export const HIGHLIGHT_LIMITS = { eyebrow: 30, headline: 40, subline: 90, chip: 18 };
export const MAX_CHIPS = 4;
export const HIGHLIGHT_STYLES = [
  { id: 'plain', label: 'Plain' },
  { id: 'lavender', label: 'Soft lavender band' },
];
// Preset line icons for a chip (key -> its lucide icon in components/TopHighlight.jsx).
export const HIGHLIGHT_ICONS = [
  { id: 'flex', label: 'Flex / wave' },
  { id: 'shield', label: 'Shield' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'clock', label: 'Clock' },
  { id: 'feather', label: 'Feather' },
  { id: 'heart', label: 'Heart' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'star', label: 'Star' },
  { id: 'check', label: 'Check' },
  { id: 'droplet', label: 'Droplet' },
  { id: 'sun', label: 'Sun' },
  { id: 'truck', label: 'Truck' },
];

export const EMPTY_TOP_HIGHLIGHT = { enabled: false, eyebrow: '', headline: '', subline: '', chips: [], style: 'plain' };

// The shopper-facing shape (what the API returns), built from the admin's draft for the preview.
export function previewHighlight(h) {
  return {
    eyebrow: (h.eyebrow || '').trim(),
    headline: (h.headline || '').trim(),
    subline: (h.subline || '').trim(),
    chips: (h.chips || []).filter((c) => (c.label || '').trim()).map((c, i) => ({ id: c.id || `preview_${i}`, icon: c.icon, label: c.label.trim() })),
    style: h.style === 'lavender' ? 'lavender' : 'plain',
  };
}

// Problems that block Save (empty object = fine). Keys: headline, eyebrow, subline, chipRows[index].
export function checkTopHighlight(h) {
  const errors = {};
  if (!h) return errors;
  if (h.enabled && !(h.headline || '').trim()) errors.headline = 'Write a headline, or turn the highlight off.';
  if ((h.headline || '').length > HIGHLIGHT_LIMITS.headline) errors.headline = `Keep the headline to ${HIGHLIGHT_LIMITS.headline} characters.`;
  if ((h.eyebrow || '').length > HIGHLIGHT_LIMITS.eyebrow) errors.eyebrow = `Keep the eyebrow to ${HIGHLIGHT_LIMITS.eyebrow} characters.`;
  if ((h.subline || '').length > HIGHLIGHT_LIMITS.subline) errors.subline = `Keep the subline to ${HIGHLIGHT_LIMITS.subline} characters.`;
  const rows = (h.chips || []).map((c) => {
    if (!(c.label || '').trim()) return 'Give each chip a label.';
    if (c.label.length > HIGHLIGHT_LIMITS.chip) return `Keep chip labels to ${HIGHLIGHT_LIMITS.chip} characters.`;
    return '';
  });
  if (rows.some(Boolean)) errors.chipRows = rows;
  return errors;
}

export const hasHighlightErrors = (errors) => Boolean(errors.headline || errors.eyebrow || errors.subline || errors.chipRows);
