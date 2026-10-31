import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  addressTextProblem,
  isJunkText,
  isEnglishAddressText,
  isEnglishName,
  combinedAddress,
  MAX_ADDRESS,
  COUNTER_FROM,
  ENGLISH_MESSAGE,
  JUNK_MESSAGE,
  TOO_LONG_MESSAGE,
  LANDMARK_REQUIRED_MESSAGE,
} from '../utils/addressRules.js';

// The server's copy of the rules (backend/src/utils/addressRules.js) is the one that counts; this browser copy only
// shows the problem while typing. They must agree on every case below.
const require = createRequire(import.meta.url);
const server = require('../../../backend/src/utils/addressRules.js');

const good = { line1: '12 Test Heights, Kalawad Road', landmark: 'Near City Mall' };

test('the address messages are the agreed wording', () => {
  assert.equal(ENGLISH_MESSAGE, 'Please type this in English');
  assert.equal(JUNK_MESSAGE, 'Please enter your full address (house/flat no., street, area).');
  assert.equal(TOO_LONG_MESSAGE, 'Address is too long. Please keep it under 190 characters.');
  assert.equal(MAX_ADDRESS, 190);
  assert.equal(COUNTER_FROM, 160);
});

test('the counter text is "length / 190" of house/street + landmark together', () => {
  const text = combinedAddress('A'.repeat(100), 'B'.repeat(72));
  assert.equal(text.length, 174); // "100 + 2 + 72"
});

test('browser and server rules agree', () => {
  const cases = [
    good,
    { line1: 'मकान नंबर 12', landmark: 'Near City Mall' },
    { line1: '12 Test Heights', landmark: 'सिटी' },
    { line1: 'test', landmark: 'Near City Mall' },
    { line1: 'aaaa', landmark: 'Near City Mall' },
    { line1: '12 Test Heights', landmark: '' },
    { line1: '12 Test Heights', landmark: 'N/A' },
    { line1: 'Plot 5 Road, '.repeat(20), landmark: 'Near the temple' },
    { line1: '1 R', landmark: 'SBI' },
    { line1: '12 Rd', landmark: 'SBI' },
    { line1: '12345 67890', landmark: 'Near 5' },
  ];
  for (const c of cases) {
    const here = addressTextProblem(c);
    const there = server.addressTextProblem(c);
    assert.equal(here?.field ?? null, there?.field ?? null, JSON.stringify(c).slice(0, 50));
    assert.equal(here?.message ?? null, there?.message ?? null, JSON.stringify(c).slice(0, 50));
  }
  for (const word of ['test', 'N/A', 'hello hii', 'Test Heights', '11111', 'Plot 7']) assert.equal(isJunkText(word), server.isJunkText(word), word);
  for (const text of ['12/A Main St.', 'राहुल', 'a;b']) assert.equal(isEnglishAddressText(text), server.isEnglishAddressText(text), text);
  for (const name of ["Rahul O'Neil", 'राहुल', 'Rahul2']) assert.equal(isEnglishName(name), server.isEnglishName(name), name);
});

test('the landmark message is the agreed wording and a missing landmark is refused', () => {
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: '' }).message, LANDMARK_REQUIRED_MESSAGE);
  assert.equal(addressTextProblem(good), null);
});
