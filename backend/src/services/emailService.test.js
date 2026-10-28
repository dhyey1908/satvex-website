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
  assert.match(sent[0].subject, /Product Enquiry enquiry from Jane/);
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
