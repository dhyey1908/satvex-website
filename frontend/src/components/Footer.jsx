import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { contactService } from '../services/contactService';
import { BrandLogo } from './BrandLogo';
import './Footer.css';

export function Footer() {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubscribe(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await contactService.submit({
        name: 'Newsletter subscriber',
        email: email.trim(),
        message: 'Please add me to the Satvex mailing list for new releases and drops.',
      });
      showToast("You're on the list — thank you!", 'success');
      setEmail('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand-col">
          <BrandLogo height={40} />
          <p>Modern women-focused essentials — flexible, comfortable, durable, and distinctly Satvex.</p>

          <div className="footer-newsletter">
            <p className="footer-newsletter-label">Join the List</p>
            <p className="footer-newsletter-copy">Be first to know about new colors and drops.</p>
            <form onSubmit={handleSubscribe} className="footer-newsletter-form">
              <input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={submitting}>Join</button>
            </form>
          </div>
        </div>

        <div>
          <h4>Shop</h4>
          <ul>
            <li><Link to="/shop">All Products</Link></li>
            <li><Link to="/wishlist">Wishlist</Link></li>
            <li><Link to="/cart">Cart</Link></li>
          </ul>
        </div>

        <div>
          <h4>Company</h4>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/contact">Contact Us</Link></li>
          </ul>
        </div>

        <div>
          <h4>Get in touch</h4>
          <ul>
            {settings?.contactEmail && <li>{settings.contactEmail}</li>}
            {settings?.contactPhone && <li>{settings.contactPhone}</li>}
            {settings?.instagramUrl && (
              <li>
                <a href={settings.instagramUrl} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="footer-bottom container">
        <p>© {new Date().getFullYear()} {settings?.brandName || 'Satvex'}. All rights reserved.</p>
      </div>
    </footer>
  );
}
