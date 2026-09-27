import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import './Admin.css';

const LABELS = {
  totalProducts: 'Total Products',
  activeProducts: 'Active Products',
  totalOrders: 'Total Orders',
  pendingOrders: 'Pending Orders',
  completedOrders: 'Completed Orders',
  totalCustomers: 'Total Customers',
};

export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminService
      .dashboard()
      .then((data) => setStats(data.stats))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!stats) return <Loader label="Loading dashboard…" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Dashboard</h1>
      </div>
      <div className="stat-grid">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key} className="stat-tile">
            <div className="stat-value">{stats[key]}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
