import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { TrendChart } from '../../components/TrendChart';
import './Admin.css';

const LABELS = {
  totalProducts: 'Total Products',
  activeProducts: 'Active Products',
  totalOrders: 'Total Orders',
  pendingOrders: 'Pending Orders',
  completedOrders: 'Completed Orders',
  totalCustomers: 'Total Customers',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function buildDailySeries(orders, days) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    buckets.set(d.toISOString().slice(0, 10), { orders: 0, revenue: 0 });
  }
  orders.forEach((o) => {
    const createdAt = new Date(o.createdAt);
    if (Number.isNaN(createdAt.getTime())) return; // no/invalid createdAt — skip rather than crash the chart
    const key = createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      const bucket = buckets.get(key);
      bucket.orders += 1;
      bucket.revenue += Number(o.total) || 0;
    }
  });
  return Array.from(buckets.entries()).map(([date, v]) => ({
    label: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    orderCount: v.orders,
    revenue: v.revenue,
  }));
}

export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState(null);
  const [range, setRange] = useState(7);

  useEffect(() => {
    adminService
      .dashboard()
      .then((data) => setStats(data.stats))
      .catch((err) => setError(err.message));
    adminService
      .orders({})
      .then((data) => setOrders(data.orders))
      .catch(() => setOrders([]));
  }, []);

  const series = useMemo(() => (orders ? buildDailySeries(orders, range) : []), [orders, range]);
  const ordersSeries = series.map((s) => ({ label: s.label, value: s.orderCount }));
  const revenueSeries = series.map((s) => ({ label: s.label, value: s.revenue }));

  if (error) return <ErrorState message={error} />;
  if (!stats) return <Loader label="Loading dashboard…" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Dashboard</h1>
        <Link to="/" className="btn btn-outline btn-sm">
          <ArrowLeft size={16} /> Back to Customer View
        </Link>
      </div>
      <div className="stat-grid">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key} className="stat-tile">
            <div className="stat-value">{stats[key]}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="admin-page-header" style={{ marginTop: 'var(--sp-xl)' }}>
        <h3 className="checkout-section-title" style={{ margin: 0 }}>Trends</h3>
        <div className="admin-filters" style={{ margin: 0 }}>
          <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {!orders && <Loader label="Loading trends…" />}

      {orders && (
        <div className="trend-chart-grid">
          <div className="stat-tile">
            <div className="stat-label">Orders</div>
            <TrendChart data={ordersSeries} />
          </div>
          <div className="stat-tile">
            <div className="stat-label">Revenue</div>
            <TrendChart data={revenueSeries} formatValue={(v) => `₹${v.toFixed(0)}`} />
          </div>
        </div>
      )}
    </div>
  );
}
