import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentFromPoint, pixelFromPercent, connectorLine, stepIndex, pad2, previewHotspotSection, checkHotspotSection, hasHotspotErrors,
  MAX_HOTSPOTS, LIMITS, LABEL_POSITIONS, STARTER_HOTSPOTS,
} from '../utils/hotspots.js';

const spot = (more = {}) => ({ pointX: 40, pointY: 25, labelPosition: 'top-right', title: 'flexible body', description: 'bends and bounces back.', active: true, ...more });
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

test('the connector line runs from the marker to the nearest point on the label box', () => {
  const box = { left: 600, top: 40, right: 1000, bottom: 200 };
  assert.deepEqual(connectorLine({ x: 400, y: 120 }, box), { x1: 400, y1: 120, x2: 600, y2: 120 }); // straight to the left edge
  assert.deepEqual(connectorLine({ x: 400, y: 300 }, box), { x1: 400, y1: 300, x2: 600, y2: 200 }); // to the bottom-left corner
  assert.deepEqual(connectorLine({ x: 800, y: 300 }, box), { x1: 800, y1: 300, x2: 800, y2: 200 }); // to the bottom edge
  assert.equal(connectorLine({ x: 700, y: 100 }, box), null); // marker inside the label: nothing to draw
  // when the screen resizes the label box moves and the line follows it
  const moved = { left: 300, top: 40, right: 700, bottom: 200 };
  assert.notDeepEqual(connectorLine({ x: 200, y: 120 }, box), connectorLine({ x: 200, y: 120 }, moved));
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
  assert.deepEqual(STARTER_HOTSPOTS.map((h) => h.labelPosition), ['top-right', 'bottom-left', 'top-left', 'bottom-right']);
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
  assert.equal(LABEL_POSITIONS.length, 4);
});

test('the preview keeps only active, complete, placed features in order', () => {
  const p = previewHotspotSection(on([spot({ title: 'a' }), spot({ active: false, title: 'b' }), spot({ pointX: null, title: 'c' }), spot({ title: 'd', pointX: '55.5' })]));
  assert.deepEqual(p.hotspots.map((h) => h.title), ['a', 'd']);
  assert.equal(p.hotspots[1].pointX, 55.5);
  assert.equal(p.placement, 'after_info');
  assert.equal(p.loop, true);
});
