import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkProblem, pickerValue } from '../utils/linkTargets.js';

const products = [{ slug: 'butterfly-claw-clip' }];

test('links are checked against real pages and products', () => {
  assert.equal(linkProblem('', products), '');
  assert.equal(linkProblem('/shop', products), '');
  assert.equal(linkProblem('/shop/', products), '');
  assert.equal(linkProblem('/product/butterfly-claw-clip', products), '');
  assert.match(linkProblem('/product/nope', products), /No product/);
  assert.match(linkProblem('/shpo', products), /not a page/);
  assert.match(linkProblem('shop', products), /Start with/);
  assert.equal(linkProblem('https://example.com/x', products), '');
  assert.match(linkProblem('http://example.com', products), /https/);
  assert.equal(linkProblem('/product/anything', null), ''); // products not loaded yet
});

test('the picker shows custom for anything it has no entry for', () => {
  assert.equal(pickerValue('', products), '');
  assert.equal(pickerValue('/about', products), '/about');
  assert.equal(pickerValue('/product/butterfly-claw-clip', products), '/product/butterfly-claw-clip');
  assert.equal(pickerValue('/shop?x=1', products), 'custom');
});
