import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActionRunner } from '../utils/actionRunner.js';

function harness(overrides = {}) {
  const events = [];
  const runner = createActionRunner({
    show: ({ key, label }) => events.push(['show', key, label]),
    hide: (key) => events.push(['hide', key]),
    wait: async (startedAt, min) => events.push(['wait', min]),
    ...overrides,
  });
  return { events, runner };
}

test('shows at once, holds the minimum on success, then hides', async () => {
  const { events, runner } = harness();
  const result = await runner('pay', async () => 42, { label: 'Paying…', min: 900 });
  assert.equal(result, 42);
  assert.deepEqual(events, [['show', 'pay', 'Paying…'], ['wait', 900], ['hide', 'pay']]);
});

test('an error hides the loader immediately (no minimum wait) and is rethrown', async () => {
  const { events, runner } = harness();
  await assert.rejects(() => runner('pay', async () => { throw new Error('declined'); }), /declined/);
  assert.deepEqual(events, [['show', 'pay', 'Please wait…'], ['hide', 'pay']]);
});

test('a double click joins the running action: ONE request, ONE loader', async () => {
  const { events, runner } = harness();
  let calls = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const first = runner('pay', async () => { calls += 1; await gate; return 'ok'; });
  const second = runner('pay', async () => { calls += 1; return 'second'; });
  assert.strictEqual(first, second);
  release();
  assert.equal(await first, 'ok');
  assert.equal(calls, 1);
  assert.equal(events.filter((e) => e[0] === 'show').length, 1);
});

test('the same key can run again once the first has finished', async () => {
  const { runner } = harness();
  await runner('pay', async () => 1);
  assert.equal(await runner('pay', async () => 2), 2);
});

test('keepOpen leaves the loader up when the browser is about to leave the page', async () => {
  const { events, runner } = harness();
  await runner('pay', async () => ({ redirected: true }), { keepOpen: (r) => r.redirected });
  assert.deepEqual(events.map((e) => e[0]), ['show']);
});

test('the loader is never hidden before the action has finished', async () => {
  const { events, runner } = harness();
  let release;
  const gate = new Promise((r) => (release = r));
  const p = runner('pay', () => gate);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(events.map((e) => e[0]), ['show']);
  release();
  await p;
  assert.equal(events.at(-1)[0], 'hide');
});
