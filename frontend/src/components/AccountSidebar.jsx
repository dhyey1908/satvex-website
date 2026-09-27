import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AccountSidebar.css';

const LINKS = [
  { to: '/account', label: 'Account Overview', end: true },
  { to: '/account/orders', label: 'My Orders' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/profile', label: 'Profile' },
  { to: '/account/change-password', label: 'Change Password' },
];

export function AccountSidebar() {
  const { logout } = useAuth();

  return (
    <nav className="account-sidebar">
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {link.label}
        </NavLink>
      ))}
      <button type="button" className="account-sidebar-logout" onClick={logout}>
        Logout
      </button>
    </nav>
  );
}
