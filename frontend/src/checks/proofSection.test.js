import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmphasis, monthLabel, footnoteFor, previewSection, checkProofSection, hasProofErrors, NEEDS_SOURCE, SAMPLE_TOO_SMALL, PROOF_THEMES, STARTER_PROOF_SECTION } from '../utils/proofSection.js';

const number = (value) => ({ valueType: 'number', value, suffix: '%', statement: 'saw less breakage.', active: true });
const text = (value) => ({ valueType: 'text', value, statement: 'bends *instead*.', active: true });

test('*emphasis* is split out, lone asterisks stay as plain text', () => {
  assert.deepEqual(parseEmphasis('the *satvex* difference.'), [
    { text: 'the ', em: false },
    { text: 'satvex', em: true },
    { text: ' difference.', em: false },
  ]);
  assert.deepEqual(parseEmphasis('*a* and *b*'), [{ text: 'a', em: true }, { text: ' and ', em: false }, { text: 'b', em: true }]);
  assert.deepEqual(parseEmphasis('5 * 3 stars'), [{ text: '5 * 3 stars', em: false }]);
  assert.deepEqual(parseEmphasis(''), []);
});

test('the footnote comes from the source text, else from the sample size and month', () => {
  assert.equal(monthLabel('2027-01'), 'January 2027');
  const stats = [number('98')];
  assert.equal(footnoteFor({ stats, sampleSize: 120, surveyMonth: '2027-01' }), 'Based on a survey of 120 SATVEX customers, January 2027.');
  assert.equal(footnoteFor({ stats, sampleSize: 120, surveyMonth: '2027-01', sourceText: ' Our panel. ' }), 'Our panel.');
  assert.equal(footnoteFor({ stats: [text('FLEX')] }), '');
});

test('Save is blocked when a number box has no survey details', () => {
  const draft = { enabled: true, stats: [number('98')] };
  const errors = checkProofSection(draft);
  assert.equal(errors.source, NEEDS_SOURCE);
  assert.equal(hasProofErrors(errors), true);
  assert.equal(hasProofErrors(checkProofSection({ ...draft, sampleSize: 120, surveyMonth: '2027-01' })), false);
});

test('text-only boxes need no survey, and the starter content is valid', () => {
  assert.equal(hasProofErrors(checkProofSection({ ...STARTER_PROOF_SECTION, enabled: true })), false);
});

test('each box is checked: statement length, number/word/icon values; switching on needs an active box', () => {
  const long = { ...text('FLEX'), statement: 'x'.repeat(91) };
  assert.ok(checkProofSection({ stats: [long] }).statRows[0]);
  assert.ok(checkProofSection({ stats: [{ ...number('abc') }], sampleSize: 1, surveyMonth: '2027-01' }).statRows[0]);
  assert.ok(checkProofSection({ stats: [{ valueType: 'icon', value: '', statement: 'hi' }] }).statRows[0]);
  assert.ok(checkProofSection({ enabled: true, stats: [{ ...text('FLEX'), active: false }] }).stats);
  assert.equal(hasProofErrors(checkProofSection({ enabled: false, stats: [] })), false);
});

test('the preview shows only active boxes and carries the footnote', () => {
  const p = previewSection({ header: 'h', theme: 'plum', bgImageDesktop: 'x', overlay: 55, stats: [number('98'), { ...text('FLEX'), active: false }], sampleSize: 120, surveyMonth: '2027-01' });
  assert.equal(p.stats.length, 1);
  assert.equal(p.theme, 'plum');
  assert.equal('overlay' in p || 'bgImageDesktop' in p, false); // no background photo any more
  assert.equal(previewSection({ stats: [] }).theme, 'lavender');
  assert.equal(p.footnote, 'Based on a survey of 120 SATVEX customers, January 2027.');
});

test('percentages need at least 30 survey responses', () => {
  const draft = (n) => ({ enabled: true, stats: [number('98')], sampleSize: n, surveyMonth: '2027-01' });
  assert.equal(checkProofSection(draft(29)).source, SAMPLE_TOO_SMALL);
  assert.equal(SAMPLE_TOO_SMALL, 'At least 30 survey responses are needed to show percentages.');
  assert.equal(hasProofErrors(checkProofSection(draft(30))), false);
  assert.equal(hasProofErrors(checkProofSection({ enabled: true, stats: [text('FLEX')], sampleSize: 5 })), false); // words need no survey
});

// ---- the four colour themes must pass WCAG AA (colours are read from the theme file)
const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'theme.css'), 'utf8');
function themeColours(id) {
  const block = css.match(new RegExp(`\\.proof-theme-${id}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(block, `.proof-theme-${id} missing from theme.css`);
  const get = (v) => block.match(new RegExp(`--ps-${v}:\\s*(#[0-9a-fA-F]{6})`))[1];
  return { bg: get('bg'), box: get('box'), border: get('border'), value: get('value'), text: get('text') };
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('every colour theme exists and meets WCAG AA (4.5:1) for its text', () => {
  assert.deepEqual(PROOF_THEMES.map((t) => t.id), ['lavender', 'plum', 'blush', 'mono']);
  for (const { id } of PROOF_THEMES) {
    const c = themeColours(id);
    assert.ok(ratio(c.text, c.box) >= 4.5, `${id}: statement text on box ${ratio(c.text, c.box).toFixed(2)}`);
    assert.ok(ratio(c.value, c.box) >= 4.5, `${id}: value on box ${ratio(c.value, c.box).toFixed(2)}`);
    assert.ok(ratio(c.text, c.bg) >= 4.5, `${id}: title/footnote text on section ${ratio(c.text, c.bg).toFixed(2)}`);
    assert.ok(ratio(c.value, c.bg) >= 4.5, `${id}: emphasised title on section ${ratio(c.value, c.bg).toFixed(2)}`);
  }
  // the spec's exact colours
  assert.deepEqual(themeColours('lavender'), { bg: '#f8f5fd', box: '#ffffff', border: '#d9cdf0', value: '#6b4fa0', text: '#3b2a5c' });
  assert.deepEqual(themeColours('plum'), { bg: '#2e2145', box: '#3b2a5c', border: '#5a4580', value: '#e9ddff', text: '#f5f0ff' });
  assert.deepEqual(themeColours('blush'), { bg: '#fdf3f5', box: '#ffffff', border: '#f1cdd6', value: '#b24a6b', text: '#3b2a5c' });
  assert.deepEqual(themeColours('mono'), { bg: '#ffffff', box: '#ffffff', border: '#1f1f1f', value: '#1f1f1f', text: '#1f1f1f' });
});

test('Top Highlight colours are readable too (plum text on its chip and band, brand purple on white)', () => {
  const get = (v) => css.match(new RegExp(`--hl-${v}:\\s*(#[0-9a-fA-F]{6})`))[1];
  assert.ok(ratio(get('text'), get('chip-bg')) >= 4.5);
  assert.ok(ratio(get('text'), get('band')) >= 4.5);
  assert.ok(ratio(get('brand'), get('band')) >= 4.5);
  assert.ok(ratio(get('brand'), '#ffffff') >= 4.5);
});
