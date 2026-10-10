// Scheduled Lambda (EventBridge, every 10 minutes — see template.yaml) that
// retries queued Shiprocket shipment-creation jobs: the immediate attempt
// in triggerShipmentIfNeeded tries first, this is the fallback for whatever
// didn't succeed right away. Mirrors expirePayments.js's structure exactly.
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
    await shipmentJobService.recordFailure(job.jobId, job.attempts, err);
    return job.attempts + 1 >= shipmentJobService.MAX_ATTEMPTS ? 'failed' : 'retrying';
  }
}

exports.handler = async () => {
  const now = new Date().toISOString();
  const jobs = await shipmentJobService.listDueJobs(now);

  const results = { total: jobs.length, done: 0, retrying: 0, failed: 0 };
  for (const job of jobs) {
    const outcome = await processJob(job).catch(() => 'retrying');
    if (outcome === 'done') results.done += 1;
    else if (outcome === 'failed') results.failed += 1;
    else results.retrying += 1;
    await sleep(BATCH_DELAY_MS);
  }

  logger.info('shipmentSweep run complete', results);
  return results;
};
