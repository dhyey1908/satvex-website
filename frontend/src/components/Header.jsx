import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { SearchIcon, HeartIcon, BagIcon, MenuIcon, UserIcon, OrderBagIcon, SettingsGearIcon, LogoutIcon } from './Icons';
import { BrandLogo } from './BrandLogo';
import { SearchOverlay } from './SearchOverlay';
import { AccountMenu } from './AccountMenu';
import { useToast } from '../context/ToastContext';
import './Header.css';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export function Header() {
  const { isAuthenticated, user, logout } = useAuth();
  const { itemCount: cartCount } = useCart();
  const { itemCount: wishlistCount } = useWishlist();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  async function handleMobileLogout() {
    setMobileOpen(false);
    try {
      await logout();
      showToast('Logged out successfully', 'success');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link to="/" className="brand-logo" aria-label="Satvex home">
          <BrandLogo height={36} />
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon />
          </button>
          <Link to="/wishlist" className="icon-btn" aria-label={`Wishlist (${wishlistCount} items)`}>
            <HeartIcon />
            {wishlistCount > 0 && <span className="badge">{wishlistCount}</span>}
          </Link>
          <Link to="/cart" className="icon-btn" aria-label={`Cart (${cartCount} items)`}>
            <BagIcon />
            {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </Link>

          <div className="header-account-desktop">
            {isAuthenticated ? (
              <AccountMenu />
            ) : (
              <Link to="/login" className="btn btn-outline btn-sm">
                Login
              </Link>
            )}
          </div>

          <button
            type="button"
            className="icon-btn nav-mobile-toggle"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {mobileOpen && (
        <nav className="nav-mobile container" aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMobileOpen(false)}>
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated ? (
            <>
              <div className="nav-mobile-divider" />
              {user?.role === 'admin' ? (
                <Link to="/admin" className="nav-mobile-account-link" onClick={() => setMobileOpen(false)}>
                  <SettingsGearIcon /> Admin Panel
                </Link>
              ) : (
                <>
                  <Link to="/account" className="nav-mobile-account-link" onClick={() => setMobileOpen(false)}>
                    <UserIcon /> My Account
                  </Link>
                  <Link to="/account/orders" className="nav-mobile-account-link" onClick={() => setMobileOpen(false)}>
                    <OrderBagIcon /> My Orders
                  </Link>
                  <Link to="/wishlist" className="nav-mobile-account-link" onClick={() => setMobileOpen(false)}>
                    <HeartIcon /> Wishlist
                  </Link>
                </>
              )}
              <button type="button" className="nav-mobile-account-link nav-mobile-logout" onClick={handleMobileLogout}>
                <LogoutIcon /> Log Out
              </button>
            </>
          ) : (
            <Link to="/login" onClick={() => setMobileOpen(false)}>
              Login / Signup
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
