import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { BrandLogo } from './BrandLogo';
import { InstagramIcon } from './InstagramIcon';
import './Footer.css';

export function Footer() {
  const { settings } = useSettings();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand-col">
          <BrandLogo height={40} light />
          <p>Modern women-focused essentials — flexible, comfortable, durable, and distinctly Satvex.</p>
        </div>

        <div className="footer-col">
          <h4>Shop</h4>
          <ul>
            <li><Link to="/shop">All Products</Link></li>
            <li><Link to="/wishlist">Wishlist</Link></li>
            <li><Link to="/cart">Cart</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Company</h4>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/contact">Contact Us</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Contact</h4>
          <ul>
            {settings?.contactEmail && (
              <li className="footer-contact-item">
                <Mail size={14} /> <span>{settings.contactEmail}</span>
              </li>
            )}
            {settings?.contactPhone && (
              <li className="footer-contact-item">
                <Phone size={14} /> <span>{settings.contactPhone}</span>
              </li>
            )}
            {settings?.instagramUrl && (
              <li className="footer-contact-item">
                <InstagramIcon size={14} />{' '}
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
