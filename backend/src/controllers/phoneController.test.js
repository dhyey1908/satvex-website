const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const otpService = require('../services/otpService');
const userService = require('../services/userService');
const phoneController = require('./phoneController');

const originalOtpService = { ...otpService };
const originalUserService = { ...userService };

after(() => {
  Object.assign(otpService, originalOtpService);
  Object.assign(userService, originalUserService);
});

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

test('sendOtp: already-verified phone short-circuits without sending (no SNS/cost)', async () => {
  let sendOtpCalled = false;
  otpService.sendOtp = async () => {
    sendOtpCalled = true;
  };
  userService.findById = async () => ({ verifiedPhone: '9876543210', phoneVerifiedAt: new Date().toISOString() });

  const req = { user: { id: 'U1' }, body: { phone: '9876543210' } };
  const res = fakeRes();
  await phoneController.sendOtp(req, res);

  assert.equal(sendOtpCalled, false);
  assert.equal(res.body.data.alreadyVerified, true);
});

test('sendOtp: a new/unverified phone does trigger a send', async () => {
  let sendOtpCalledWith = null;
  otpService.sendOtp = async (phone) => {
    sendOtpCalledWith = phone;
  };
  userService.findById = async () => ({ verifiedPhone: '1111111111', phoneVerifiedAt: new Date().toISOString() });

  const req = { user: { id: 'U1' }, body: { phone: '9876543210' } };
  const res = fakeRes();
  await phoneController.sendOtp(req, res);

  assert.equal(sendOtpCalledWith, '9876543210');
  assert.equal(res.body.data.sent, true);
});

test('verifyOtp: on success, marks the phone verified on the user record', async () => {
  let verifyCalledWith = null;
  let markedUserId = null;
  let markedPhone = null;
  otpService.verifyOtp = async (phone, code) => {
    verifyCalledWith = { phone, code };
  };
  userService.markPhoneVerified = async (userId, phone) => {
    markedUserId = userId;
    markedPhone = phone;
  };

  const req = { user: { id: 'U1' }, body: { phone: '9876543210', code: '123456' } };
  const res = fakeRes();
  await phoneController.verifyOtp(req, res);

  assert.deepEqual(verifyCalledWith, { phone: '9876543210', code: '123456' });
  assert.equal(markedUserId, 'U1');
  assert.equal(markedPhone, '9876543210');
  assert.equal(res.body.data.verified, true);
});

test('verifyOtp: a failed otpService.verifyOtp never marks the phone verified', async () => {
  let markPhoneVerifiedCalled = false;
  otpService.verifyOtp = async () => {
    const AppError = require('../utils/AppError');
    throw new AppError('Incorrect code.', 400, 'OTP_INCORRECT');
  };
  userService.markPhoneVerified = async () => {
    markPhoneVerifiedCalled = true;
  };

  const req = { user: { id: 'U1' }, body: { phone: '9876543210', code: '000000' } };
  const res = fakeRes();
  await assert.rejects(() => phoneController.verifyOtp(req, res));
  assert.equal(markPhoneVerifiedCalled, false);
});
