const { PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');

const TABLE = env.tables.shipmentJobs;
const STATUS_INDEX = 'status-nextAttemptAt-index';

const MAX_ATTEMPTS = 6;
// Backoff schedule in minutes, indexed by attempts-so-far — stays within the
// approved 5-15 min sweep window after the first retry (the immediate
// in-request attempt is attempt 0, happens at order-paid time, not here).
const BACKOFF_MINUTES = [5, 10, 15, 15, 15, 15];

// One job per order (jobId === orderId) — a shipment either needs creating
// or it doesn't, so there's no scenario needing more than one in-flight job
// per order. The condition makes this safe to call every time an order
// becomes paid/confirmed without risking a duplicate job from a retry of
// that same code path.
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
          lastError: null,
          nextAttemptAt: now,
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

// Due jobs for the sweep: status='pending' and nextAttemptAt in the past.
// Query against the GSI, not a Scan — mirrors orderService.listExpiryCandidates.
async function listDueJobs(nowIso) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: '#status = :status AND nextAttemptAt <= :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'pending', ':now': nowIso },
      Limit: 50,
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

// Records a failed attempt. Stays 'pending' (with backoff pushed forward) as
// long as attempts remain; flips to 'failed' once exhausted, which is what
// the admin "retry shipment" button looks for.
async function recordFailure(jobId, attemptsSoFar, error) {
  const now = new Date();
  const nextAttempts = attemptsSoFar + 1;
  const exhausted = nextAttempts >= MAX_ATTEMPTS;
  const backoffMin = BACKOFF_MINUTES[Math.min(attemptsSoFar, BACKOFF_MINUTES.length - 1)];
  const nextAttemptAt = new Date(now.getTime() + backoffMin * 60 * 1000).toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { jobId },
      UpdateExpression: 'SET #status = :status, attempts = :attempts, lastError = :error, nextAttemptAt = :nextAttemptAt, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': exhausted ? 'failed' : 'pending',
        ':attempts': nextAttempts,
        ':error': String(error).slice(0, 500),
        ':nextAttemptAt': nextAttemptAt,
        ':now': now.toISOString(),
      },
    })
  );
}

// Admin-triggered manual retry — resets the attempt budget so a job that
// exhausted its automatic retries gets a fresh run, not just one more.
async function resetForManualRetry(jobId) {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { jobId },
      UpdateExpression: 'SET #status = :pending, attempts = :zero, lastError = :null, nextAttemptAt = :now, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending', ':zero': 0, ':null': null, ':now': now },
    })
  );
}

module.exports = {
  MAX_ATTEMPTS,
  createJob,
  findByOrderId,
  listDueJobs,
  markDone,
  recordFailure,
  resetForManualRetry,
};
