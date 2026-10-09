// Scheduled Lambda (EventBridge, every 10 minutes) that retries Shiprocket
// shipment-creation jobs the immediate attempt (in orderController, on order
// paid/confirmed) failed to complete. Runs independently of the API Lambda.
//
// Safety: capped at MAX_ATTEMPTS retries (shipmentJobService) — a job that
// keeps failing flips to 'failed' and shows up in the admin "retry shipment"
// UI rather than retrying forever.
const shipmentJobService = require('./services/shipmentJobService');
const shipmentService = require('./services/shipmentService');
const logger = require('./utils/logger');

const BATCH_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(job) {
  try {
    await shipmentService.attemptShipmentCreation(job.orderId);
    await shipmentJobService.markDone(job.jobId);
    return 'done';
  } catch (err) {
    await shipmentJobService.recordFailure(job.jobId, job.attempts, err.message);
    logger.error('shipment job failed', { jobId: job.jobId, orderId: job.orderId, attempt: job.attempts + 1, message: err.message });
    return 'failed-attempt';
  }
}

exports.handler = async () => {
  const now = new Date().toISOString();
  const jobs = await shipmentJobService.listDueJobs(now);

  const results = { total: jobs.length, done: 0, failedAttempt: 0 };
  for (const job of jobs) {
    const outcome = await processJob(job).catch(() => 'failed-attempt');
    if (outcome === 'done') results.done += 1;
    else results.failedAttempt += 1;
    await sleep(BATCH_DELAY_MS);
  }

  logger.info('shipmentSweep run complete', results);
  return results;
};
