import { useState } from 'react';
import { contactService } from '../services/contactService';
import { useSettings } from '../context/SettingsContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { CheckCircle2, Loader2 } from 'lucide-react';
import './Contact.css';

export function Contact() {
  useDocumentMeta({
    title: 'Contact Us',
    description: 'Get in touch with Satvex.',
    path: '/contact',
  });

  const { settings } = useSettings();
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setStatus('submitting');
    try {
      await contactService.submit(form);
      setStatus('sent');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

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
            <form onSubmit={handleSubmit} className="card contact-form">
              <h3 className="text-headline-sm contact-form-heading">Send Us a Message</h3>
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  rows={5}
                  required
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </div>

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
