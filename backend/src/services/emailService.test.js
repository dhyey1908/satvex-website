// emailService sends over SMTP (nodemailer). A recording transport stands in
// for the network; SMTP_* is set before the module loads, like the other
// env-dependent service tests.
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'user';
process.env.SMTP_PASSWORD = 'pw';
process.env.SMTP_FROM = 'Satvex <no-reply@satvex.co.in>';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('./emailService');

let sent;
beforeEach(() => {
  sent = [];
  emailService.__setTransportForTests({ sendMail: async (m) => sent.push(m) });
});

test('password reset email goes out from SMTP_FROM with the reset link in both bodies', async () => {
  await emailService.sendPasswordResetEmail({ toEmail: 'a@b.com', resetLink: 'https://x/reset?t=1' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, 'Satvex <no-reply@satvex.co.in>');
  assert.equal(sent[0].to, 'a@b.com');
  assert.match(sent[0].html, /https:\/\/x\/reset\?t=1/);
  assert.match(sent[0].text, /https:\/\/x\/reset\?t=1/);
});

test('contact notification lowercases the recipient and replies to the customer', async () => {
  await emailService.sendContactNotificationEmail({
    toEmail: 'Team@Satvex.CO.IN',
    contact: { contactId: 'c1', name: 'Jane', email: 'jane@e.com', message: 'Hi', enquiryType: 'product_enquiry' },
  });
  assert.equal(sent[0].to, 'team@satvex.co.in');
  assert.equal(sent[0].replyTo, 'jane@e.com');
  assert.match(sent[0].subject, /\[Satvex\] .* Product Enquiry — Jane/);
});

test('shipment alert is best-effort: a failing transport never throws', async () => {
  emailService.__setTransportForTests({ sendMail: async () => { throw new Error('smtp down'); } });
  await emailService.sendShipmentSyncFailedAlert({ toEmail: 'a@b.com', orderId: 'abcdef123456', customerName: 'J', error: 'x' });
  await emailService.sendContactNotificationEmail({ toEmail: 'a@b.com', contact: { contactId: 'c', name: 'J', message: 'm' } });
});

test('shipment alert with no recipient sends nothing', async () => {
  await emailService.sendShipmentSyncFailedAlert({ toEmail: '', orderId: 'abcdef123456' });
  assert.equal(sent.length, 0);
});

test('customer-typed text is escaped, never injected as markup into the admin email', async () => {
  await emailService.sendContactNotificationEmail({
    toEmail: 'a@b.com',
    contact: { contactId: 'c9', name: '<img src=x onerror=alert(1)>', email: 'x@y.com', message: '<script>alert(1)</script>\nsecond line', enquiryType: 'payment_issue' },
  });
  assert.doesNotMatch(sent[0].html, /<script>alert/);
  assert.doesNotMatch(sent[0].html, /<img src=x/);
  assert.match(sent[0].html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<br>second line/);
});

test('contact email is scannable: urgent banner for payment issues, details, admin link, plain-text twin', async () => {
  await emailService.sendContactNotificationEmail({
    toEmail: 'a@b.com',
    contact: { contactId: 'c9', name: 'Jane', email: 'j@e.com', phone: '98765 43210', message: 'Money deducted twice', enquiryType: 'payment_issue', orderId: 'ORD1', paymentMethod: 'upi', createdAt: '2026-10-28T05:00:00.000Z' },
  });
  const m = sent[0];
  assert.match(m.subject, /🔴 Payment Issue — Jane/);
  assert.match(m.html, /Needs a quick reply/);
  assert.match(m.html, /mailto:j@e\.com/);
  assert.match(m.html, /tel:9876543210/);
  assert.match(m.html, /Paid with/);
  assert.match(m.html, /\/admin\/contacts\/c9/);
  assert.match(m.text, /Customer: Jane/);
  assert.match(m.text, /Money deducted twice/);
});

test('shipment alert tells the admin what happened and what to do', async () => {
  await emailService.sendShipmentSyncFailedAlert({ toEmail: 'a@b.com', orderId: 'abcdef123456', customerName: 'Jane', error: 'Pincode not serviceable' });
  const m = sent[0];
  assert.match(m.subject, /Action needed.*ABCDEF12/);
  assert.match(m.html, /Pincode not serviceable/);
  assert.match(m.html, /What to do next/);
  assert.match(m.html, /\/admin\/shipment-issues/);
});

const sampleOrder = {
  orderId: '73af6d9c-1111-2222-3333-444444444444', createdAt: '2026-10-28T05:00:00.000Z', paymentMethod: 'COD', paymentStatus: 'not_required',
  customer: { name: 'Aishwarya Patil', phone: '98765 43210' },
  address: { line1: '12 Rose Street', city: 'Rajkot', state: 'Gujarat', pincode: '360001', country: 'India' },
  items: [{ productName: 'Butterfly', sellingOptionName: 'Combo of 3', quantity: 2, subtotal: 398, selectedColorDetails: [{ colorName: 'Red' }, { colorName: 'Red' }, { colorName: 'Pink' }] }],
  subtotal: 398, discountAmount: 39.8, couponCode: 'SATVEX10', gstPercent: 18, gstAmount: 64.48, shipping: 59, codCharge: 59, total: 540.68,
};

test('admin order email: order, customer, items with grouped colours, totals and an admin link', async () => {
  await emailService.sendAdminOrderEmail({ toEmail: 'Admin@x.com', order: sampleOrder, event: 'placed' });
  const m = sent[0];
  assert.equal(m.to, 'admin@x.com');
  assert.match(m.subject, /🛍️ New COD order #73AF6D9C — ₹540\.68 · Aishwarya Patil/);
  assert.match(m.html, /Red × 2, Pink × 1/);
  assert.match(m.html, /COD fee/);
  assert.match(m.html, /Coupon \(SATVEX10\)/);
  assert.match(m.html, /tel:9876543210/);
  assert.match(m.html, /\/admin\/orders\/73af6d9c/);
  assert.match(m.text, /Total: ₹540\.68/);
});

test('admin order email variants: paid, late payment, cancelled, needs review (with the reason)', async () => {
  await emailService.sendAdminOrderEmail({ toEmail: 'a@b.com', order: { ...sampleOrder, paymentMethod: 'Online', paymentStatus: 'paid' }, event: 'paid' });
  await emailService.sendAdminOrderEmail({ toEmail: 'a@b.com', order: sampleOrder, event: 'cancelled' });
  await emailService.sendAdminOrderEmail({ toEmail: 'a@b.com', order: sampleOrder, event: 'needs_review', reason: 'Payment amount mismatch on PayU callback.' });
  assert.match(sent[0].subject, /💰 Paid order/);
  assert.match(sent[1].subject, /⚠️ Order cancelled/);
  assert.match(sent[2].html, /Payment amount mismatch on PayU callback\./);
});

test('admin order email never throws and sends nothing without a recipient', async () => {
  await emailService.sendAdminOrderEmail({ toEmail: '', order: sampleOrder, event: 'placed' });
  assert.equal(sent.length, 0);
  emailService.__setTransportForTests({ sendMail: async () => { throw new Error('smtp down'); } });
  await emailService.sendAdminOrderEmail({ toEmail: 'a@b.com', order: sampleOrder, event: 'placed' });
});
