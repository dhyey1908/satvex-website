const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

// Plain SMTP (any provider: Zoho, Brevo, Gmail app password, ...). The transport
// is built lazily so a missing SMTP config only disables email instead of
// crashing the Lambda at import time. Port 465 is implicit TLS; 587/25 use STARTTLS.
let transport;
function getTransport() {
  if (!transport) {
    const { host, port, user, pass } = env.smtp;
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }
  return transport;
}

// Test hook only — lets the unit tests swap in a recording transport.
function __setTransportForTests(t) {
  transport = t;
}

function isConfigured() {
  return Boolean(env.smtp.host && env.smtp.from);
}

async function send({ to, subject, html, text, replyTo }) {
  await getTransport().sendMail({ from: env.smtp.from, to, subject, html, text, replyTo });
}

async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!isConfigured()) {
    logger.warn('SMTP not configured; skipping password reset email send', { toEmail });
    return;
  }

  await send({
    to: toEmail,
    subject: 'Reset your Satvex password',
    html: `<p>We received a request to reset your Satvex password.</p>
                   <p><a href="${resetLink}">Click here to reset your password</a></p>
                   <p>This link expires in ${env.resetTokenExpiresMin} minutes. If you did not request this, you can ignore this email.</p>`,
    text: `Reset your Satvex password: ${resetLink} (expires in ${env.resetTokenExpiresMin} minutes)`,
  });
}

// Fired once per job, exactly when shipmentJobService.recordFailure reports
// the job just exhausted MAX_ATTEMPTS (see shipmentSweep.js) — never on
// every individual retry attempt, so this can't spam the inbox once per
// 5-15 minute backoff step. Best-effort: swallows its own errors so a
// broken/unconfigured mailbox never breaks the sweep itself.
async function sendShipmentSyncFailedAlert({ toEmail, orderId, customerName, error }) {
  if (!toEmail || !isConfigured()) {
    logger.warn('shipment sync alert not sent — no recipient or SMTP configured', { orderId, toEmail });
    return;
  }
  try {
    await send({
      to: toEmail.toLowerCase(),
      subject: `[Satvex] Shipment sync failed — Order ${orderId.slice(0, 8).toUpperCase()}`,
      html: `<p>A paid order's Shiprocket shipment could not be created after 6 retry attempts and needs manual attention.</p>
                       <p><strong>Order:</strong> ${orderId}<br/>
                       <strong>Customer:</strong> ${customerName || 'Unknown'}<br/>
                       <strong>Last error:</strong> ${error || 'Unknown error'}</p>
                       <p>Open Admin → Orders → Shipment Sync Issues to retry it.</p>`,
      text: `A paid order's Shiprocket shipment could not be created after 6 retry attempts.
Order: ${orderId}
Customer: ${customerName || 'Unknown'}
Last error: ${error || 'Unknown error'}

Open Admin -> Orders -> Shipment Sync Issues to retry it.`,
    });
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
// alert above: swallows its own errors so a broken/unconfigured mailbox never
// breaks the actual form submission for the customer.
async function sendContactNotificationEmail({ toEmail, contact }) {
  if (!toEmail || !isConfigured()) {
    logger.warn('contact notification not sent — no recipient or SMTP configured', { contactId: contact.contactId });
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

    await send({
      to: toEmail.toLowerCase(),
      replyTo: contact.email || undefined,
      subject: `[Satvex] New ${typeLabel} enquiry from ${contact.name}`,
      html: `<p>A new ${typeLabel} enquiry came in through the Contact Us form.</p>
                       <p><strong>Name:</strong> ${contact.name}<br/>
                       ${contact.email ? `<strong>Email:</strong> ${contact.email}<br/>` : ''}
                       ${contact.phone ? `<strong>Phone:</strong> ${contact.phone}<br/>` : ''}
                       ${detailHtml}
                       <strong>Message:</strong></p>
                       <p>${contact.message}</p>
                       ${attachmentsHtml}
                       <p>Reply directly to this email to respond, or view it in Admin → Contacts.</p>`,
      text: `New ${typeLabel} enquiry.\nName: ${contact.name}\n${contact.email ? `Email: ${contact.email}\n` : ''}${contact.phone ? `Phone: ${contact.phone}\n` : ''}${detailText}\nMessage:\n${contact.message}\n${attachmentsText}\n\nReply directly to this email to respond, or view it in Admin -> Contacts.`,
    });
  } catch (err) {
    logger.error('failed to send contact notification email (non-fatal)', { contactId: contact.contactId, message: err.message });
  }
}

module.exports = { sendPasswordResetEmail, sendShipmentSyncFailedAlert, sendContactNotificationEmail, __setTransportForTests };
