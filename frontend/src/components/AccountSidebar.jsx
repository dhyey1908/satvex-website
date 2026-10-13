import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SPRING_SOFT } from '../motion';
import './AccountSidebar.css';

const LINKS = [
  { to: '/account', label: 'Account Overview', end: true },
  { to: '/account/orders', label: 'My Orders' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/profile', label: 'Profile' },
];

export function AccountSidebar() {
  const { logout } = useAuth();

  return (
    <nav className="account-sidebar">
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  className="account-sidebar-indicator"
                  layoutId="account-sidebar-indicator"
                  transition={SPRING_SOFT}
                />
              )}
              <span className="account-sidebar-label">{link.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button type="button" className="account-sidebar-logout" onClick={logout}>
        <LogOut size={16} /> Logout
      </button>
    </nav>
  );
}
