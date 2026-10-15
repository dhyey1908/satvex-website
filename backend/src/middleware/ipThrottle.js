// Per-IP ceiling for the OTP endpoints, shared across every Lambda container.
//
// express-rate-limit keeps its counters in process memory, and each Lambda
// container has its own: the real limit becomes (ceiling x number of warm
// containers) and resets on every cold start - not a dependable guard against
// someone cycling through numbers to burn SMS credit. This keeps one atomic
// counter per (IP, action, 15-minute window) in the OTP table instead.
//
// The ceilings are generous on purpose. Mobile carriers put thousands of
// customers behind a handful of NAT addresses, so a tight per-IP cap would
// lock real shoppers out; the per-NUMBER limits in otpService do the precise
// work (60 s cooldown, 3 codes / 10 min, 5 attempts per code).
//
// Fails OPEN: if DynamoDB is unreachable the request is let through, because
// blocking every login on a throttle outage is worse than a missed throttle.
const crypto = require('node:crypto');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const WINDOW_SECONDS = 15 * 60;

// The raw IP is never stored: a short digest is enough to tell callers apart.
const keyFor = (ip, action, bucket) => {
  const digest = crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 24);
  return `ip#${digest}#${action}#${bucket}`;
};

function ipThrottle({ action, max, message, now = () => Date.now(), client = docClient }) {
  return async function ipThrottleMiddleware(req, res, next) {
    try {
      const nowSec = Math.floor(now() / 1000);
      const bucket = Math.floor(nowSec / WINDOW_SECONDS);
      const windowEnd = (bucket + 1) * WINDOW_SECONDS;

      const result = await client.send(
        new UpdateCommand({
          TableName: env.tables.otpCodes,
          Key: { phone: keyFor(req.ip, action, bucket) },
          // ADD is atomic, so concurrent Lambdas never lose a count. The row
          // is dead once its window ends; TTL (epoch seconds) sweeps it later.
          UpdateExpression: 'ADD hits :one SET expiresAt = :exp',
          ExpressionAttributeValues: { ':one': 1, ':exp': windowEnd + WINDOW_SECONDS },
          ReturnValues: 'UPDATED_NEW',
        })
      );

      if (Number(result?.Attributes?.hits) > max) {
        const retryAfterSeconds = Math.max(1, windowEnd - nowSec);
        res.set('Retry-After', String(retryAfterSeconds));
        return next(new AppError(message, 429, 'RATE_LIMITED', { retryAfterSeconds }));
      }
    } catch (err) {
      logger.warn('IP throttle unavailable, allowing request', { action, message: err.message });
    }
    return next();
  };
}

// Ceilings per IP per 15 minutes: far above any one household or office, low
// enough to stop a script walking number lists.
const otpSendThrottle = ipThrottle({
  action: 'send',
  max: 40,
  message: 'Too many code requests from this network. Please try again in a few minutes.',
});

const otpVerifyThrottle = ipThrottle({
  action: 'verify',
  max: 200,
  message: 'Too many verification attempts from this network. Please try again in a few minutes.',
});

module.exports = { ipThrottle, otpSendThrottle, otpVerifyThrottle, WINDOW_SECONDS, keyFor };
