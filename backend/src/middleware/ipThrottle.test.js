const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ipThrottle, WINDOW_SECONDS, keyFor } = require('./ipThrottle');

// In-memory stand-in for the atomic ADD counter.
function fakeClient() {
  const counts = new Map();
  return {
    async send(cmd) {
      const { Key, ExpressionAttributeValues } = cmd.input;
      const hits = (counts.get(Key.phone) || 0) + ExpressionAttributeValues[':one'];
      counts.set(Key.phone, hits);
      return { Attributes: { hits, expiresAt: ExpressionAttributeValues[':exp'] } };
    },
  };
}

function run(mw, ip = '1.2.3.4') {
  return new Promise((resolve) => {
    const headers = {};
    const res = { set: (k, v) => (headers[k] = v) };
    mw({ ip }, res, (err) => resolve({ err, headers }));
  });
}

test('lets traffic through up to the ceiling, then 429 RATE_LIMITED with retryAfterSeconds', async () => {
  const mw = ipThrottle({ action: 'send', max: 3, message: 'slow down', client: fakeClient(), now: () => 1_000_000_000 });
  for (let i = 0; i < 3; i += 1) assert.equal((await run(mw)).err, undefined);
  const { err, headers } = await run(mw);
  assert.equal(err.statusCode, 429);
  assert.equal(err.code, 'RATE_LIMITED');
  assert.ok(err.details.retryAfterSeconds >= 1 && err.details.retryAfterSeconds <= WINDOW_SECONDS);
  assert.equal(headers['Retry-After'], String(err.details.retryAfterSeconds));
});

test('send and verify budgets are separate, and so are different IPs', async () => {
  const client = fakeClient();
  const send = ipThrottle({ action: 'send', max: 1, message: 'm', client });
  const verify = ipThrottle({ action: 'verify', max: 1, message: 'm', client });
  assert.equal((await run(send)).err, undefined);
  assert.equal((await run(verify)).err, undefined);
  assert.equal((await run(send, '9.9.9.9')).err, undefined);
  assert.ok((await run(send)).err);
});

test('a new 15-minute window starts a fresh count', async () => {
  let t = 1_000_000_000;
  const mw = ipThrottle({ action: 'send', max: 1, message: 'm', client: fakeClient(), now: () => t });
  assert.equal((await run(mw)).err, undefined);
  assert.ok((await run(mw)).err);
  t += (WINDOW_SECONDS + 1) * 1000;
  assert.equal((await run(mw)).err, undefined);
});

test('fails open when DynamoDB errors', async () => {
  const client = {
    send: async () => {
      throw new Error('ProvisionedThroughputExceeded');
    },
  };
  const mw = ipThrottle({ action: 'send', max: 1, message: 'm', client });
  assert.equal((await run(mw)).err, undefined);
});

test('the raw IP is never stored in the key', () => {
  assert.doesNotMatch(keyFor('203.0.113.7', 'send', 5), /203\.0\.113\.7/);
});
