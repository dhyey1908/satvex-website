const contactService = require('../services/contactService');
const settingsService = require('../services/settingsService');
const { sendContactNotificationEmail } = require('../services/emailService');
const { contactSchema } = require('../validators/contactValidators');
const { ok, created } = require('../utils/response');

async function submit(req, res) {
  const data = contactSchema.parse(req.body);
  const contact = await contactService.createContact(data);

  // Best-effort — sendContactNotificationEmail swallows its own errors, so
  // an unconfigured/unverified recipient (e.g. SES still in sandbox mode)
  // never fails the actual form submission. Every message is always saved
  // and visible in Admin -> Contacts regardless of whether this email goes
  // through. Awaited (not fire-and-forget) since this runs in a Lambda
  // handler — the execution environment can freeze right after the
  // response is sent, which would otherwise cut the send off mid-flight.
  const settings = await settingsService.getSettings();
  if (settings.contactEmail) {
    await sendContactNotificationEmail({ toEmail: settings.contactEmail, contact });
  }

  created(res, { contact });
}

async function adminList(req, res) {
  const contacts = await contactService.listContacts();
  ok(res, { contacts });
}

module.exports = { submit, adminList };
