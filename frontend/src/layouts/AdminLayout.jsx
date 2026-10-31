import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { confirmLeave } from '../utils/unsavedGuard';
import {
  Menu,
  ArrowLeft,
  LayoutDashboard,
  Package,
  ShoppingBag,
  BarChart3,
  Users,
  Tag,
  Star,
  Image as ImageIcon,
  Megaphone,
  Mail,
  Settings,
  ShieldAlert,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import './AdminLayout.css';

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true, icon: LayoutDashboard },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/coupons', label: 'Coupons', icon: Tag },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/banners', label: 'Banners', icon: ImageIcon },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/contacts', label: 'Contacts', icon: Mail },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

// How often the sidebar re-checks its numbers while an admin is browsing — frequent
// enough to notice something new without turning this into a real-time feature.
const POLL_MS = 2 * 60 * 1000;
const COLLAPSE_KEY = 'satvex-admin-sidebar-collapsed';
const REMIND_KEY = 'satvex-admin-2fa-remind-until';
const DAY_MS = 24 * 60 * 60 * 1000;

const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
};

const initials = (name) =>
  String(name || 'A')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function AdminLayout() {
  useDocumentMeta({ title: 'Admin', noindex: true });
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => read(COLLAPSE_KEY) === '1');
  const location = useLocation();
  const [remindUntil, setRemindUntil] = useState(() => Number(read(REMIND_KEY)) || 0);
  // An admin who has not turned on two-step sign-in yet is asked to, on every admin page
  // (until they tap "Remind me later", which hides it for 24 hours).
  const needsTwoStep =
    user?.role === 'admin' && user?.totpEnabled === false && !location.pathname.startsWith('/admin/settings/security') && Date.now() > remindUntil;
  const [syncIssueCount, setSyncIssueCount] = useState(0);
  const [counts, setCounts] = useState({ pendingOrders: 0, awaitingConfirmation: 0, addressNeedsFix: 0, openContacts: 0, unreadContacts: 0 });

  useEffect(() => {
    function load() {
      adminService.shipmentSyncIssues().then((data) => setSyncIssueCount(data.counts.total)).catch(() => {}); // badges are a convenience, not worth an error
      adminService.sidebarCounts().then(setCounts).catch(() => {});
    }
    load();
    const interval = setInterval(load, POLL_MS);
    // An order was confirmed / cancelled on the Orders screen: refresh the badges now.
    window.addEventListener('satvex-admin-counts-changed', load);
    return () => {
      clearInterval(interval);
      window.removeEventListener('satvex-admin-counts-changed', load);
    };
  }, [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      write(COLLAPSE_KEY, v ? '0' : '1');
      return !v;
    });
  }

  function remindLater() {
    const until = Date.now() + DAY_MS;
    write(REMIND_KEY, String(until));
    setRemindUntil(until);
  }

  const badgeFor = (to) => {
    if (to === '/admin/orders') return counts.pendingOrders;
    if (to === '/admin/contacts') return counts.openContacts;
    return 0;
  };

  return (
    <div className={`admin-shell ${sidebarOpen ? 'sidebar-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      {sidebarOpen && <div className="admin-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside className="admin-sidebar" aria-label="Admin menu">
        <div className="admin-brand">
          <span className="admin-brand-text">Satvex Admin</span>
          <button type="button" className="admin-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button type="button" className="admin-drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          {LINKS.map((link) => {
            const Icon = link.icon;
            const count = badgeFor(link.to);
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                title={collapsed ? link.label : undefined}
                className={({ isActive }) => (isActive ? 'active' : '')}
                onClick={(e) => {
                  if (!confirmLeave()) e.preventDefault();
                  else setSidebarOpen(false);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="admin-nav-label">{link.label}</span>
                {link.to === '/admin/orders' && syncIssueCount > 0 && (
                  <span className="admin-nav-badge is-danger" title={`${syncIssueCount} paid order(s) not yet shipped to Shiprocket`}>
                    {syncIssueCount}
                  </span>
                )}
                {link.to === '/admin/orders' && counts.addressNeedsFix > 0 && (
                  <span className="admin-nav-badge is-danger" title={`${counts.addressNeedsFix} order(s) Shiprocket refused: the address needs fixing`}>
                    {counts.addressNeedsFix}
                  </span>
                )}
                {link.to === '/admin/orders' && counts.awaitingConfirmation > 0 && (
                  <span className="admin-nav-badge is-warn" title={`${counts.awaitingConfirmation} COD order(s) waiting for a confirmation call`}>
                    {counts.awaitingConfirmation}
                  </span>
                )}
                {count > 0 && (
                  <span className="admin-nav-badge" title={link.to === '/admin/orders' ? `${count} pending order(s)` : `${count} open message(s)`}>
                    {count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="admin-user">
          <span className="admin-avatar" aria-hidden="true">{initials(user?.name)}</span>
          <span className="admin-user-text">
            <strong>{user?.name || 'Admin'}</strong>
            <small>{user?.role === 'admin' ? 'Owner / Admin' : user?.role}</small>
          </span>
          <button type="button" className="admin-logout" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <button type="button" className="icon-btn" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <NavLink to="/" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Back to site
          </NavLink>
        </div>
        <div className="admin-content">
          {needsTwoStep && (
            <div className="admin-security-banner" role="status">
              <ShieldAlert size={18} aria-hidden="true" />
              <span>Protect the admin with two-step sign-in.</span>
              <NavLink to="/admin/settings/security" className="btn btn-primary btn-sm">Set it up</NavLink>
              <button type="button" className="admin-remind" onClick={remindLater}>Remind me later</button>
            </div>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
