const test = require('node:test');
const assert = require('node:assert/strict');
const { proofSectionSchema, NEEDS_SOURCE, SAMPLE_TOO_SMALL } = require('../validators/proofSectionValidators');
const { productUpdateSchema } = require('../validators/productValidators');
const { monthLabel, footnote, publicProofSection, STARTER_PROOF_SECTION } = require('./proofSection');
const { productForViewer } = require('./productVisibility');

const text = (value, statement = 'bends instead of *snapping*.') => ({ valueType: 'text', value, statement, active: true });
const number = (value, statement = 'saw less breakage.') => ({ valueType: 'number', value, suffix: '%', statement, active: true });
const on = (stats, more = {}) => ({ enabled: true, header: 'the *satvex* difference.', stats, ...more });

test('the starter content (text-only boxes) is valid and needs no survey', () => {
  const parsed = proofSectionSchema.parse(STARTER_PROOF_SECTION);
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.stats.length, 4);
  assert.equal(proofSectionSchema.safeParse({ ...STARTER_PROOF_SECTION, enabled: true }).success, true);
});

test('a number box needs the survey sample size and month, otherwise save is refused', () => {
  const bad = proofSectionSchema.safeParse(on([number('98')]));
  assert.equal(bad.success, false);
  assert.equal(bad.error.issues[0].message, NEEDS_SOURCE);
  assert.equal(proofSectionSchema.safeParse(on([number('98')], { sampleSize: 120 })).success, false);
  assert.equal(proofSectionSchema.safeParse(on([number('98')], { surveyMonth: '2027-01' })).success, false);
  assert.equal(proofSectionSchema.safeParse(on([number('98')], { sampleSize: 120, surveyMonth: '2027-01' })).success, true);
});

test('an inactive number box does not need a survey', () => {
  const stats = [text('FLEX'), { ...number('98'), active: false }];
  assert.equal(proofSectionSchema.safeParse(on(stats)).success, true);
});

test('statement is limited to 90 characters, 6 boxes at most, and values are checked per type', () => {
  assert.equal(proofSectionSchema.safeParse(on([text('FLEX', 'x'.repeat(91))])).success, false);
  assert.equal(proofSectionSchema.safeParse(on([text('FLEX', 'x'.repeat(90))])).success, true);
  assert.equal(proofSectionSchema.safeParse(on(Array.from({ length: 7 }, () => text('FLEX')))).success, false);
  assert.equal(proofSectionSchema.safeParse(on([{ ...number('ninety'), }], { sampleSize: 1, surveyMonth: '2027-01' })).success, false);
  assert.equal(proofSectionSchema.safeParse(on([{ valueType: 'icon', value: 'heart', statement: 'kind to hair' }])).success, true);
  assert.equal(proofSectionSchema.safeParse(on([{ valueType: 'icon', value: 'rocket', statement: 'kind to hair' }])).success, false);
});

test('a switched-off box may be a half-written draft; a live one must be complete', () => {
  const draft = { valueType: 'number', value: '', statement: '', active: false };
  assert.equal(proofSectionSchema.safeParse(on([text('FLEX'), draft])).success, true);
  assert.equal(proofSectionSchema.safeParse(on([text('FLEX'), { ...draft, active: true }])).success, false);
  assert.equal(proofSectionSchema.safeParse(on([text('FLEX', '')])).success, false);
});

test('turning the section on needs at least one active box', () => {
  assert.equal(proofSectionSchema.safeParse({ enabled: true, header: 'x', stats: [] }).success, false);
  assert.equal(proofSectionSchema.safeParse({ enabled: false, header: 'x', stats: [] }).success, true);
});

test('percentages need at least 30 survey responses', () => {
  const withSample = (n) => proofSectionSchema.safeParse(on([number('98')], { sampleSize: n, surveyMonth: '2027-01' }));
  const small = withSample(29);
  assert.equal(small.success, false);
  assert.equal(small.error.issues[0].message, SAMPLE_TOO_SMALL);
  assert.equal(SAMPLE_TOO_SMALL, 'At least 30 survey responses are needed to show percentages.');
  assert.equal(withSample(30).success, true);
  // word boxes make no claim, so no survey is needed at all
  assert.equal(proofSectionSchema.safeParse(on([text('FLEX')], { sampleSize: 5 })).success, true);
});

test('the colour theme is one of the four, lavender by default; old background fields are ignored', () => {
  assert.equal(proofSectionSchema.parse(STARTER_PROOF_SECTION).theme, 'lavender');
  for (const theme of ['lavender', 'plum', 'blush', 'mono']) assert.equal(proofSectionSchema.safeParse({ ...STARTER_PROOF_SECTION, theme }).success, true);
  assert.equal(proofSectionSchema.safeParse({ ...STARTER_PROOF_SECTION, theme: 'neon' }).success, false);
  const old = proofSectionSchema.parse({ ...STARTER_PROOF_SECTION, bgImageDesktop: 'https://cdn.example.com/a.jpg', overlay: 50 });
  assert.equal('bgImageDesktop' in old, false);
  assert.equal('overlay' in old, false);
});

test('footnote: own source text wins; otherwise it is built from sample size and month; text-only has none', () => {
  assert.equal(monthLabel('2027-01'), 'January 2027');
  assert.equal(monthLabel('2027-13'), '');
  const stats = [number('98')];
  assert.equal(footnote({ stats, sampleSize: 120, surveyMonth: '2027-01' }), 'Based on a survey of 120 SATVEX customers, January 2027.');
  assert.equal(footnote({ stats, sampleSize: 120, surveyMonth: '2027-01', sourceText: 'Our own panel, Jan 2027.' }), 'Our own panel, Jan 2027.');
  assert.equal(footnote({ stats: [text('FLEX')] }), '');
});

test('shoppers only get the section when it is on and has an active box, trimmed to what is shown', () => {
  assert.equal(publicProofSection(undefined), null);
  assert.equal(publicProofSection({ ...STARTER_PROOF_SECTION, enabled: false }), null);
  assert.equal(publicProofSection({ enabled: true, header: 'h', stats: [{ ...text('FLEX'), active: false }] }), null);
  const out = publicProofSection({ ...STARTER_PROOF_SECTION, enabled: true, stats: [...STARTER_PROOF_SECTION.stats.slice(0, 2), { ...text('SOFT'), active: false }] });
  assert.equal(out.stats.length, 2);
  assert.equal(out.header, 'the *satvex* difference.');
  assert.equal(out.theme, 'lavender');
  assert.equal('bgImageDesktop' in out || 'overlay' in out, false);
  assert.equal('enabled' in out, false);
  assert.equal('active' in out.stats[0], false);
});

test('productForViewer: admins get the raw section, shoppers the trimmed one (or none)', () => {
  const product = { productId: 'p1', sellingOptions: [], proofSection: { ...STARTER_PROOF_SECTION, enabled: false } };
  assert.equal(productForViewer(product, true).proofSection.enabled, false);
  assert.equal(productForViewer(product, false).proofSection, null);
  const live = { ...product, proofSection: { ...STARTER_PROOF_SECTION, enabled: true } };
  assert.equal(productForViewer(live, false).proofSection.stats.length, 4);
});

test('the product update schema accepts a proofSection and rejects an invalid one', () => {
  assert.equal(productUpdateSchema.safeParse({ proofSection: STARTER_PROOF_SECTION }).success, true);
  assert.equal(productUpdateSchema.safeParse({ proofSection: on([number('98')]) }).success, false);
});
