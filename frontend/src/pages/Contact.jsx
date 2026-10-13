import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { contactService } from '../services/contactService';
import { useSettings } from '../context/SettingsContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { AttachmentUploader } from '../components/AttachmentUploader';
import {
  required,
  minLength,
  email as validateEmail,
  phone as validatePhone,
  sanitizePhoneInput,
  runValidators,
  hasErrors,
} from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import { fadeUp } from '../motion';
import './Contact.css';

const ENQUIRY_TYPES = [
  { value: 'order_tracking', label: 'Order Tracking' },
  { value: 'return_refund_exchange', label: 'Return / Refund / Exchange' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'product_enquiry', label: 'Product Enquiry' },
  { value: 'cancel_order', label: 'Cancel Order' },
  { value: 'general_enquiry', label: 'General Enquiry / Other' },
];

const RETURN_REASONS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'defective', label: 'Defective' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'missing_item', label: 'Missing Item' },
  { value: 'other', label: 'Other' },
];

const RETURN_RESOLUTIONS = [
  { value: 'refund', label: 'Refund' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'exchange', label: 'Exchange' },
];

const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Netbanking' },
  { value: 'cod', label: 'COD' },
  { value: 'other', label: 'Other' },
];

const ORDER_ID_REQUIRED_TYPES = new Set(['order_tracking', 'return_refund_exchange', 'payment_issue', 'cancel_order']);
const ATTACHMENTS_ALLOWED_TYPES = new Set(['return_refund_exchange', 'payment_issue']);

const MESSAGE_LABELS = {
  return_refund_exchange: 'Additional Details',
  payment_issue: 'Issue Description',
  cancel_order: 'Anything else we should know?',
};

const EMPTY_FORM = {
  enquiryType: 'general_enquiry',
  name: '',
  email: '',
  phone: '',
  message: '',
  orderId: '',
  returnReason: '',
  returnResolution: '',
  paymentMethod: '',
  transactionRef: '',
  cancelReason: '',
  attachments: [],
};

function validate(values) {
  return runValidators({
    name: () => minLength(values.name, 2, 'Name'),
    email: () => validateEmail(values.email, { optional: true }),
    phone: () => validatePhone(values.phone, { optional: false }),
    message: () => minLength(values.message, 5, 'Message'),
    orderId: () => (ORDER_ID_REQUIRED_TYPES.has(values.enquiryType) ? required(values.orderId, 'Order ID') : ''),
    returnReason: () =>
      values.enquiryType === 'return_refund_exchange' ? required(values.returnReason, 'Reason') : '',
    paymentMethod: () =>
      values.enquiryType === 'payment_issue' ? required(values.paymentMethod, 'Payment method') : '',
  });
}

export function Contact() {
  useDocumentMeta({
    title: 'Contact Us',
    description: 'Get in touch with Satvex.',
    path: '/contact',
  });

  const { settings } = useSettings();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleTypeChange(value) {
    setForm((prev) => ({ ...prev, enquiryType: value, attachments: [] }));
    setFieldErrors({});
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({
      name: true,
      email: true,
      phone: true,
      message: true,
      orderId: true,
      returnReason: true,
      paymentMethod: true,
    });
    if (hasErrors(errors)) return;

    setStatus('submitting');
    try {
      await contactService.submit(form);
      setStatus('sent');
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setTouched({});
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else setError(err.message);
      setStatus('idle');
    }
  }

  const messageLabel = MESSAGE_LABELS[form.enquiryType] || 'Message';
  const showAttachments = ATTACHMENTS_ALLOWED_TYPES.has(form.enquiryType);

  return (
    <div className="container section contact-page">
      <div className="contact-layout">
        <div className="contact-info">
          <div className="eyebrow-dot"><span>Contact Us</span></div>
          <h1 className="text-headline-lg">Get in Touch</h1>
          <p>
            Have a question about an order, a product, or just want to say hello? We&apos;d love to
            hear from you — we typically reply within a day.
          </p>

          <div className="contact-info-cards">
            {settings?.contactEmail && (
              <a href={`mailto:${settings.contactEmail}`} className="contact-info-card">
                <span className="contact-info-label">Email</span>
                <span className="contact-info-value">{settings.contactEmail}</span>
              </a>
            )}
            {settings?.contactPhone && (
              <a href={`tel:${settings.contactPhone}`} className="contact-info-card">
                <span className="contact-info-label">Phone</span>
                <span className="contact-info-value">{settings.contactPhone}</span>
              </a>
            )}
            {settings?.instagramUrl && (
              <a href={settings.instagramUrl} target="_blank" rel="noreferrer" className="contact-info-card">
                <span className="contact-info-label">Instagram</span>
                <span className="contact-info-value">@satvex</span>
              </a>
            )}
          </div>

          <p className="contact-response-note">
            <CheckCircle2 size={16} />
            Response within 1 business day
          </p>
        </div>

        <div className="contact-form-col">
          {status === 'sent' ? (
            <div className="card contact-form contact-success">
              <CheckCircle2 size={32} />
              <h3 className="text-headline-sm">Message Sent</h3>
              <p>Thanks — we&apos;ve received your message and will get back to you soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card contact-form" noValidate>
              <h3 className="text-headline-sm contact-form-heading">Send Us a Message</h3>

              <div className="field">
                <label htmlFor="enquiryType">How can we help you?</label>
                <select
                  id="enquiryType"
                  required
                  value={form.enquiryType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                >
                  {ENQUIRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row">
                <div className={`field ${touched.name && fieldErrors.name ? 'invalid' : ''}`}>
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    onBlur={() => markTouched('name')}
                  />
                  {touched.name && fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
                </div>
                <div className={`field ${touched.phone && fieldErrors.phone ? 'invalid' : ''}`}>
                  <label htmlFor="phone">Mobile Number</label>
                  <input
                    id="phone"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={form.phone}
                    onChange={(e) => setField('phone', sanitizePhoneInput(e.target.value))}
                    onBlur={() => markTouched('phone')}
                  />
                  {touched.phone && fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
                </div>
              </div>

              <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`}>
                <label htmlFor="email">Email (optional)</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  onBlur={() => markTouched('email')}
                />
                {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={form.enquiryType} {...fadeUp}>
                  {ORDER_ID_REQUIRED_TYPES.has(form.enquiryType) && (
                    <div className={`field ${touched.orderId && fieldErrors.orderId ? 'invalid' : ''}`}>
                      <label htmlFor="orderId">Order ID</label>
                      <input
                        id="orderId"
                        required
                        value={form.orderId}
                        onChange={(e) => setField('orderId', e.target.value)}
                        onBlur={() => markTouched('orderId')}
                      />
                      {touched.orderId && fieldErrors.orderId && <p className="field-error">{fieldErrors.orderId}</p>}
                    </div>
                  )}

                  {form.enquiryType === 'return_refund_exchange' && (
                    <div className="field-row">
                      <div className={`field ${touched.returnReason && fieldErrors.returnReason ? 'invalid' : ''}`}>
                        <label htmlFor="returnReason">Reason</label>
                        <select
                          id="returnReason"
                          required
                          value={form.returnReason}
                          onChange={(e) => setField('returnReason', e.target.value)}
                          onBlur={() => markTouched('returnReason')}
                        >
                          <option value="">Select a reason</option>
                          {RETURN_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        {touched.returnReason && fieldErrors.returnReason && (
                          <p className="field-error">{fieldErrors.returnReason}</p>
                        )}
                      </div>
                      <div className="field">
                        <label htmlFor="returnResolution">Preferred Resolution</label>
                        <select
                          id="returnResolution"
                          value={form.returnResolution}
                          onChange={(e) => setField('returnResolution', e.target.value)}
                        >
                          <option value="">Select an option</option>
                          {RETURN_RESOLUTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {form.enquiryType === 'payment_issue' && (
                    <div className="field-row">
                      <div className={`field ${touched.paymentMethod && fieldErrors.paymentMethod ? 'invalid' : ''}`}>
                        <label htmlFor="paymentMethod">Payment Method</label>
                        <select
                          id="paymentMethod"
                          required
                          value={form.paymentMethod}
                          onChange={(e) => setField('paymentMethod', e.target.value)}
                          onBlur={() => markTouched('paymentMethod')}
                        >
                          <option value="">Select a method</option>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        {touched.paymentMethod && fieldErrors.paymentMethod && (
                          <p className="field-error">{fieldErrors.paymentMethod}</p>
                        )}
                      </div>
                      <div className="field">
                        <label htmlFor="transactionRef">Transaction Reference (optional)</label>
                        <input
                          id="transactionRef"
                          value={form.transactionRef}
                          onChange={(e) => setField('transactionRef', e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {form.enquiryType === 'cancel_order' && (
                    <div className="field">
                      <label htmlFor="cancelReason">Cancellation Reason (optional)</label>
                      <input
                        id="cancelReason"
                        value={form.cancelReason}
                        onChange={(e) => setField('cancelReason', e.target.value)}
                      />
                    </div>
                  )}

                  <div className={`field ${touched.message && fieldErrors.message ? 'invalid' : ''}`}>
                    <label htmlFor="message">{messageLabel}</label>
                    <textarea
                      id="message"
                      rows={5}
                      required
                      value={form.message}
                      onChange={(e) => setField('message', e.target.value)}
                      onBlur={() => markTouched('message')}
                    />
                    {touched.message && fieldErrors.message && <p className="field-error">{fieldErrors.message}</p>}
                  </div>

                  {showAttachments && (
                    <div className="field">
                      <label>Photos / Videos (optional)</label>
                      <AttachmentUploader
                        files={form.attachments}
                        onChange={(urls) => setField('attachments', urls)}
                        max={10}
                      />
                      {fieldErrors.attachments && <p className="field-error">{fieldErrors.attachments}</p>}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {error && <p className="field-error">{error}</p>}

              <button type="submit" className="btn btn-primary btn-block" disabled={status === 'submitting'}>
                {status === 'submitting' ? <Loader2 size={16} className="btn-spinner" /> : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
