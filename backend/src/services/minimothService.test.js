const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../config/env');
const { docClient } = require('../config/dynamo');
const minimoth = require('./minimothService');
const otpService = require('./otpService');

// ---- fakes -----------------------------------------------------------------

const realFetch = global.fetch;
const realSend = docClient.send.bind(docClient);

function installFetch(handler) {
  const calls = [];
  global.fetch = async (url, init) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const { status = 200, json } = await handler(call, calls.length);
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return calls;
}

// In-memory stand-in for the OTP table (Get/Put/Delete by phone).
function installTable() {
  const rows = new Map();
  docClient.send = async (cmd) => {
    const name = cmd.constructor.name;
    if (name === 'GetCommand') return { Item: rows.get(cmd.input.Key.phone) };
    if (name === 'PutCommand') {
      rows.set(cmd.input.Item.phone, cmd.input.Item);
      return {};
    }
    if (name === 'DeleteCommand') {
      rows.delete(cmd.input.Key.phone);
      return {};
    }
    throw new Error(`unexpected command ${name}`);
  };
  return rows;
}

const originalTestMode = env.otp.testMode;

function setup({ provider = 'minimoth', apiKey = 'mm_test_abc', testPhones = [] } = {}) {
  // A developer's local .env may enable the blanket test bypass; these tests
  // are about the real provider path.
  env.otp.testMode = false;
  env.minimoth.apiKey = apiKey;
  env.otp.provider = provider;
  env.otp.testPhones = testPhones;
}

test.afterEach(() => {
  global.fetch = realFetch;
  docClient.send = realSend;
  env.minimoth.apiKey = '';
  env.otp.provider = 'sns';
  env.otp.testPhones = [];
  env.otp.testMode = originalTestMode;
});

const fail = (status, code) => ({ status, json: { error: `msg ${code}`, code, request_id: 'req_1' } });
const rejects = (promise, code, status) =>
  assert.rejects(promise, (err) => err.code === code && (status === undefined || err.statusCode === status));

// ---- client ----------------------------------------------------------------

test('send: POSTs the +91 number with the API key header and returns the otp id', async () => {
  setup();
  const calls = installFetch(() => ({ json: { otp_id: 'otp_1', expires_at: '2026-10-14T10:00:00Z' } }));
  const result = await minimoth.sendOtp('9876543210');

  assert.deepEqual(result, { otpId: 'otp_1', expiresAt: '2026-10-14T10:00:00Z' });
  assert.equal(calls[0].url, 'https://api.minimoth.dev/v1/otp/send');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['X-Api-Key'], 'mm_test_abc');
  assert.deepEqual(calls[0].body, { phone: '+919876543210' });
});

test('verify: sends phone + code and returns the provider access token', async () => {
  setup();
  const calls = installFetch(() => ({ json: { access_token: 'at_1', refresh_token: 'rt_1', expires_at: 'x' } }));
  const result = await minimoth.verifyOtp('9876543210', '123456');
  assert.deepEqual(result, { accessToken: 'at_1' });
  assert.deepEqual(calls[0].body, { phone: '+919876543210', code: '123456' });
  assert.equal(calls[0].url, 'https://api.minimoth.dev/v1/otp/verify');
});

test('send: provider errors become friendly, correctly-coded AppErrors', async () => {
  setup();
  installFetch(() => fail(429, 'OTP_RATE_LIMITED'));
  await rejects(minimoth.sendOtp('9876543210'), 'OTP_SEND_LIMIT', 429);

  installFetch(() => fail(422, 'INVALID_PHONE'));
  await rejects(minimoth.sendOtp('9876543210'), 'INVALID_PHONE', 400);

  installFetch(() => fail(500, 'SMS_FAILED'));
  await rejects(minimoth.sendOtp('9876543210'), 'OTP_DELIVERY_FAILED', 502);
});

test('operator problems (bad key, no balance) are hidden behind a generic unavailable error', async () => {
  setup();
  for (const [status, code] of [[401, 'INVALID_API_KEY'], [402, 'INSUFFICIENT_BALANCE'], [401, 'MISSING_API_KEY']]) {
    installFetch(() => fail(status, code));
    await assert.rejects(minimoth.sendOtp('9876543210'), (err) => {
      assert.equal(err.code, 'OTP_PROVIDER_UNAVAILABLE');
      assert.equal(err.statusCode, 503);
      // The customer-facing message must not leak billing / credential detail.
      assert.doesNotMatch(err.message, /balance|key|INSUFFICIENT|INVALID_API/i);
      return true;
    });
  }
});

test('verify: wrong code, expired code and lockout map to the existing OTP error codes', async () => {
  setup();
  installFetch(() => fail(400, 'INVALID_OTP'));
  await rejects(minimoth.verifyOtp('9876543210', '000000'), 'OTP_INCORRECT', 400);
  installFetch(() => fail(400, 'OTP_NOT_FOUND'));
  await rejects(minimoth.verifyOtp('9876543210', '000000'), 'OTP_NOT_FOUND', 400);
  installFetch(() => fail(429, 'VERIFY_RATE_LIMITED'));
  await rejects(minimoth.verifyOtp('9876543210', '000000'), 'OTP_TOO_MANY_ATTEMPTS', 429);
});

test('network failure -> 503 unavailable, never a raw error', async () => {
  setup();
  global.fetch = async () => {
    throw new Error('ECONNRESET');
  };
  await rejects(minimoth.sendOtp('9876543210'), 'OTP_PROVIDER_UNAVAILABLE', 503);
});

test('no API key configured -> unavailable, and nothing is sent', async () => {
  setup({ apiKey: '' });
  const calls = installFetch(() => ({ json: {} }));
  await rejects(minimoth.sendOtp('9876543210'), 'OTP_PROVIDER_UNAVAILABLE', 503);
  assert.equal(calls.length, 0);
});

// ---- OTP service integration -----------------------------------------------

test('otpService: send via MiniMoth stores a marker (no code), verify succeeds and ends the provider session', async () => {
  setup();
  const rows = installTable();
  const calls = installFetch((call) => {
    if (call.url.endsWith('/otp/send')) return { json: { otp_id: 'otp_9', expires_at: 'x' } };
    if (call.url.endsWith('/otp/verify')) return { json: { access_token: 'at_9', refresh_token: 'rt', expires_at: 'x' } };
    return { json: { success: true } };
  });

  await otpService.sendOtp('9876543210');
  const row = rows.get('9876543210');
  assert.equal(row.provider, 'minimoth');
  assert.equal(row.otpId, 'otp_9');
  assert.equal('codeHash' in row, false, 'the code itself must not be stored');

  await otpService.verifyOtp('9876543210', '654321');
  assert.equal(rows.has('9876543210'), false, 'record removed after a successful verify');
  const logout = calls.find((c) => c.url.endsWith('/session/logout'));
  assert.ok(logout, 'provider session is revoked');
  assert.deepEqual(logout.body, { access_token: 'at_9' });
});

test('otpService: a second send within the cooldown never reaches MiniMoth', async () => {
  setup();
  installTable();
  const calls = installFetch(() => ({ json: { otp_id: 'o', expires_at: 'x' } }));
  await otpService.sendOtp('9876543210');
  await rejects(otpService.sendOtp('9876543210'), 'OTP_COOLDOWN', 429);
  assert.equal(calls.length, 1);
});

test('otpService: a failed send leaves no cooldown, so the customer can retry straight away', async () => {
  setup();
  const rows = installTable();
  installFetch(() => fail(500, 'SMS_FAILED'));
  await rejects(otpService.sendOtp('9876543210'), 'OTP_DELIVERY_FAILED', 502);
  assert.equal(rows.size, 0);
});

test('otpService: verify without a prior send is rejected locally (no provider call)', async () => {
  setup();
  installTable();
  const calls = installFetch(() => ({ json: {} }));
  await rejects(otpService.verifyOtp('9876543210', '123456'), 'OTP_NOT_FOUND', 400);
  assert.equal(calls.length, 0);
});

test('otpService: lockout from MiniMoth locks the local record (kept, so the send counters survive)', async () => {
  setup();
  const rows = installTable();
  installFetch((call) => (call.url.endsWith('/otp/send') ? { json: { otp_id: 'o', expires_at: 'x' } } : fail(429, 'VERIFY_RATE_LIMITED')));
  await otpService.sendOtp('9876543210');
  await rejects(otpService.verifyOtp('9876543210', '111111'), 'OTP_TOO_MANY_ATTEMPTS', 429);
  assert.equal(rows.get('9876543210').locked, true);
});

test('otpService: fixed-code test numbers never touch MiniMoth', async () => {
  setup({ testPhones: ['9913685802'] });
  installTable();
  const calls = installFetch(() => ({ json: {} }));
  await otpService.sendOtp('9913685802');
  await otpService.verifyOtp('9913685802', '123456');
  assert.equal(calls.length, 0);
});

test('otpService: provider=sns keeps the original behaviour even when a key is present', async () => {
  setup({ provider: 'sns' });
  installTable();
  const calls = installFetch(() => ({ json: {} }));
  // test-number path stands in for "local code" so no real SNS call is made
  env.otp.testPhones = ['9000000000'];
  await otpService.sendOtp('9000000000');
  await otpService.verifyOtp('9000000000', '123456');
  assert.equal(calls.length, 0);
});

// ---- limits, countdowns and messages ---------------------------------------

// Pretend `ms` has passed since this number's last send / first send.
function age(rows, phone, ms) {
  const r = rows.get(phone);
  rows.set(phone, { ...r, createdAt: new Date(new Date(r.createdAt).getTime() - ms).toISOString(), windowStartedAt: r.windowStartedAt - ms });
}
const okSend = () => installFetch(() => ({ json: { otp_id: 'o', expires_at: 'x' } }));

test('send returns the resend countdown and how many codes are left', async () => {
  setup();
  installTable();
  okSend();
  const first = await otpService.sendOtp('9876543210');
  assert.deepEqual(first, { resendAfterSeconds: 60, sendsRemaining: 2 });
});

test('resend inside the cooldown: precise wait + details for the UI timer', async () => {
  setup();
  installTable();
  okSend();
  await otpService.sendOtp('9876543210');
  await assert.rejects(otpService.sendOtp('9876543210'), (err) => {
    assert.equal(err.code, 'OTP_COOLDOWN');
    assert.equal(err.statusCode, 429);
    assert.ok(err.details.retryAfterSeconds >= 1 && err.details.retryAfterSeconds <= 60);
    assert.match(err.message, /Please wait \d+ seconds? before requesting another code\./);
    assert.equal(err.details.canUseLatestCode, true);
    return true;
  });
});

test('the 4th code inside 10 minutes is refused by OUR side, MiniMoth is never called, latest code still works', async () => {
  setup();
  const rows = installTable();
  const calls = installFetch((call) =>
    call.url.endsWith('/otp/send') ? { json: { otp_id: `o${Math.random()}`, expires_at: 'x' } } : { json: { access_token: 'at' } }
  );

  await otpService.sendOtp('9876543210');
  age(rows, '9876543210', 70_000);
  await otpService.sendOtp('9876543210');
  age(rows, '9876543210', 70_000);
  const third = await otpService.sendOtp('9876543210');
  assert.equal(third.sendsRemaining, 0);
  age(rows, '9876543210', 70_000);

  const sendsBefore = calls.filter((c) => c.url.endsWith('/otp/send')).length;
  assert.equal(sendsBefore, 3);
  await assert.rejects(otpService.sendOtp('9876543210'), (err) => {
    assert.equal(err.code, 'OTP_SEND_LIMIT');
    assert.equal(err.statusCode, 429);
    assert.equal(err.details.canUseLatestCode, true);
    assert.match(err.message, /maximum of 3 codes/);
    assert.match(err.message, /minutes?\./);
    assert.match(err.message, /You can still use the latest code we sent\./);
    assert.ok(err.details.retryAfterSeconds > 0 && err.details.retryAfterSeconds <= 600);
    return true;
  });
  assert.equal(calls.filter((c) => c.url.endsWith('/otp/send')).length, 3, 'no 4th provider call');

  // the code from send #3 is still verifiable
  await otpService.verifyOtp('9876543210', '123456');
});

test('after the 10-minute window passes, sending works again with a fresh count', async () => {
  setup();
  const rows = installTable();
  okSend();
  for (let i = 0; i < 3; i += 1) {
    await otpService.sendOtp('9876543210');
    age(rows, '9876543210', 70_000);
  }
  age(rows, '9876543210', 10 * 60 * 1000);
  const again = await otpService.sendOtp('9876543210');
  assert.equal(again.sendsRemaining, 2);
});

test('wrong code: tells the customer how many attempts are left, then locks', async () => {
  setup();
  installTable();
  installFetch((call) => (call.url.endsWith('/otp/send') ? { json: { otp_id: 'o', expires_at: 'x' } } : fail(400, 'INVALID_OTP')));
  await otpService.sendOtp('9876543210');

  for (const left of [4, 3, 2, 1]) {
    await assert.rejects(otpService.verifyOtp('9876543210', '000000'), (err) => {
      assert.equal(err.code, 'OTP_INCORRECT');
      assert.equal(err.details.attemptsRemaining, left);
      assert.equal(err.message, `That code isn't correct. ${left} attempt${left === 1 ? '' : 's'} left.`);
      return true;
    });
  }
  await assert.rejects(otpService.verifyOtp('9876543210', '000000'), (err) => {
    assert.equal(err.code, 'OTP_TOO_MANY_ATTEMPTS');
    assert.equal(err.statusCode, 429);
    assert.match(err.message, /locked/);
    return true;
  });
  // further tries are refused locally, without asking MiniMoth again
  const calls = installFetch(() => ({ json: {} }));
  await rejects(otpService.verifyOtp('9876543210', '123456'), 'OTP_TOO_MANY_ATTEMPTS', 429);
  assert.equal(calls.length, 0);
});

test('a locked code keeps the send counters, so locking cannot be used to dodge the 3-code cap', async () => {
  setup();
  const rows = installTable();
  installFetch((call) => (call.url.endsWith('/otp/send') ? { json: { otp_id: 'o', expires_at: 'x' } } : fail(400, 'INVALID_OTP')));
  await otpService.sendOtp('9876543210');
  for (let i = 0; i < 5; i += 1) await otpService.verifyOtp('9876543210', '000000').catch(() => {});
  assert.equal(rows.get('9876543210').locked, true);
  assert.equal(rows.get('9876543210').sendCount, 1);

  age(rows, '9876543210', 70_000);
  const next = await otpService.sendOtp('9876543210');
  assert.equal(next.sendsRemaining, 1, 'counter continued (2 of 3 used), not reset');
  assert.equal(rows.get('9876543210').locked, false, 'a fresh code starts unlocked');
  assert.equal(rows.get('9876543210').attempts, 0);
});

test('an expired code asks for a new one', async () => {
  setup();
  const rows = installTable();
  okSend();
  await otpService.sendOtp('9876543210');
  const r = rows.get('9876543210');
  rows.set('9876543210', { ...r, expiresAt: Math.floor(Date.now() / 1000) - 5 });
  await assert.rejects(otpService.verifyOtp('9876543210', '123456'), (err) => {
    assert.equal(err.code, 'OTP_EXPIRED');
    assert.match(err.message, /expired/);
    return true;
  });
});

test('error details reach the client through the error handler', () => {
  const { errorHandler } = require('../middleware/errorHandler');
  const AppError = require('../utils/AppError');
  let out;
  const res = { status: () => ({ json: (body) => { out = body; } }) };
  errorHandler(new AppError('wait', 429, 'OTP_COOLDOWN', { retryAfterSeconds: 42 }), { path: '/x' }, res, () => {});
  assert.deepEqual(out.error, { code: 'OTP_COOLDOWN', message: 'wait', details: { retryAfterSeconds: 42 } });
  errorHandler(new AppError('plain', 400, 'BAD'), { path: '/x' }, res, () => {});
  assert.equal('details' in out.error, false);
});
