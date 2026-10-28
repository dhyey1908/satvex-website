const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');
const { renderEmail, formatWhen } = require('./emailTemplate');

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

const adminLink = (path) => `${env.siteUrl}/admin${path}`;
const shortId = (id) => String(id || '').slice(0, 8).toUpperCase();

async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!isConfigured()) {
    logger.warn('SMTP not configured; skipping password reset email send', { toEmail });
    return;
  }

  const { html, text } = renderEmail({
    preheader: `Use this link within ${env.resetTokenExpiresMin} minutes to choose a new password.`,
    audience: 'Account',
    title: 'Reset your Satvex password',
    intro: `We received a request to reset the password for your Satvex account. Tap the button below to choose a new one. The link works for ${env.resetTokenExpiresMin} minutes.`,
    button: { label: 'Choose a new password', url: resetLink },
    note: 'Did not ask for this? You can safely ignore this email — your password stays the same.',
    siteUrl: env.siteUrl,
  });
  await send({ to: toEmail, subject: 'Reset your Satvex password', html, text });
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
    const ref = shortId(orderId);
    const { html, text } = renderEmail({
      preheader: `Order ${ref} was paid but its shipment could not be created. Open the admin to retry.`,
      audience: 'Admin alert',
      status: { label: 'Action needed', tone: 'urgent' },
      title: 'A paid order has no shipment yet',
      intro: 'The order below is paid, but creating its Shiprocket shipment failed after 6 attempts. It will not ship until someone retries it.',
      rows: [
        ['Order', `#${ref}`, adminLink(`/orders/${orderId}`)],
        ['Customer', customerName || 'Unknown'],
        ['Attempts', '6 (all failed)'],
      ],
      code: { label: 'Last error from Shiprocket', text: error || 'Unknown error' },
      steps: [
        'Open Admin → Orders → Shipment Sync Issues.',
        'Read the error above to see what was rejected.',
        'Fix it if needed (for example the address or pickup details), then press Retry.',
      ],
      button: { label: 'Open Shipment Sync Issues', url: adminLink('/shipment-issues') },
      siteUrl: env.siteUrl,
    });
    await send({ to: toEmail.toLowerCase(), subject: `[Satvex] 🚚 Action needed: shipment failed — Order ${ref}`, html, text });
  } catch (err) {
    logger.error('failed to send shipment sync alert email (non-fatal)', { orderId, message: err.message });
  }
}

// How loudly each kind of enquiry should be flagged to the admin.
const ENQUIRY_TYPES = {
  order_tracking: { label: 'Order Tracking', emoji: '📦', tone: 'info', banner: 'New enquiry' },
  return_refund_exchange: { label: 'Return / Refund / Exchange', emoji: '🔁', tone: 'warn', banner: 'Reply soon' },
  payment_issue: { label: 'Payment Issue', emoji: '🔴', tone: 'urgent', banner: 'Needs a quick reply' },
  product_enquiry: { label: 'Product Enquiry', emoji: '💬', tone: 'info', banner: 'New enquiry' },
  cancel_order: { label: 'Cancel Order', emoji: '⚠️', tone: 'warn', banner: 'Time-sensitive' },
  general_enquiry: { label: 'General Enquiry', emoji: '💬', tone: 'info', banner: 'New enquiry' },
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

// The extra, type-specific [label, value] rows for the notification email.
function buildContactDetailRows(contact) {
  const rows = [];
  if (contact.orderId) rows.push(['Order ID', contact.orderId]);
  if (contact.returnReason) rows.push(['Reason', RETURN_REASON_LABELS[contact.returnReason] || contact.returnReason]);
  if (contact.returnResolution) rows.push(['Wants', RETURN_RESOLUTION_LABELS[contact.returnResolution] || contact.returnResolution]);
  if (contact.paymentMethod) rows.push(['Paid with', PAYMENT_METHOD_LABELS[contact.paymentMethod] || contact.paymentMethod]);
  if (contact.transactionRef) rows.push(['Transaction ref', contact.transactionRef]);
  if (contact.cancelReason) rows.push(['Cancellation reason', contact.cancelReason]);
  return rows;
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
    const type = ENQUIRY_TYPES[contact.enquiryType] || ENQUIRY_TYPES.general_enquiry;
    const attachments = contact.attachments || [];

    const { html, text } = renderEmail({
      preheader: `${contact.name}: ${String(contact.message || '').replace(/\s+/g, ' ').slice(0, 90)}`,
      audience: 'Admin · Contact form',
      status: { label: `${type.label} · ${type.banner}`, tone: type.tone },
      title: `${contact.name} wrote to you`,
      intro: 'A customer sent this through the Contact Us form. Here is everything you need to answer.',
      rows: [
        ['Customer', contact.name],
        ['Email', contact.email, contact.email ? `mailto:${contact.email}` : null],
        ['Phone', contact.phone, contact.phone ? `tel:${String(contact.phone).replace(/[^\d+]/g, '')}` : null],
        ['Topic', type.label],
        ...buildContactDetailRows(contact),
        ['Received', formatWhen(contact.createdAt)],
      ],
      quote: { label: 'Their message', text: contact.message },
      links: attachments.map((url, i) => ({ label: `Attachment ${i + 1}`, url })),
      button: contact.contactId ? { label: 'Open in Admin', url: adminLink(`/contacts/${contact.contactId}`) } : undefined,
      note: contact.email
        ? 'Tip: just press Reply on this email — it goes straight to the customer.'
        : 'This customer left no email address, so reply by phone or from the admin.',
      siteUrl: env.siteUrl,
    });

    await send({
      to: toEmail.toLowerCase(),
      replyTo: contact.email || undefined,
      subject: `[Satvex] ${type.emoji} ${type.label} — ${contact.name}`,
      html,
      text,
    });
  } catch (err) {
    logger.error('failed to send contact notification email (non-fatal)', { contactId: contact.contactId, message: err.message });
  }
}

// ---- admin order notifications ---------------------------------------------------------
// Admin-only (customers give us a mobile number, not an email, so they are never
// emailed). One layout for four moments: a COD order placed, an online order
// paid, a customer cancelling, and an order that needs a human look.
const rupees = (n) => `₹${Number(n || 0).toFixed(2)}`;

function colourSummary(item) {
  const groups = new Map();
  for (const c of item.selectedColorDetails || []) groups.set(c.colorName, (groups.get(c.colorName) || 0) + 1);
  return [...groups].map(([name, n]) => `${name} × ${n}`).join(', ');
}

const ORDER_EVENTS = {
  placed: { emoji: '🛍️', subject: 'New COD order', status: { label: 'New order · Cash on Delivery', tone: 'info' }, title: 'You have a new Cash on Delivery order', intro: 'The customer chose to pay on delivery. The order is confirmed and ready to ship.' },
  paid: { emoji: '💰', subject: 'Paid order', status: { label: 'Payment received', tone: 'success' }, title: 'An online order was just paid', intro: 'PayU confirmed the payment. The order is confirmed and ready to ship.' },
  paid_late: { emoji: '🟠', subject: 'Late payment — review', status: { label: 'Needs your review', tone: 'warn' }, title: 'A payment arrived after the order had expired', intro: 'The customer paid after the payment window closed. The order was kept at the price paid, but please check it before it ships.' },
  cancelled: { emoji: '⚠️', subject: 'Order cancelled', status: { label: 'Cancelled by customer', tone: 'warn' }, title: 'A customer cancelled their order', intro: 'The coupon (if any) was released and any Shiprocket shipment was cancelled. Nothing else to do unless you want to contact them.' },
  needs_review: { emoji: '🟠', subject: 'Order needs review', status: { label: 'Needs your review', tone: 'urgent' }, title: 'An order needs a human check', intro: 'Something about this order did not add up, so it was not handled automatically.' },
};

async function sendAdminOrderEmail({ toEmail, order, event, reason }) {
  if (!toEmail || !isConfigured()) {
    logger.warn('order notification not sent — no recipient or SMTP configured', { orderId: order?.orderId, event });
    return;
  }
  try {
    const meta = ORDER_EVENTS[event];
    const ref = shortId(order.orderId);
    const a = order.address || {};
    const address = [a.line1, a.landmark, [a.city, a.state].filter(Boolean).join(', '), [a.pincode, a.country].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join('\n');
    const phone = order.customer?.phone;

    const { html, text } = renderEmail({
      preheader: `${order.customer?.name || 'A customer'} · ${rupees(order.total)} · ${order.paymentMethod}`,
      audience: 'Admin · Orders',
      status: meta.status,
      title: meta.title,
      intro: meta.intro,
      rows: [
        ['Order', `#${ref}`, adminLink(`/orders/${order.orderId}`)],
        ['Total', rupees(order.total)],
        ['Payment', order.paymentMethod === 'COD' ? 'Cash on Delivery (collect on delivery)' : `Online${order.paymentStatus === 'paid' ? ' — paid' : ''}`],
        ['Customer', order.customer?.name],
        ['Phone', phone, phone ? `tel:${String(phone).replace(/[^\d+]/g, '')}` : null],
        ['Ship to', address],
        ['Placed', formatWhen(order.createdAt)],
        ...(reason ? [['Why flagged', reason]] : []),
      ],
      table: {
        label: 'What they ordered',
        columns: ['Item', 'Qty', 'Price'],
        rows: (order.items || []).map((i) => [
          [`${i.productName} — ${i.sellingOptionName}`, colourSummary(i)].filter(Boolean).join('\n'),
          String(i.quantity),
          rupees(i.subtotal),
        ]),
        footRows: [
          ['Subtotal', rupees(order.subtotal)],
          ...(order.discountAmount > 0 ? [[`Coupon${order.couponCode ? ` (${order.couponCode})` : ''}`, `−${rupees(order.discountAmount)}`]] : []),
          ...(order.gstAmount > 0 ? [[order.pricesIncludeGst ? `Includes GST (${order.gstPercent}%)` : `GST (${order.gstPercent}%)`, rupees(order.gstAmount)]] : []),
          ['Shipping', order.shipping > 0 ? rupees(order.shipping) : 'Free'],
          ...(order.codCharge > 0 ? [['COD fee', rupees(order.codCharge)]] : []),
          ['Total', rupees(order.total), true],
        ],
      },
      button: { label: 'Open order in Admin', url: adminLink(`/orders/${order.orderId}`) },
      siteUrl: env.siteUrl,
    });

    await send({
      to: toEmail.toLowerCase(),
      subject: `[Satvex] ${meta.emoji} ${meta.subject} #${ref} — ${rupees(order.total)}${order.customer?.name ? ` · ${order.customer.name}` : ''}`,
      html,
      text,
    });
  } catch (err) {
    logger.error('failed to send admin order email (non-fatal)', { orderId: order?.orderId, event, message: err.message });
  }
}

module.exports = { sendPasswordResetEmail, sendShipmentSyncFailedAlert, sendContactNotificationEmail, sendAdminOrderEmail, __setTransportForTests };
