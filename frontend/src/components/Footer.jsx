import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, ChevronDown } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { STOREFRONT } from '../config/storefront';
import { BrandLogo } from './BrandLogo';
import { InstagramIcon } from './InstagramIcon';
import { PinterestIcon } from './PinterestIcon';
import './Footer.css';

// On phones each column collapses behind its heading; from 641px up the
// heading is plain text and the links are always visible (see Footer.css).
function FooterSection({ id, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`footer-col ${open ? 'open' : ''}`}>
      <h4>
        <button
          type="button"
          className="footer-col-toggle"
          aria-expanded={open}
          aria-controls={`footer-${id}`}
          onClick={() => setOpen((v) => !v)}
        >
          {title}
          <ChevronDown size={16} className="footer-col-chevron" aria-hidden="true" />
        </button>
      </h4>
      <ul id={`footer-${id}`} className="footer-col-body">
        {children}
      </ul>
    </div>
  );
}

export function Footer() {
  const { settings } = useSettings();
  const codEnabled = settings?.cod?.enabled !== false;
  const socials = [
    settings?.instagramUrl && { label: 'Instagram', href: settings.instagramUrl, Icon: InstagramIcon },
    settings?.pinterestUrl && { label: 'Pinterest', href: settings.pinterestUrl, Icon: PinterestIcon },
  ].filter(Boolean);
  const payments = [...STOREFRONT.paymentMethods, ...(codEnabled ? ['Cash on Delivery'] : [])];

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand-col">
          <BrandLogo height={40} light />
          <p>Modern women-focused essentials — flexible, comfortable, durable, and distinctly Satvex.</p>
          {socials.length > 0 && (
            <div className="footer-social">
              {socials.map(({ label, href, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={`Satvex on ${label}`}>
                  <Icon size={20} />
                </a>
              ))}
            </div>
          )}
        </div>

        <FooterSection id="shop" title="Shop">
          <li><Link to="/shop">All Products</Link></li>
          <li><Link to="/wishlist">Wishlist</Link></li>
          <li><Link to="/cart">Cart</Link></li>
        </FooterSection>

        <FooterSection id="company" title="Company">
          <li><Link to="/about">About Us</Link></li>
          <li><Link to="/shipping-policy">Shipping & Delivery</Link></li>
          <li><Link to="/returns-refunds">Returns & Refunds</Link></li>
          <li><Link to="/privacy-policy">Privacy Policy</Link></li>
          <li><Link to="/terms-conditions">Terms & Conditions</Link></li>
          <li><Link to="/contact">Contact Us</Link></li>
        </FooterSection>

        <FooterSection id="contact" title="Contact">
          {settings?.contactEmail && (
            <li className="footer-contact-item">
              <Mail size={14} /> <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
            </li>
          )}
          {settings?.contactPhone && (
            <li className="footer-contact-item">
              <Phone size={14} /> <a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a>
            </li>
          )}
        </FooterSection>
      </div>

      <div className="footer-bottom container">
        <ul className="footer-payments" aria-label="Accepted payment methods">
          {payments.map((m) => (
            <li key={m} className="footer-payment-chip">{m}</li>
          ))}
        </ul>
        <p>© {new Date().getFullYear()} {settings?.brandName || 'Satvex'}. All rights reserved.</p>
      </div>
    </footer>
  );
}
