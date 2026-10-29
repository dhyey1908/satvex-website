// Theme guard. The whole palette lives in src/styles/theme.css ("Lavender &
// Lilac"); this checks that (1) every token has the specified value, (2) the
// colour pairs the UI relies on meet WCAG AA, and (3) nothing else in the app
// hard-codes a colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(src, 'styles', 'theme.css'), 'utf8');
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `--${name} missing from theme.css`);
  return m[1].toLowerCase();
};

const SPEC = {
  'color-bg': '#faf7fd', 'color-surface': '#ffffff', 'color-surface-alt': '#efe6f8', 'color-border': '#e0d2ee',
  'color-primary': '#6b4fa0', 'color-primary-hover': '#583e8a', 'color-primary-dark': '#4f3680', 'color-primary-soft': '#e6daf4',
  'color-primary-contrast': '#ffffff', 'color-accent': '#d9c4f0', 'color-star': '#9b6fd1',
  'color-text': '#2e2338', 'color-text-muted': '#66596f',
  'color-success': '#2f6b48', 'color-success-bg': '#e6f2ea', 'color-warning': '#8a5a12', 'color-warning-bg': '#fbf0da',
  'color-error': '#b3261e', 'color-error-bg': '#fbe5e3',
  'color-announcement-bg': '#6b4fa0', 'color-announcement-text': '#faf7fd',
  'color-footer-bg': '#2a2033', 'color-footer-text': '#f0e8f5', 'color-footer-muted': '#bfb2cc', 'color-footer-border': '#3e3250',
};

test('every Lavender & Lilac token has its specified value', () => {
  for (const [name, value] of Object.entries(SPEC)) assert.equal(token(name), value, `--${name}`);
  assert.match(css, /--color-overlay:\s*rgba\(46, 35, 56, 0\.5\)/);
});

test('shadows are warm plum, never black or grey', () => {
  const shadows = css.match(/--shadow-(?:sm|md|lg):[^;]+;/g);
  assert.equal(shadows.length, 3);
  for (const s of shadows) assert.match(s, /rgba\(46, 35, 56, 0\.(08|12|16)\)/);
  assert.doesNotMatch(shadows.join(''), /rgba\((0|20|9),/);
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio]  (4.5 = normal text, 3 = large text / UI components)
const PAIRS = [
  ['color-text', 'color-bg', 4.5], ['color-text', 'color-surface', 4.5], ['color-text', 'color-surface-alt', 4.5], ['color-text', 'color-primary-soft', 4.5],
  ['color-text-muted', 'color-bg', 4.5], ['color-text-muted', 'color-surface', 4.5], ['color-text-muted', 'color-surface-alt', 4.5], ['color-text-muted', 'color-primary-soft', 4.5],
  ['color-primary-contrast', 'color-primary', 4.5], ['color-primary-contrast', 'color-primary-hover', 4.5],
  ['color-primary-dark', 'color-primary-soft', 4.5], ['color-primary-dark', 'color-surface-alt', 4.5],
  ['color-primary', 'color-bg', 4.5], ['color-primary', 'color-surface', 4.5], ['color-primary', 'color-surface-alt', 4.5], ['color-primary', 'color-primary-soft', 4.5],
  ['color-success', 'color-success-bg', 4.5], ['color-warning', 'color-warning-bg', 4.5], ['color-error', 'color-error-bg', 4.5], ['color-error', 'color-bg', 4.5],
  ['color-announcement-text', 'color-announcement-bg', 4.5],
  ['color-footer-text', 'color-footer-bg', 4.5], ['color-footer-muted', 'color-footer-bg', 4.5], ['color-accent', 'color-footer-bg', 3],
  ['color-outline', 'color-bg', 3], ['color-outline', 'color-surface', 3], ['color-outline', 'color-surface-alt', 3],
  ['color-star', 'color-surface', 3], // stars are decorative, but still readable
];

test('colour pairs meet WCAG AA', () => {
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(token(fg), token(bg));
    assert.ok(r >= min, `${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
  }
});

// Only these may hold a literal colour: the theme itself, the eight real
// product colours (catalog data), a "new colour" form default and a validator
// message. Everything else must use a var(--color-*) token.
// (ColorField edits a product's own colour codes, so its '#000000' fallback is data, not theme.)
const ALLOWED = new Set(['styles/theme.css', 'constants/brandColors.js', 'pages/admin/AdminProductForm.jsx', 'components/ColorField.jsx', 'utils/validators.js']);
const RAW = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'checks' ? [] : walk(p);
    return /\.(css|jsx|js)$/.test(e.name) ? [p] : [];
  });
}

test('no raw hex / rgb / hsl colours outside the theme file', () => {
  const offenders = [];
  for (const file of walk(src)) {
    const rel = path.relative(src, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (RAW.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
});
