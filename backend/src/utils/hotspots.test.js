const test = require('node:test');
const assert = require('node:assert/strict');
const { hotspotSectionSchema, MAX_HOTSPOTS, LABEL_POSITIONS } = require('../validators/hotspotValidators');
const { productUpdateSchema } = require('../validators/productValidators');
const { publicHotspotSection, STARTER_HOTSPOT_SECTION } = require('./hotspots');
const { productForViewer } = require('./productVisibility');

const IMG = 'https://cdn.example.com/satvex/products/clip.png';
const spot = (more = {}) => ({ pointX: 40, pointY: 25.5, labelPosition: 'top-right', title: 'flexible body', description: 'bends and bounces back.', active: true, ...more });
const on = (hotspots = [spot()], more = {}) => ({ enabled: true, imageUrl: IMG, hotspots, ...more });

test('the starter content parses and stays switched off with no marker positions', () => {
  const parsed = hotspotSectionSchema.parse(STARTER_HOTSPOT_SECTION);
  assert.equal(parsed.enabled, false);
  assert.deepEqual(parsed.hotspots.map((h) => h.title), ['flexible body', 'rounded teeth', 'strong spring', 'feather-light']);
  assert.deepEqual(parsed.hotspots.map((h) => h.labelPosition), ['top-right', 'bottom-left', 'top-left', 'bottom-right']);
  assert.ok(parsed.hotspots.every((h) => h.pointX == null && h.pointY == null));
  // ...so it cannot be switched on until the owner has placed the markers on the real photo
  assert.equal(hotspotSectionSchema.safeParse({ ...STARTER_HOTSPOT_SECTION, enabled: true, imageUrl: IMG }).success, false);
});

test('positions must be 0-100 and are kept to two decimals', () => {
  assert.equal(hotspotSectionSchema.parse(on([spot({ pointX: 33.3333, pointY: 66.666 })])).hotspots[0].pointX, 33.33);
  assert.equal(hotspotSectionSchema.parse(on([spot({ pointX: 33.3333, pointY: 66.666 })])).hotspots[0].pointY, 66.67);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ pointX: 100, pointY: 0 })])).success, true);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ pointX: 100.1 })])).success, false);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ pointY: -1 })])).success, false);
});

test('text limits: title 24, description 110; label position is one of the 4 corners', () => {
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ title: 'x'.repeat(24) })])).success, true);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ title: 'x'.repeat(25) })])).success, false);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ description: 'x'.repeat(110) })])).success, true);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ description: 'x'.repeat(111) })])).success, false);
  assert.deepEqual(LABEL_POSITIONS, ['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  for (const labelPosition of LABEL_POSITIONS) assert.equal(hotspotSectionSchema.safeParse(on([spot({ labelPosition })])).success, true);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ labelPosition: 'middle' })])).success, false);
});

test('1-8 features; switching on needs the main photo and one complete active feature', () => {
  assert.equal(MAX_HOTSPOTS, 8);
  assert.equal(hotspotSectionSchema.safeParse(on(Array.from({ length: 8 }, () => spot()))).success, true);
  assert.equal(hotspotSectionSchema.safeParse(on(Array.from({ length: 9 }, () => spot()))).success, false);
  assert.equal(hotspotSectionSchema.safeParse(on([])).success, false);
  assert.equal(hotspotSectionSchema.safeParse({ enabled: true, hotspots: [spot()] }).success, false); // no main photo
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ active: false })])).success, false);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ title: '' })])).success, false);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ description: '' })])).success, false);
  assert.equal(hotspotSectionSchema.safeParse(on([spot({ pointX: null })])).success, false);
  // a switched-off feature may be a draft
  assert.equal(hotspotSectionSchema.safeParse(on([spot(), spot({ active: false, title: '', pointX: null })])).success, true);
  // the error points at the exact feature
  const bad = hotspotSectionSchema.safeParse(on([spot(), spot({ title: '' })]));
  assert.equal(bad.error.issues[0].path.join('.'), 'hotspots.1.title');
  // and the whole section may be a draft while it is off
  assert.equal(hotspotSectionSchema.safeParse({ enabled: false, hotspots: [] }).success, true);
});

test('placement, loop and autoplay settings', () => {
  const d = hotspotSectionSchema.parse(on());
  assert.deepEqual([d.placement, d.loop, d.autoplay], ['after_info', true, false]);
  assert.equal(hotspotSectionSchema.safeParse(on([spot()], { placement: 'before_reviews', autoplay: true, loop: false })).success, true);
  assert.equal(hotspotSectionSchema.safeParse(on([spot()], { placement: 'footer' })).success, false);
});

test('shoppers get the section only when it is on, has its photo and a placed active feature', () => {
  assert.equal(publicHotspotSection(undefined), null);
  assert.equal(publicHotspotSection({ ...on(), enabled: false }), null);
  assert.equal(publicHotspotSection({ ...on(), imageUrl: '' }), null);
  assert.equal(publicHotspotSection(on([spot({ active: false })])), null);
  assert.equal(publicHotspotSection(on([spot({ pointX: null })])), null);
  const out = publicHotspotSection(on([spot({ id: 'a' }), spot({ id: 'b', active: false }), spot({ id: 'c', pointX: null }), spot({ id: 'd', title: 'second' })]));
  assert.deepEqual(out.hotspots.map((h) => h.id), ['a', 'd']);
  assert.equal(out.placement, 'after_info');
  assert.equal(out.loop, true);
  assert.equal('enabled' in out, false);
  assert.equal('active' in out.hotspots[0], false);
});

test('productForViewer: admins get the raw section, shoppers the trimmed one (or none)', () => {
  const product = { productId: 'p', sellingOptions: [], hotspotSection: { ...on(), enabled: false } };
  assert.equal(productForViewer(product, false).hotspotSection, null);
  assert.equal(productForViewer(product, true).hotspotSection.enabled, false);
  assert.equal(productForViewer({ ...product, hotspotSection: on() }, false).hotspotSection.hotspots.length, 1);
});

test('the product update schema accepts a hotspotSection and refuses an invalid one', () => {
  assert.equal(productUpdateSchema.safeParse({ hotspotSection: on() }).success, true);
  assert.equal(productUpdateSchema.safeParse({ hotspotSection: on([]) }).success, false);
});
