// Covers the per-attempt payment audit trail: recordPaymentAttemptInitiated
// (appends) and recordPaymentAttemptResult (resolves a logged attempt by its
// own unique txnid). Mocks the DynamoDB client at the docClient.send level,
// same pattern other service tests in this codebase use when they need to
// inspect exact UpdateCommand parameters.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { docClient } = require('../config/dynamo');
const orderService = require('./orderService');

const originalSend = docClient.send;
let sentCommands;
let findByIdResult;

after(() => {
  docClient.send = originalSend;
});

beforeEach(() => {
  sentCommands = [];
  docClient.send = async (command) => {
    sentCommands.push(command);
    // recordPaymentAttemptResult does its own findById (a GetCommand) before
    // writing — serve it from the test's own fixture.
    if (command.constructor.name === 'GetCommand') {
      return { Item: findByIdResult };
    }
    return {};
  };
});

test('recordPaymentAttemptInitiated: appends via list_append, never overwrites existing attempts', async () => {
  await orderService.recordPaymentAttemptInitiated('ORDER-1', { txnid: 'ORDER-1-2', amount: 500 });
  const cmd = sentCommands.find((c) => c.constructor.name === 'UpdateCommand');
  assert.ok(cmd.input.UpdateExpression.includes('list_append'));
  const [attempt] = cmd.input.ExpressionAttributeValues[':attempt'];
  assert.equal(attempt.txnid, 'ORDER-1-2');
  assert.equal(attempt.status, 'initiated');
  assert.equal(attempt.amount, 500);
  assert.equal(attempt.currency, 'INR');
  assert.ok(attempt.initiatedAt);
});

test('recordPaymentAttemptResult: updates only the matching attempt by txnid, leaves others untouched', async () => {
  findByIdResult = {
    orderId: 'ORDER-1',
    paymentAttempts: [
      { txnid: 'ORDER-1-1', status: 'failure', amount: 500 },
      { txnid: 'ORDER-1-2', status: 'initiated', amount: 500 },
    ],
  };
  await orderService.recordPaymentAttemptResult('ORDER-1', {
    txnid: 'ORDER-1-2',
    status: 'success',
    mihpayid: 'MIHPAY1',
    mode: 'UPI',
    bankRefNum: 'BANKREF1',
  });
  const cmd = sentCommands.find((c) => c.constructor.name === 'UpdateCommand');
  const attempts = cmd.input.ExpressionAttributeValues[':attempts'];
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].txnid, 'ORDER-1-1');
  assert.equal(attempts[0].status, 'failure', 'the earlier attempt is left exactly as it was');
  assert.equal(attempts[1].status, 'success');
  assert.equal(attempts[1].mihpayid, 'MIHPAY1');
  assert.equal(attempts[1].mode, 'UPI');
  assert.equal(attempts[1].bankRefNum, 'BANKREF1');
  assert.ok(attempts[1].completedAt);
});

test('recordPaymentAttemptResult: records a failure reason', async () => {
  findByIdResult = { orderId: 'ORDER-1', paymentAttempts: [{ txnid: 'ORDER-1-1', status: 'initiated', amount: 500 }] };
  await orderService.recordPaymentAttemptResult('ORDER-1', {
    txnid: 'ORDER-1-1',
    status: 'failure',
    errorMessage: 'Authorization failed at Bank',
  });
  const cmd = sentCommands.find((c) => c.constructor.name === 'UpdateCommand');
  const attempts = cmd.input.ExpressionAttributeValues[':attempts'];
  assert.equal(attempts[0].errorMessage, 'Authorization failed at Bank');
});

test('recordPaymentAttemptResult: a no-op when the order no longer exists (never throws)', async () => {
  findByIdResult = undefined;
  await orderService.recordPaymentAttemptResult('GONE', { txnid: 'GONE-1', status: 'success' });
  // No UpdateCommand should have been sent past the initial GetCommand.
  assert.equal(sentCommands.filter((c) => c.constructor.name === 'UpdateCommand').length, 0);
});
