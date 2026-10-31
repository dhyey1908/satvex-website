import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentFromPoint, pixelFromPercent, resolvePlacement, labelTop, labelLine, stepIndex, pad2, previewHotspotSection, checkHotspotSection, hasHotspotErrors,
  MAX_HOTSPOTS, LIMITS, LABEL_POSITIONS, STARTER_HOTSPOTS,
} from '../utils/hotspots.js';

const spot = (more = {}) => ({ pointX: 40, pointY: 25, labelPosition: 'auto', title: 'flexible body', description: 'bends and bounces back.', active: true, ...more });
const on = (hotspots = [spot()], more = {}) => ({ enabled: true, imageUrl: 'https://cdn.example.com/clip.png', hotspots, ...more });

test('a marker stays on the same part of the photo at every screen width', () => {
  // the marker is placed from percentages of the RENDERED photo, so the same % is the same spot
  for (const width of [360, 768, 1280, 1920]) {
    const height = width / 1.5;
    const p = pixelFromPercent(40, 25, width, height);
    assert.ok(Math.abs(p.x / width - 0.4) < 1e-9, `x at ${width}`);
    assert.ok(Math.abs(p.y / height - 0.25) < 1e-9, `y at ${width}`);
  }
});

test('clicking / dragging maps to 0-100 percentages, kept inside the photo and rounded to 2 decimals', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(percentFromPoint(300, 150, rect), { x: 50, y: 50 });
  assert.deepEqual(percentFromPoint(101, 51, rect), { x: 0.25, y: 0.5 });
  assert.deepEqual(percentFromPoint(-500, 9999, rect), { x: 0, y: 100 });
  assert.deepEqual(percentFromPoint(433.333, 150, rect), { x: 83.33, y: 50 });
  // the same click, same percentages whatever size the photo is drawn at
  const small = { left: 0, top: 0, width: 360, height: 240 };
  const big = { left: 0, top: 0, width: 1920, height: 1280 };
  assert.deepEqual(percentFromPoint(90, 60, small), percentFromPoint(480, 320, big));
});

test('auto placement: the label goes to the side NEAREST the marker', () => {
  assert.deepEqual(resolvePlacement({ pointX: 25, pointY: 30, labelPosition: 'auto' }), { side: 'left', vertical: 'middle' });
  assert.deepEqual(resolvePlacement({ pointX: 84, pointY: 30, labelPosition: 'auto' }), { side: 'right', vertical: 'middle' });
  assert.equal(resolvePlacement({ pointX: 49.99 }).side, 'left'); // no position saved = auto
  assert.equal(resolvePlacement({ pointX: 50 }).side, 'right'); // x >= 50% -> right
  assert.equal(resolvePlacement({ pointX: 0 }).side, 'left');
  assert.equal(resolvePlacement({ pointX: 100 }).side, 'right');
});

test('a value the admin chose overrides auto', () => {
  assert.deepEqual(resolvePlacement({ pointX: 90, labelPosition: 'left' }), { side: 'left', vertical: 'middle' });
  assert.deepEqual(resolvePlacement({ pointX: 10, labelPosition: 'right' }), { side: 'right', vertical: 'middle' });
  assert.deepEqual(resolvePlacement({ pointX: 90, labelPosition: 'top-left' }), { side: 'left', vertical: 'top' });
  assert.deepEqual(resolvePlacement({ pointX: 10, labelPosition: 'top-right' }), { side: 'right', vertical: 'top' });
  assert.deepEqual(resolvePlacement({ pointX: 90, labelPosition: 'bottom-left' }), { side: 'left', vertical: 'bottom' });
  assert.deepEqual(resolvePlacement({ pointX: 10, labelPosition: 'bottom-right' }), { side: 'right', vertical: 'bottom' });
});

test('the label is centred on the marker, then kept fully inside the photo area (24px from the top and bottom)', () => {
  const base = { labelHeight: 100, stageHeight: 600 };
  assert.equal(labelTop({ ...base, vertical: 'middle', markerY: 300 }), 250); // centred on the marker
  assert.equal(labelTop({ ...base, vertical: 'middle', markerY: 10 }), 24); // marker near the top: clamped
  assert.equal(labelTop({ ...base, vertical: 'middle', markerY: 595 }), 476); // marker near the bottom: 600 - 100 - 24
  assert.equal(labelTop({ ...base, vertical: 'top', markerY: 400 }), 24);
  assert.equal(labelTop({ ...base, vertical: 'bottom', markerY: 100 }), 476);
  // a label taller than the area still starts 24px down instead of going above it
  assert.equal(labelTop({ labelHeight: 700, stageHeight: 600, vertical: 'middle', markerY: 300 }), 24);
});

test('the connector line ends 10px short of the label edge that faces the photo, at the middle of the title line', () => {
  // a left label: its right edge is at x=300; the line comes from the marker (x=520) and stops at 310
  assert.deepEqual(labelLine({ marker: { x: 520, y: 200 }, edgeX: 300, titleY: 90, side: 'left' }), { x1: 520, y1: 200, x2: 310, y2: 90 });
  // a right label: its left edge is at x=900; the line stops at 890
  assert.deepEqual(labelLine({ marker: { x: 700, y: 200 }, edgeX: 900, titleY: 140, side: 'right' }), { x1: 700, y1: 200, x2: 890, y2: 140 });
  // another width: the label edge moved, the line follows it
  assert.notDeepEqual(labelLine({ marker: { x: 700, y: 200 }, edgeX: 900, titleY: 140, side: 'right' }), labelLine({ marker: { x: 700, y: 200 }, edgeX: 760, titleY: 140, side: 'right' }));
});

test('arrows step through the features and wrap only when looping', () => {
  assert.equal(stepIndex(0, 4, 1, false), 1);
  assert.equal(stepIndex(3, 4, 1, false), null);
  assert.equal(stepIndex(3, 4, 1, true), 0);
  assert.equal(stepIndex(0, 4, -1, true), 3);
  assert.equal(stepIndex(0, 4, -1, false), null);
  assert.equal(stepIndex(0, 1, 1, true), null);
  assert.equal(pad2(2), '02');
});

test('the starter features are the four from the brief, unplaced', () => {
  assert.deepEqual(STARTER_HOTSPOTS.map((h) => h.title), ['flexible body', 'rounded teeth', 'strong spring', 'feather-light']);
  assert.ok(STARTER_HOTSPOTS.every((h) => h.labelPosition === 'auto'));
  assert.ok(STARTER_HOTSPOTS.every((h) => h.pointX === null && h.pointY === null));
  assert.equal(hasHotspotErrors(checkHotspotSection({ enabled: false, hotspots: STARTER_HOTSPOTS })), false);
  assert.ok(checkHotspotSection({ enabled: true, imageUrl: 'x', hotspots: STARTER_HOTSPOTS }).rows[0]); // can't go live until placed
});

test('Save checks: photo, an active feature, and a title, description and position for each', () => {
  assert.equal(hasHotspotErrors(checkHotspotSection(on())), false);
  assert.ok(checkHotspotSection({ ...on(), imageUrl: '' }).image);
  assert.ok(checkHotspotSection(on([])).hotspots);
  assert.ok(checkHotspotSection(on([spot({ active: false })])).hotspots);
  assert.ok(checkHotspotSection(on([spot({ title: ' ' })])).rows[0]);
  assert.ok(checkHotspotSection(on([spot({ description: '' })])).rows[0]);
  assert.ok(checkHotspotSection(on([spot({ pointX: null })])).rows[0]);
  assert.ok(checkHotspotSection(on([spot({ title: 'x'.repeat(LIMITS.title + 1) })])).rows[0]);
  assert.ok(checkHotspotSection({ enabled: false, hotspots: [spot({ description: 'x'.repeat(LIMITS.description + 1) })] }).rows[0]);
  assert.equal(hasHotspotErrors(checkHotspotSection({ enabled: false, hotspots: [spot({ title: '', pointX: null })] })), false); // drafts are fine while off
  assert.equal(MAX_HOTSPOTS, 8);
  assert.deepEqual(LABEL_POSITIONS.map((p) => p.id), ['auto', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
  assert.match(LABEL_POSITIONS[0].label, /Auto/);
});

test('the preview keeps only active, complete, placed features in order', () => {
  const p = previewHotspotSection(on([spot({ title: 'a' }), spot({ active: false, title: 'b' }), spot({ pointX: null, title: 'c' }), spot({ title: 'd', pointX: '55.5' })]));
  assert.deepEqual(p.hotspots.map((h) => h.title), ['a', 'd']);
  assert.equal(p.hotspots[1].pointX, 55.5);
  assert.equal(p.placement, 'after_info');
  assert.equal(p.loop, true);
});
