const { PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.shipmentJobs;
const STATUS_INDEX = 'status-nextAttemptAt-index';

// Capped-retry DynamoDB job queue for Shiprocket shipment creation,
// mirroring expirePayments.js's existing scheduled-sweep pattern exactly.
// jobId === orderId (natural 1:1 key) — a conditional PutCommand makes
// createJob idempotent, so a duplicate webhook or a retried immediate
// attempt can never enqueue two jobs for the same order.
const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [5, 10, 15, 15, 15, 15];

async function createJob(orderId) {
  const now = new Date().toISOString();
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          jobId: orderId,
          orderId,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: 'attribute_not_exists(jobId)',
      })
    );
    return { created: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { created: false };
    throw err;
  }
}

async function findByOrderId(orderId) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE, Key: { jobId: orderId } }));
  return result.Item || null;
}

// Queried by the scheduled sweep — only jobs whose nextAttemptAt has
// already passed, via the GSI (never a Scan).
async function listDueJobs(nowIso) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: '#status = :pending AND nextAttemptAt <= :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending', ':now': nowIso },
    })
  );
  return result.Items || [];
}

async function markDone(jobId) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { jobId },
      UpdateExpression: 'SET #status = :done, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':done': 'done', ':now': new Date().toISOString() },
    })
  );
}

// Called on a failed attempt. Flips to 'failed' (visible in the admin
// failed-jobs list) once MAX_ATTEMPTS is exhausted, otherwise reschedules
// with capped exponential backoff. Returns whether THIS call is the one
// that just pushed the job into terminal 'failed' — the caller (shipmentSweep)
// uses that to fire the admin alert exactly once, not on every backoff step.
async function recordFailure(jobId, attemptsSoFar, error) {
  const attempts = attemptsSoFar + 1;
  const now = new Date().toISOString();
  if (attempts >= MAX_ATTEMPTS) {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { jobId },
        UpdateExpression: 'SET #status = :failed, attempts = :attempts, lastError = :err, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':failed': 'failed', ':attempts': attempts, ':err': error?.message || 'Unknown error', ':now': now },
      })
    );
    return { failed: true };
  }
  const backoffMin = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  const nextAttemptAt = new Date(Date.now() + backoffMin * 60 * 1000).toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { jobId },
      UpdateExpression: 'SET attempts = :attempts, nextAttemptAt = :next, lastError = :err, updatedAt = :now',
      ExpressionAttributeValues: { ':attempts': attempts, ':next': nextAttemptAt, ':err': error?.message || 'Unknown error', ':now': now },
    })
  );
  return { failed: false };
}

// Admin "Retry Shipment" button — resets a failed (or still-pending) job to
// try again immediately.
async function resetForManualRetry(jobId) {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { jobId },
      UpdateExpression: 'SET #status = :pending, attempts = :zero, nextAttemptAt = :now, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending', ':zero': 0, ':now': new Date().toISOString() },
    })
  );
}

async function listFailedJobs() {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: '#status = :failed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':failed': 'failed' },
    })
  );
  return result.Items || [];
}

module.exports = { createJob, findByOrderId, listDueJobs, markDone, recordFailure, resetForManualRetry, listFailedJobs, MAX_ATTEMPTS };
