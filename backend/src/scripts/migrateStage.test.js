const test = require('node:test');
const assert = require('node:assert/strict');
const { deepReplace, parseArgs, DATA_TABLES, SESSION_TABLES, tableName } = require('./migrateStage');

test('deepReplace rewrites strings nested in objects and arrays and counts them', () => {
  const oldCdn = 'https://old.cloudfront.net';
  const newCdn = 'https://new.cloudfront.net';
  const product = {
    name: 'Butterfly',
    images: [`${oldCdn}/satvex/products/a.jpg`, `${oldCdn}/satvex/products/b.jpg`],
    variants: [{ colorName: 'Black', image: `${oldCdn}/satvex/variants/v.jpg` }],
    testimonialVideos: [{ videoUrl: `${oldCdn}/satvex/videos/1.mp4`, thumbnailUrl: '' }],
    basePrice: 249,
    isActive: true,
    nothing: null,
  };
  const { value, count } = deepReplace(product, [[oldCdn, newCdn]]);
  assert.equal(count, 4);
  assert.deepEqual(value.images, [`${newCdn}/satvex/products/a.jpg`, `${newCdn}/satvex/products/b.jpg`]);
  assert.equal(value.variants[0].image, `${newCdn}/satvex/variants/v.jpg`);
  assert.equal(value.testimonialVideos[0].videoUrl, `${newCdn}/satvex/videos/1.mp4`);
  // untouched values keep their type
  assert.equal(value.basePrice, 249);
  assert.equal(value.isActive, true);
  assert.equal(value.nothing, null);
  // the input is not mutated
  assert.ok(product.images[0].startsWith(oldCdn));
});

test('deepReplace with no replacements is a no-op', () => {
  const row = { a: 'x', b: ['y'] };
  const { value, count } = deepReplace(row, []);
  assert.deepEqual(value, row);
  assert.equal(count, 0);
});

test('argument parsing and safety rules', () => {
  const a = parseArgs(['--from', 'dev', '--to', 'prod', '--dry-run', '--replace', 'https://a.b=https://c.d?x=1']);
  assert.equal(a.from, 'dev');
  assert.equal(a.to, 'prod');
  assert.equal(a.dryRun, true);
  assert.deepEqual(a.replace, [['https://a.b', 'https://c.d?x=1']], 'only the first = splits old from new');
  assert.throws(() => parseArgs(['--bogus']));
  assert.throws(() => parseArgs(['--replace', 'nothing']));
});

test('table names follow the stack naming and sessions are excluded by default', () => {
  assert.equal(tableName('orders', 'prod'), 'satvex_orders_prod');
  assert.equal(DATA_TABLES.length, 12);
  for (const t of SESSION_TABLES) assert.equal(DATA_TABLES.includes(t), false);
});
