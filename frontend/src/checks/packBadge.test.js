import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packBadge } from '../utils/packBadge.js';

const legacy = { featuredOptionId: 'opt_combo3', featuredOptionLabel: 'Best Value' };

test('a badge set in the admin wins, and a blank one means no badge', () => {
  assert.equal(packBadge({ id: 'a', badgeLabel: 'Most Popular' }, legacy), 'Most Popular');
  assert.equal(packBadge({ id: 'opt_combo3', badgeLabel: '' }, legacy), ''); // admin removed it
  assert.equal(packBadge({ id: 'a', badgeLabel: '  ' }, legacy), '');
});

test('packs saved before badges were editable keep the old fixed badge until the next save', () => {
  assert.equal(packBadge({ id: 'opt_combo3' }, legacy), 'Best Value');
  assert.equal(packBadge({ id: 'other' }, legacy), '');
  assert.equal(packBadge({ id: 'opt_combo3' }, {}), '');
});
