import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useMatch } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { Heart, ShoppingBag, Menu, User, Package, MapPin, UserCog, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthGate } from '../context/AuthGateContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { BrandLogo } from './BrandLogo';
import { SearchOverlay } from './SearchOverlay';
import { AccountMenu } from './AccountMenu';
import { useToast } from '../context/ToastContext';
import { SPRING_SOFT } from '../motion';
import './Header.css';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

// Same destinations as AccountSidebar's desktop LINKS — the mobile hamburger
// menu is now the only place these live on small screens (the old
// horizontal tab strip above account pages was removed), so it needs the
// full set, not just a subset.
const ACCOUNT_LINKS = [
  { to: '/account', label: 'Account Overview', icon: User, end: true },
  { to: '/account/orders', label: 'My Orders', icon: Package },
  { to: '/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/profile', label: 'Profile', icon: UserCog },
];

export function Header() {
  const { isAuthenticated, user, logout } = useAuth();
  const { openLogin } = useAuthGate();
  const { itemCount: cartCount } = useCart();
  const { itemCount: wishlistCount } = useWishlist();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // The Product Detail Page renders its own compact mobile header (back /
  // search / cart) — the full nav header is redundant there on small
  // screens, so it's hidden via CSS only (desktop is untouched).
  const isProductDetail = useMatch('/product/:slug');

  const { scrollY } = useScroll();
  const headerShadowOpacity = useTransform(scrollY, [0, 80], [0, 1]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

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
    <motion.header
      className={`site-header ${isProductDetail ? 'site-header-pdp' : ''}`}
      initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ boxShadow: useTransform(headerShadowOpacity, (v) => `0 8px 24px -12px rgba(9,7,7,${v * 0.15})`) }}
    >
      <div className="container site-header-inner">
        <Link to="/" className="brand-logo" aria-label="Satvex home">
          <BrandLogo height={36} />
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {({ isActive }) => (
                <>
                  {link.label}
                  {isActive && (
                    <motion.span
                      className="nav-underline"
                      layoutId="nav-underline"
                      transition={prefersReducedMotion ? { duration: 0 } : SPRING_SOFT}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <SearchOverlay />
          <NavLink
            to="/wishlist"
            className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
            aria-label={`Wishlist (${wishlistCount} items)`}
          >
            <Heart size={20} />
            {wishlistCount > 0 && <span className="badge">{wishlistCount}</span>}
          </NavLink>
          <NavLink
            to="/cart"
            className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
            aria-label={`Cart (${cartCount} items)`}
          >
            <ShoppingBag size={20} />
            {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </NavLink>

          <div className="header-account-desktop">
            {isAuthenticated ? (
              <AccountMenu />
            ) : (
              <button type="button" className="btn btn-outline btn-sm" onClick={openLogin}>
                Login
              </button>
            )}
          </div>

          <button
            type="button"
            className="icon-btn nav-mobile-toggle"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
      {mobileOpen && (
        <motion.nav
          className="nav-mobile container"
          aria-label="Mobile"
          initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMobileOpen(false)}>
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated ? (
            <>
              <div className="nav-mobile-divider" />
              {user?.role === 'admin' ? (
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `nav-mobile-account-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Settings size={18} /> Admin Panel
                </NavLink>
              ) : (
                ACCOUNT_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) => `nav-mobile-account-link ${isActive ? 'active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <link.icon size={18} /> {link.label}
                  </NavLink>
                ))
              )}
              <button type="button" className="nav-mobile-account-link nav-mobile-logout" onClick={handleMobileLogout}>
                <LogOut size={18} /> Log Out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nav-mobile-account-link"
              onClick={() => {
                setMobileOpen(false);
                openLogin();
              }}
            >
              Login
            </button>
          )}
        </motion.nav>
      )}
      </AnimatePresence>
    </motion.header>
  );
}
