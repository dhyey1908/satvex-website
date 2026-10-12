const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const env = require('../config/env');
const logger = require('../utils/logger');

const client = new SESv2Client({ region: env.awsRegion });

async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!env.ses.senderEmail) {
    logger.warn('SES_SENDER_EMAIL not configured; skipping password reset email send', { toEmail });
    return;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: env.ses.senderEmail,
    Destination: { ToAddresses: [toEmail] },
    Content: {
      Simple: {
        Subject: { Data: 'Reset your Satvex password' },
        Body: {
          Html: {
            Data: `<p>We received a request to reset your Satvex password.</p>
                   <p><a href="${resetLink}">Click here to reset your password</a></p>
                   <p>This link expires in ${env.resetTokenExpiresMin} minutes. If you did not request this, you can ignore this email.</p>`,
          },
          Text: {
            Data: `Reset your Satvex password: ${resetLink} (expires in ${env.resetTokenExpiresMin} minutes)`,
          },
        },
      },
    },
  });

  await client.send(command);
}

// Fired once per job, exactly when shipmentJobService.recordFailure reports
// the job just exhausted MAX_ATTEMPTS (see shipmentSweep.js) — never on
// every individual retry attempt, so this can't spam the inbox once per
// 5-15 minute backoff step. Best-effort: swallows its own errors so a
// broken/unconfigured mailbox never breaks the sweep itself.
async function sendShipmentSyncFailedAlert({ toEmail, orderId, customerName, error }) {
  if (!toEmail || !env.ses.senderEmail) {
    logger.warn('shipment sync alert not sent — no recipient or SES_SENDER_EMAIL configured', { orderId, toEmail });
    return;
  }
  try {
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: env.ses.senderEmail,
        Destination: { ToAddresses: [toEmail] },
        Content: {
          Simple: {
            Subject: { Data: `[Satvex] Shipment sync failed — Order ${orderId.slice(0, 8).toUpperCase()}` },
            Body: {
              Html: {
                Data: `<p>A paid order's Shiprocket shipment could not be created after 6 retry attempts and needs manual attention.</p>
                       <p><strong>Order:</strong> ${orderId}<br/>
                       <strong>Customer:</strong> ${customerName || 'Unknown'}<br/>
                       <strong>Last error:</strong> ${error || 'Unknown error'}</p>
                       <p>Open Admin → Orders → Shipment Sync Issues to retry it.</p>`,
              },
              Text: {
                Data: `A paid order's Shiprocket shipment could not be created after 6 retry attempts.\nOrder: ${orderId}\nCustomer: ${customerName || 'Unknown'}\nLast error: ${error || 'Unknown error'}\n\nOpen Admin -> Orders -> Shipment Sync Issues to retry it.`,
              },
            },
          },
        },
      })
    );
  } catch (err) {
    logger.error('failed to send shipment sync alert email (non-fatal)', { orderId, message: err.message });
  }
}

module.exports = { sendPasswordResetEmail, sendShipmentSyncFailedAlert };
