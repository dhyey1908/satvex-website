import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_ICONS, HIGHLIGHT_LIMITS, MAX_CHIPS, previewHighlight, checkTopHighlight, hasHighlightErrors } from '../utils/topHighlight.js';

const on = (more = {}) => ({ enabled: true, headline: "Bends, *won't break*.", chips: [], ...more });
const chip = (label) => ({ icon: 'flex', label });

test('a headline is required once the highlight is on, not while it is off', () => {
  assert.ok(checkTopHighlight({ enabled: true, headline: '  ' }).headline);
  assert.equal(hasHighlightErrors(checkTopHighlight({ enabled: false, headline: '' })), false);
  assert.equal(hasHighlightErrors(checkTopHighlight(on())), false);
});

test('limits: eyebrow 30, headline 40, subline 90, chip label 18; 12 icons; up to 4 chips', () => {
  assert.deepEqual(HIGHLIGHT_LIMITS, { eyebrow: 30, headline: 40, subline: 90, chip: 18 });
  assert.equal(HIGHLIGHT_ICONS.length, 12);
  assert.equal(MAX_CHIPS, 4);
  assert.ok(checkTopHighlight(on({ eyebrow: 'x'.repeat(31) })).eyebrow);
  assert.ok(checkTopHighlight(on({ headline: 'x'.repeat(41) })).headline);
  assert.ok(checkTopHighlight(on({ subline: 'x'.repeat(91) })).subline);
  assert.ok(checkTopHighlight(on({ chips: [chip('x'.repeat(19))] })).chipRows[0]);
  assert.ok(checkTopHighlight(on({ chips: [chip('')] })).chipRows[0]);
  assert.equal(hasHighlightErrors(checkTopHighlight(on({ chips: [chip('Flexible'), chip('Lightweight')] }))), false);
});

test('the preview drops empty chips and defaults to the plain style', () => {
  const p = previewHighlight(on({ chips: [chip('Flexible'), chip('  ')], style: 'neon' }));
  assert.equal(p.chips.length, 1);
  assert.equal(p.style, 'plain');
  assert.equal(previewHighlight(on({ style: 'lavender' })).style, 'lavender');
});
