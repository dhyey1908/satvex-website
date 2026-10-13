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
        Destination: { ToAddresses: [toEmail.toLowerCase()] },
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

const ENQUIRY_TYPE_LABELS = {
  order_tracking: 'Order Tracking',
  return_refund_exchange: 'Return / Refund / Exchange',
  payment_issue: 'Payment Issue',
  product_enquiry: 'Product Enquiry',
  cancel_order: 'Cancel Order',
  general_enquiry: 'General Enquiry',
};

const RETURN_REASON_LABELS = {
  damaged: 'Damaged',
  defective: 'Defective',
  wrong_item: 'Wrong Item',
  missing_item: 'Missing Item',
  other: 'Other',
};

const RETURN_RESOLUTION_LABELS = { refund: 'Refund', replacement: 'Replacement', exchange: 'Exchange' };
const PAYMENT_METHOD_LABELS = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', cod: 'COD', other: 'Other' };

// Builds the extra, type-specific lines for the notification email — kept
// as [label, value] pairs so the HTML/Text bodies can render the same data
// without duplicating the per-type conditionals twice.
function buildContactDetailLines(contact) {
  const lines = [];
  if (contact.orderId) lines.push(['Order ID', contact.orderId]);
  if (contact.returnReason) lines.push(['Reason', RETURN_REASON_LABELS[contact.returnReason] || contact.returnReason]);
  if (contact.returnResolution) lines.push(['Preferred Resolution', RETURN_RESOLUTION_LABELS[contact.returnResolution] || contact.returnResolution]);
  if (contact.paymentMethod) lines.push(['Payment Method', PAYMENT_METHOD_LABELS[contact.paymentMethod] || contact.paymentMethod]);
  if (contact.transactionRef) lines.push(['Transaction Reference', contact.transactionRef]);
  if (contact.cancelReason) lines.push(['Cancellation Reason', contact.cancelReason]);
  return lines;
}

// Fired once per Contact Us submission — best-effort, same as the shipment
// alert above: swallows its own errors so a broken/unconfigured mailbox (or
// an unverified recipient while SES is still in sandbox mode) never breaks
// the actual form submission for the customer.
async function sendContactNotificationEmail({ toEmail, contact }) {
  if (!toEmail || !env.ses.senderEmail) {
    logger.warn('contact notification not sent — no recipient or SES_SENDER_EMAIL configured', { contactId: contact.contactId });
    return;
  }
  try {
    const typeLabel = ENQUIRY_TYPE_LABELS[contact.enquiryType] || 'General Enquiry';
    const detailLines = buildContactDetailLines(contact);
    const attachments = contact.attachments || [];

    const detailHtml = detailLines.map(([label, value]) => `<strong>${label}:</strong> ${value}<br/>`).join('\n                       ');
    const detailText = detailLines.map(([label, value]) => `${label}: ${value}`).join('\n');
    const attachmentsHtml = attachments.length
      ? `<p><strong>Attachments:</strong><br/>${attachments.map((url, i) => `<a href="${url}">Attachment ${i + 1}</a>`).join('<br/>')}</p>`
      : '';
    const attachmentsText = attachments.length
      ? `\nAttachments:\n${attachments.map((url, i) => `Attachment ${i + 1}: ${url}`).join('\n')}`
      : '';

    await client.send(
      new SendEmailCommand({
        FromEmailAddress: env.ses.senderEmail,
        // Lowercased — SES's sandbox-mode verified-recipient check is
        // case-sensitive, so a mixed-case address can silently fail to send
        // even when the (lowercase) identity is actually verified.
        Destination: { ToAddresses: [toEmail.toLowerCase()] },
        ReplyToAddresses: contact.email ? [contact.email] : undefined,
        Content: {
          Simple: {
            Subject: { Data: `[Satvex] New ${typeLabel} enquiry from ${contact.name}` },
            Body: {
              Html: {
                Data: `<p>A new ${typeLabel} enquiry came in through the Contact Us form.</p>
                       <p><strong>Name:</strong> ${contact.name}<br/>
                       ${contact.email ? `<strong>Email:</strong> ${contact.email}<br/>` : ''}
                       ${contact.phone ? `<strong>Phone:</strong> ${contact.phone}<br/>` : ''}
                       ${detailHtml}
                       <strong>Message:</strong></p>
                       <p>${contact.message}</p>
                       ${attachmentsHtml}
                       <p>Reply directly to this email to respond, or view it in Admin → Contacts.</p>`,
              },
              Text: {
                Data: `New ${typeLabel} enquiry.\nName: ${contact.name}\n${contact.email ? `Email: ${contact.email}\n` : ''}${contact.phone ? `Phone: ${contact.phone}\n` : ''}${detailText}\nMessage:\n${contact.message}\n${attachmentsText}\n\nReply directly to this email to respond, or view it in Admin -> Contacts.`,
              },
            },
          },
        },
      })
    );
  } catch (err) {
    logger.error('failed to send contact notification email (non-fatal)', { contactId: contact.contactId, message: err.message });
  }
}

module.exports = { sendPasswordResetEmail, sendShipmentSyncFailedAlert, sendContactNotificationEmail };
