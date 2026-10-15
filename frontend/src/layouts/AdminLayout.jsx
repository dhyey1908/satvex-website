import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
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

// How often the sidebar re-checks the sync-issue count while an admin is
// browsing — frequent enough to notice a new failure within a reasonable
// time without turning this into a real-time/websocket feature nobody asked
// for.
const SYNC_ISSUE_POLL_MS = 2 * 60 * 1000;

export function AdminLayout() {
  useDocumentMeta({ title: 'Admin', noindex: true });
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncIssueCount, setSyncIssueCount] = useState(0);

  useEffect(() => {
    function loadCount() {
      adminService
        .shipmentSyncIssues()
        .then((data) => setSyncIssueCount(data.counts.total))
        .catch(() => {}); // badge is a convenience, not worth surfacing an error for
    }
    loadCount();
    const interval = setInterval(loadCount, SYNC_ISSUE_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`admin-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="admin-sidebar">
        <div className="admin-brand">Satvex Admin</div>
        <nav>
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={17} /> {link.label}
                {link.to === '/admin/orders' && syncIssueCount > 0 && (
                  <span className="admin-nav-badge" title={`${syncIssueCount} paid order(s) not yet shipped to Shiprocket`}>
                    {syncIssueCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="admin-user">
          <span>{user?.name}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <button
            type="button"
            className="icon-btn"
            aria-label="Toggle menu"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <Menu size={20} />
          </button>
          <NavLink to="/" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Back to site
          </NavLink>
        </div>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
