const test = require('node:test');
const assert = require('node:assert/strict');
const { topHighlightSchema, HIGHLIGHT_ICONS } = require('../validators/topHighlightValidators');
const { productUpdateSchema } = require('../validators/productValidators');
const { publicTopHighlight } = require('./topHighlight');
const { productForViewer } = require('./productVisibility');

const base = { enabled: true, headline: 'Bends, *won\'t break*.' };
const chip = (label, icon = 'flex') => ({ icon, label });

test('a highlight needs a headline once it is on; a draft can be saved switched off', () => {
  assert.equal(topHighlightSchema.safeParse(base).success, true);
  assert.equal(topHighlightSchema.safeParse({ enabled: true, headline: '' }).success, false);
  assert.equal(topHighlightSchema.safeParse({ enabled: false, headline: '' }).success, true);
});

test('limits: eyebrow 30, headline 40, subline 90, chip label 18, up to 4 chips', () => {
  assert.equal(topHighlightSchema.safeParse({ ...base, eyebrow: 'x'.repeat(30) }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, eyebrow: 'x'.repeat(31) }).success, false);
  assert.equal(topHighlightSchema.safeParse({ ...base, headline: 'x'.repeat(40) }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, headline: 'x'.repeat(41) }).success, false);
  assert.equal(topHighlightSchema.safeParse({ ...base, subline: 'x'.repeat(90) }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, subline: 'x'.repeat(91) }).success, false);
  assert.equal(topHighlightSchema.safeParse({ ...base, chips: [chip('x'.repeat(18))] }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, chips: [chip('x'.repeat(19))] }).success, false);
  assert.equal(topHighlightSchema.safeParse({ ...base, chips: Array.from({ length: 4 }, () => chip('Flexible')) }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, chips: Array.from({ length: 5 }, () => chip('Flexible')) }).success, false);
});

test('chips use one of the 12 preset icons; the style is plain or lavender', () => {
  assert.equal(HIGHLIGHT_ICONS.length, 12);
  for (const icon of HIGHLIGHT_ICONS) assert.equal(topHighlightSchema.safeParse({ ...base, chips: [chip('Ok', icon)] }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, chips: [chip('Ok', 'rocket')] }).success, false);
  assert.equal(topHighlightSchema.parse(base).style, 'plain');
  assert.equal(topHighlightSchema.safeParse({ ...base, style: 'lavender' }).success, true);
  assert.equal(topHighlightSchema.safeParse({ ...base, style: 'neon' }).success, false);
});

test('shoppers get the highlight only when it is on and has a headline', () => {
  assert.equal(publicTopHighlight(undefined), null);
  assert.equal(publicTopHighlight({ ...base, enabled: false }), null);
  assert.equal(publicTopHighlight({ enabled: true, headline: '' }), null);
  const out = publicTopHighlight({ ...base, eyebrow: 'THE SATVEX BUTTERFLY', chips: [{ id: 'c1', icon: 'flex', label: 'Flexible' }] });
  assert.equal(out.headline, base.headline);
  assert.equal(out.eyebrow, 'THE SATVEX BUTTERFLY');
  assert.deepEqual(out.chips, [{ id: 'c1', icon: 'flex', label: 'Flexible' }]);
  assert.equal(out.style, 'plain');
  assert.equal('enabled' in out, false);
});

test('productForViewer: shoppers get the trimmed highlight (or none), admins the raw one', () => {
  const product = { productId: 'p', sellingOptions: [], topHighlight: { ...base, enabled: false } };
  assert.equal(productForViewer(product, false).topHighlight, null);
  assert.equal(productForViewer(product, true).topHighlight.enabled, false);
  assert.equal(productForViewer({ ...product, topHighlight: base }, false).topHighlight.headline, base.headline);
});

test('the product update schema accepts a topHighlight and refuses an invalid one', () => {
  assert.equal(productUpdateSchema.safeParse({ topHighlight: base }).success, true);
  assert.equal(productUpdateSchema.safeParse({ topHighlight: { enabled: true, headline: '' } }).success, false);
});
