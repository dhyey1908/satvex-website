// "Feature Hotspots" on the product page: one big photo with numbered feature points.
// Pure helpers shared by the storefront slider, the admin's visual editor and its Save checks.
// The server enforces the same rules (backend/src/validators/hotspotValidators.js).

export const MAX_HOTSPOTS = 8;
export const LIMITS = { title: 24, description: 110, sectionTitle: 80 };
// Where a feature's text sits. Auto (the default) puts it in the gutter on the side NEAREST the marker.
export const LABEL_POSITIONS = [
  { id: 'auto', label: 'Auto (recommended)' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top-left', label: 'Top-left' },
  { id: 'top-right', label: 'Top-right' },
  { id: 'bottom-left', label: 'Bottom-left' },
  { id: 'bottom-right', label: 'Bottom-right' },
];
export const PLACEMENTS = [
  { id: 'after_info', label: 'After product info' },
  { id: 'before_reviews', label: 'Before reviews' },
];
// Below this width (of the block itself) there is no room for text beside the photo: the slider shows
// numbered cards under it instead (a 768px-wide screen leaves the block about 720px wide, which is just too tight for text beside the photo).
export const MOBILE_MAX = 740;
export const LABEL_GAP = 24; // between the photo's edge and the label
export const LABEL_MARGIN = 24; // the label keeps this far from the top / bottom of the photo area
export const LINE_GAP = 10; // the line stops this far before the label text
export const DEFAULT_ASPECT = 4 / 3;

export const EMPTY_HOTSPOT_SECTION = { enabled: false, title: '', imageUrl: '', imageAspect: null, placement: 'after_info', loop: true, autoplay: false, hotspots: [] };

// The starter features from the brief (Butterfly claw clip). Markers are NOT placed: the owner
// clicks the real photo in the visual editor, so it stays switched off until then.
export const STARTER_HOTSPOTS = [
  { pointX: null, pointY: null, labelPosition: 'auto', title: 'flexible body', description: 'bends and bounces back instead of snapping. lean back, relax, wear it all day.', imageUrl: '', active: true },
  { pointX: null, pointY: null, labelPosition: 'auto', title: 'rounded teeth', description: 'smooth, rounded teeth grip your hair without digging into your scalp.', imageUrl: '', active: true },
  { pointX: null, pointY: null, labelPosition: 'auto', title: 'strong spring', description: 'a sturdy spring keeps your hold secure from morning to night.', imageUrl: '', active: true },
  { pointX: null, pointY: null, labelPosition: 'auto', title: 'feather-light', description: "so light, you'll forget you're wearing it.", imageUrl: '', active: true },
];

const isPlaced = (h) => h.pointX !== null && h.pointX !== undefined && h.pointX !== '' && h.pointY !== null && h.pointY !== undefined && h.pointY !== '';

// A click / drag position inside the photo's box as percentages of its width and height (0-100, 2 decimals).
export function percentFromPoint(clientX, clientY, rect) {
  const clamp = (n) => Math.min(100, Math.max(0, n));
  const round = (n) => Math.round(n * 100) / 100;
  return {
    x: round(clamp(((clientX - rect.left) / rect.width) * 100)),
    y: round(clamp(((clientY - rect.top) / rect.height) * 100)),
  };
}

// Where a % position lands on a photo that is currently drawn `width` x `height` pixels big.
// (Everything about the marker follows the rendered photo, so it stays on the same part of the
// product at any screen size.)
export function pixelFromPercent(pointX, pointY, width, height) {
  return { x: (Number(pointX) / 100) * width, y: (Number(pointY) / 100) * height };
}

// Which side of the photo a feature's text goes on, and how it lines up vertically.
//   auto (default): the side NEAREST the marker (x < 50% -> left, otherwise right), centred on the marker's height
//   left / right:   that side, centred on the marker's height
//   top-* / bottom-*: that side, pinned to the top / bottom of the photo area
export function resolvePlacement(spot) {
  const pos = spot.labelPosition || 'auto';
  let side;
  if (pos === 'left' || pos.endsWith('-left')) side = 'left';
  else if (pos === 'right' || pos.endsWith('-right')) side = 'right';
  else side = Number(spot.pointX) < 50 ? 'left' : 'right';
  const vertical = pos.startsWith('top-') ? 'top' : pos.startsWith('bottom-') ? 'bottom' : 'middle';
  return { side, vertical };
}

// The label's top edge (px, within the photo area): centred on the marker's height, then kept fully
// inside the area (at least `margin` from the top and the bottom).
export function labelTop({ vertical, markerY, labelHeight, stageHeight, margin = LABEL_MARGIN }) {
  const wanted = vertical === 'top' ? margin : vertical === 'bottom' ? stageHeight - labelHeight - margin : markerY - labelHeight / 2;
  return Math.max(margin, Math.min(wanted, stageHeight - labelHeight - margin));
}

// The connector line: from the marker centre to the label block - ending `gap` px short of the edge that faces
// the photo (the right edge of a left label, the left edge of a right one), at the middle of the title's first line.
export function labelLine({ marker, edgeX, titleY, side, gap = LINE_GAP }) {
  return { x1: marker.x, y1: marker.y, x2: side === 'left' ? edgeX + gap : edgeX - gap, y2: titleY };
}

// Next / previous slide, wrapping when `loop` is on; null at the ends otherwise.
export function stepIndex(index, count, direction, loop) {
  const next = index + direction;
  if (next >= 0 && next < count) return next;
  if (!loop || count < 2) return null;
  return (next + count) % count;
}

export const pad2 = (n) => String(n).padStart(2, '0');

// The shopper-facing shape (what the API returns), built from the admin's draft for the preview.
export function previewHotspotSection(s) {
  return {
    title: (s.title || '').trim(),
    imageUrl: s.imageUrl || '',
    imageAspect: s.imageAspect || null,
    placement: s.placement || 'after_info',
    loop: s.loop !== false,
    autoplay: s.autoplay === true,
    hotspots: (s.hotspots || [])
      .filter((h) => h.active !== false && isPlaced(h) && (h.title || '').trim() && (h.description || '').trim())
      .map((h, i) => ({
        id: h.id || `preview_${i}`,
        pointX: Number(h.pointX),
        pointY: Number(h.pointY),
        labelPosition: h.labelPosition || 'top-right',
        title: h.title.trim(),
        description: h.description.trim(),
        imageUrl: h.imageUrl || '',
        imageAspect: h.imageAspect || null,
      })),
  };
}

// Problems that block Save (empty object = fine). Keys: image, hotspots, rows[index].
export function checkHotspotSection(s) {
  const errors = {};
  if (!s) return errors;
  const list = s.hotspots || [];
  const rows = list.map((h) => {
    if (h.title && h.title.length > LIMITS.title) return `Keep the title to ${LIMITS.title} characters.`;
    if (h.description && h.description.length > LIMITS.description) return `Keep the description to ${LIMITS.description} characters.`;
    if (!s.enabled || h.active === false) return '';
    if (!(h.title || '').trim()) return 'Give the feature a title.';
    if (!(h.description || '').trim()) return 'Write a short description.';
    if (!isPlaced(h)) return 'Click the photo to place this feature.';
    return '';
  });
  if (rows.some(Boolean)) errors.rows = rows;
  if (s.enabled) {
    if (!s.imageUrl) errors.image = 'Upload the main photo before switching this on.';
    if (!list.some((h) => h.active !== false)) errors.hotspots = 'Add at least one active feature, or turn the section off.';
  }
  return errors;
}

export const hasHotspotErrors = (errors) => Boolean(errors.image || errors.hotspots || errors.rows);

// Width / height of an image URL (read when the admin uploads it, so the page can reserve its space).
export function loadImageAspect(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? Math.round((img.naturalWidth / img.naturalHeight) * 1000) / 1000 : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
