// Admin sign-in protection: two-step (authenticator / recovery / password), the
// 5-wrong-attempts lock, the 30-minute session, "log out all devices", and the
// admin middleware re-checking the account on every request.
process.env.JWT_SECRET = 'test-secret-for-admin-auth';
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const userService = require('../services/userService');
const otpService = require('../services/otpService');
const refreshTokenService = require('../services/refreshTokenService');
const { hashPassword } = require('../utils/password');
const { verifyAccessToken, verifyMfaToken, signAccessToken } = require('../utils/jwt');
const { totp, generateSecret } = require('../utils/totp');
const adminSecurity = require('../services/adminSecurityService');
const authController = require('./authController');
const { requireAdmin } = require('../middleware/admin');

const saved = [userService, otpService, refreshTokenService].map((m) => [m, { ...m }]);
after(() => saved.forEach(([m, o]) => Object.assign(m, o)));

let users;
function installFakeStore() {
  userService.findByEmail = async (e) => Object.values(users).find((u) => u.email === e) || null;
  userService.findByVerifiedPhone = async (p) => Object.values(users).find((u) => u.verifiedPhone === p) || null;
  userService.findById = async (id) => users[id] || null;
  userService.markPhoneVerified = async () => {};
  userService.recordFailedAuth = async (id, { max, lockMs }) => {
    const u = users[id];
    u.failedAuthCount = (u.failedAuthCount || 0) + 1;
    if (u.failedAuthCount >= max) {
      u.lockedUntil = new Date(Date.now() + lockMs).toISOString();
      u.failedAuthCount = 0;
      return { locked: true };
    }
    return { locked: false, attemptsLeft: max - u.failedAuthCount };
  };
  userService.clearFailedAuth = async (id) => {
    users[id].failedAuthCount = 0;
    delete users[id].lockedUntil;
  };
  userService.consumeRecoveryCode = async (u, hash) => {
    const list = users[u.userId].totpRecoveryHashes || [];
    if (!list.includes(hash)) return false;
    users[u.userId].totpRecoveryHashes = list.filter((h) => h !== hash);
    return true;
  };
  userService.bumpTokenVersion = async (id) => (users[id].tokenVersion = (users[id].tokenVersion || 0) + 1);
  refreshTokenService.createFamily = async () => 'refresh-token';
  refreshTokenService.revokeAllForUser = async () => {};
}

function fakeRes() {
  const res = { cookies: {}, headers: {}, body: null, status: 200 };
  res.cookie = (n, v, o) => { res.cookies[n] = { v, o }; return res; };
  res.clearCookie = () => res;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const req = (body = {}, extra = {}) => ({ body, headers: { 'user-agent': 'test' }, cookies: {}, ...extra });
const data = (res) => res.body.data;

beforeEach(async () => {
  users = {
    admin: { userId: 'admin', role: 'admin', email: 'admin@satvex.co.in', verifiedPhone: '9876543210', passwordHash: await hashPassword('correct horse'), name: 'Owner' },
    plain: { userId: 'plain', role: 'admin', verifiedPhone: '9000000000' }, // phone-only admin, nothing set up yet
    cust: { userId: 'cust', role: 'customer', verifiedPhone: '9111111111' },
  };
  installFakeStore();
  otpService.verifyOtp = async () => {};
});

test('admin without two-step: password login works, and the UI is told to set it up', async () => {
  const res = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), res);
  assert.equal(data(res).mfaSetupRequired, true);
  const claims = verifyAccessToken(data(res).token);
  assert.equal(claims.role, 'admin');
  assert.ok(claims.exp - claims.iat <= 30 * 60, 'admin session is at most 30 minutes');
  assert.equal(res.cookies.refreshToken, undefined, 'admins get no long-lived refresh token');
  assert.equal(data(res).user.totpSecret, undefined);
});

test('a customer keeps the normal session and refresh token', async () => {
  const res = fakeRes();
  await authController.verifyOtp(req({ phone: '9111111111', code: '123456' }), res);
  const claims = verifyAccessToken(data(res).token);
  assert.ok(claims.exp - claims.iat >= 60 * 60 - 5);
  assert.equal(res.cookies.refreshToken.v, 'refresh-token');
  assert.equal(data(res).mfaSetupRequired, false);
});

test('two-step on: password alone gives no session, only a 5-minute second-step token', async () => {
  users.admin.totpEnabled = true;
  users.admin.totpSecret = generateSecret();
  const res = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), res);
  assert.equal(data(res).mfaRequired, true);
  assert.equal(data(res).token, undefined);
  assert.equal(res.cookies.accessToken, undefined);
  assert.throws(() => verifyAccessToken(data(res).mfaToken), 'a second-step token is not an access token');
  assert.equal(verifyMfaToken(data(res).mfaToken).sub, 'admin');
});

test('the authenticator code completes the sign-in; a wrong one is refused with attempts left', async () => {
  users.admin.totpEnabled = true;
  users.admin.totpSecret = generateSecret();
  const first = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), first);
  const { mfaToken } = data(first);

  await assert.rejects(authController.mfa(req({ mfaToken, code: '000000' }), fakeRes()), (e) => e.code === 'INVALID_MFA' && e.details.attemptsLeft === 4);

  const ok = fakeRes();
  await authController.mfa(req({ mfaToken, code: totp(users.admin.totpSecret) }), ok);
  assert.equal(verifyAccessToken(data(ok).token).role, 'admin');
  assert.equal(users.admin.failedAuthCount, 0, 'success clears the counter');
});

test('a recovery code works once, then never again', async () => {
  users.admin.totpEnabled = true;
  users.admin.totpSecret = generateSecret();
  users.admin.totpRecoveryHashes = [adminSecurity.hashRecovery('abcde-12345')];
  const first = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), first);
  const { mfaToken } = data(first);
  const ok = fakeRes();
  await authController.mfa(req({ mfaToken, recoveryCode: 'ABCDE-12345' }), ok);
  assert.equal(data(ok).usedRecoveryCode, true);
  await assert.rejects(authController.mfa(req({ mfaToken, recoveryCode: 'abcde-12345' }), fakeRes()), (e) => e.code === 'INVALID_MFA');
});

test('five wrong passwords lock the account for 15 minutes, even for the right password', async () => {
  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(authController.login(req({ identifier: 'admin@satvex.co.in', password: 'nope' }), fakeRes()), (e) => e.code === 'INVALID_CREDENTIALS');
  }
  await assert.rejects(authController.login(req({ identifier: 'admin@satvex.co.in', password: 'nope' }), fakeRes()), (e) => e.code === 'ACCOUNT_LOCKED');
  await assert.rejects(authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), fakeRes()), (e) => e.code === 'ACCOUNT_LOCKED' && /15 minute|minute/.test(e.message));
  users.admin.lockedUntil = new Date(Date.now() - 1000).toISOString(); // time passes
  const res = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), res);
  assert.ok(data(res).token);
});

test('five wrong second-step codes also lock the account', async () => {
  users.admin.totpEnabled = true;
  users.admin.totpSecret = generateSecret();
  const first = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), first);
  const { mfaToken } = data(first);
  for (let i = 0; i < 4; i += 1) await assert.rejects(authController.mfa(req({ mfaToken, code: '111111' }), fakeRes()), (e) => e.code === 'INVALID_MFA');
  await assert.rejects(authController.mfa(req({ mfaToken, code: '111111' }), fakeRes()), (e) => e.code === 'ACCOUNT_LOCKED');
  await assert.rejects(authController.mfa(req({ mfaToken, code: totp(users.admin.totpSecret) }), fakeRes()), (e) => e.code === 'ACCOUNT_LOCKED');
});

test('an admin signing in with only a phone code must also give the password (or authenticator code)', async () => {
  const res = fakeRes();
  await authController.verifyOtp(req({ phone: '9876543210', code: '123456' }), res);
  assert.equal(data(res).mfaRequired, true);
  assert.deepEqual(data(res).methods, ['password']);
  assert.equal(res.cookies.accessToken, undefined);

  await assert.rejects(authController.mfa(req({ mfaToken: data(res).mfaToken, password: 'wrong' }), fakeRes()), (e) => e.code === 'INVALID_MFA');
  const ok = fakeRes();
  await authController.mfa(req({ mfaToken: data(res).mfaToken, password: 'correct horse' }), ok);
  assert.equal(verifyAccessToken(data(ok).token).role, 'admin');
});

test('a password is NOT accepted as the second step after a password login (it would be the same factor)', async () => {
  users.admin.totpEnabled = true;
  users.admin.totpSecret = generateSecret();
  const first = fakeRes();
  await authController.login(req({ identifier: 'admin@satvex.co.in', password: 'correct horse' }), first);
  await assert.rejects(authController.mfa(req({ mfaToken: data(first).mfaToken, password: 'correct horse' }), fakeRes()), (e) => e.code === 'INVALID_MFA');
});

test('a phone-only admin with nothing set up still gets in (so they can set it up) and is told to', async () => {
  const res = fakeRes();
  await authController.verifyOtp(req({ phone: '9000000000', code: '123456' }), res);
  assert.equal(data(res).mfaSetupRequired, true);
  assert.ok(data(res).token);
});

test('"Log out all devices" bumps the token version, ending every earlier admin token', async () => {
  const token = signAccessToken({ sub: 'admin', role: 'admin', v: 0 });
  const claims = verifyAccessToken(token);
  await authController.logoutAll({ user: { id: 'admin' }, cookies: {}, headers: {} }, fakeRes());
  assert.equal(users.admin.tokenVersion, 1);

  const next = (err) => (next.err = err);
  await requireAdmin({ user: { id: 'admin', role: 'admin', v: claims.v, iat: claims.iat } }, fakeRes(), next);
  assert.equal(next.err.code, 'UNAUTHENTICATED');
});

test('requireAdmin re-checks the account: a demoted admin is refused even with a valid token', async () => {
  users.admin.role = 'customer';
  const next = (err) => (next.err = err);
  await requireAdmin({ user: { id: 'admin', role: 'admin', v: 0 } }, fakeRes(), next);
  assert.equal(next.err.code, 'FORBIDDEN');
});

test('requireAdmin refuses customers and anonymous callers, and lets a good admin through', async () => {
  const run = async (reqObj) => {
    const next = (err) => (next.err = err || null);
    await requireAdmin(reqObj, fakeRes(), next);
    return next.err;
  };
  assert.equal((await run({})).code, 'UNAUTHENTICATED');
  assert.equal((await run({ user: { id: 'cust', role: 'customer' } })).code, 'FORBIDDEN');
  assert.equal(await run({ user: { id: 'admin', role: 'admin', v: 0 } }), null);
});

test('requireAdmin slides the session: a token older than 5 minutes is replaced via header and cookie', async () => {
  const res = fakeRes();
  const next = (err) => (next.err = err || null);
  await requireAdmin({ user: { id: 'admin', role: 'admin', v: 0, iat: Math.floor(Date.now() / 1000) - 10 * 60 } }, res, next);
  assert.equal(next.err, null);
  assert.ok(res.headers['X-Access-Token']);
  assert.equal(verifyAccessToken(res.headers['X-Access-Token']).role, 'admin');
  const fresh = fakeRes();
  await requireAdmin({ user: { id: 'admin', role: 'admin', v: 0, iat: Math.floor(Date.now() / 1000) - 30 } }, fresh, next);
  assert.equal(fresh.headers['X-Access-Token'], undefined, 'a young token is left alone');
});

test('admin refresh never silently renews', async () => {
  refreshTokenService.rotate = async () => ({ rawToken: 'new', userId: 'admin' });
  await assert.rejects(authController.refresh({ cookies: { refreshToken: 'x' }, headers: {} }, fakeRes()), (e) => e.code === 'REFRESH_INVALID');
});
