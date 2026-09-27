const contactService = require('../services/contactService');
const { contactSchema } = require('../validators/contactValidators');
const { ok, created } = require('../utils/response');

async function submit(req, res) {
  const data = contactSchema.parse(req.body);
  const contact = await contactService.createContact(data);
  created(res, { contact });
}

async function adminList(req, res) {
  const contacts = await contactService.listContacts();
  ok(res, { contacts });
}

module.exports = { submit, adminList };
