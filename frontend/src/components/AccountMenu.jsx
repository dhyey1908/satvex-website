import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { UserIcon, OrderBagIcon, HeartIcon, SettingsGearIcon, LogoutIcon, ChevronDownIcon } from './Icons';
import './AccountMenu.css';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function AccountMenu() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    try {
      await logout();
      showToast('Logged out successfully', 'success');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="account-menu-avatar">{getInitials(user?.name)}</span>
        <ChevronDownIcon className={`account-menu-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="account-menu-dropdown" role="menu">
          <div className="account-menu-header">
            <p className="account-menu-name">{user?.name}</p>
            <p className="account-menu-email">{user?.email}</p>
          </div>

          {isAdmin ? (
            <Link to="/admin" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <SettingsGearIcon /> Admin Panel
            </Link>
          ) : (
            <>
              <Link to="/account" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
                <UserIcon /> My Account
              </Link>
              <Link to="/account/orders" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
                <OrderBagIcon /> My Orders
              </Link>
              <Link to="/wishlist" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
                <HeartIcon /> Wishlist
              </Link>
            </>
          )}

          <div className="account-menu-divider" />
          <button type="button" className="account-menu-item account-menu-logout" role="menuitem" onClick={handleLogout}>
            <LogoutIcon /> Log Out
          </button>
        </div>
      )}
    </div>
  );
}
