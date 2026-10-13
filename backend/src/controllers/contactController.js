const contactService = require('../services/contactService');
const settingsService = require('../services/settingsService');
const { sendContactNotificationEmail } = require('../services/emailService');
const { contactSchema } = require('../validators/contactValidators');
const { ok, created } = require('../utils/response');
const AppError = require('../utils/AppError');
const { z } = require('zod');
const { contactsQuerySchema, queryContacts, CONTACT_STATUSES } = require('../services/adminListQueries');

const updateContactStatusSchema = z.object({ status: z.enum(CONTACT_STATUSES) });

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
  const query = contactsQuerySchema.parse(req.query);
  const { items, pagination } = queryContacts(await contactService.listContacts(), query);
  ok(res, { contacts: items, pagination });
}

async function adminUpdateStatus(req, res) {
  const { status } = updateContactStatusSchema.parse(req.body);
  const contact = await contactService.updateStatus(req.params.id, status);
  if (!contact) throw new AppError('Enquiry not found.', 404, 'NOT_FOUND');
  ok(res, { contact });
}

module.exports = { submit, adminList, adminUpdateStatus };
