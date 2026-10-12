// Scheduled Lambda (EventBridge, every 10 minutes — see template.yaml) that
// retries queued Shiprocket shipment-creation jobs: the immediate attempt
// in triggerShipmentIfNeeded tries first, this is the fallback for whatever
// didn't succeed right away. Mirrors expirePayments.js's structure exactly.
const shipmentJobService = require('./services/shipmentJobService');
const shipmentService = require('./services/shipmentService');
const orderService = require('./services/orderService');
const settingsService = require('./services/settingsService');
const emailService = require('./services/emailService');
const logger = require('./utils/logger');

const BATCH_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fires exactly once per job, the moment recordFailure reports THIS attempt
// is the one that exhausted MAX_ATTEMPTS — never on every backoff step.
// Both the order-status update and the email are best-effort: a failure in
// either must never stop the sweep from moving on to the next job.
async function alertOnExhaustedRetries(job, err) {
  await orderService.markShipmentSyncFailed(job.orderId).catch((e) =>
    logger.error('failed to mark order sync_failed (non-fatal)', { orderId: job.orderId, message: e.message })
  );
  const [settings, order] = await Promise.all([settingsService.getSettings(), orderService.findById(job.orderId)]);
  await emailService.sendShipmentSyncFailedAlert({
    toEmail: settings.notifications?.shipmentAlertEmail,
    orderId: job.orderId,
    customerName: order?.customer?.name,
    error: err.message,
  });
}

async function processJob(job) {
  try {
    await shipmentService.attemptShipmentCreation(job.orderId);
    await shipmentJobService.markDone(job.jobId);
    return 'done';
  } catch (err) {
    const { failed } = await shipmentJobService.recordFailure(job.jobId, job.attempts, err);
    if (failed) await alertOnExhaustedRetries(job, err);
    return failed ? 'failed' : 'retrying';
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
