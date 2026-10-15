// The Shiprocket webhook must be reachable at a URL without brand words
// (their panel rejects those) and still at the original path.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const router = require('./index');

const mountedPaths = () =>
  router.stack
    .filter((l) => l.name === 'router')
    .map((l) => String(l.regexp))
    .join(' ');

test('the courier webhook is mounted at /courier and at /shiprocket', () => {
  const m = mountedPaths();
  assert.match(m, /courier/);
  assert.match(m, /shiprocket/);
});
