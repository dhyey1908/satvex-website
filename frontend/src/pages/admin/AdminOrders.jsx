import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export function AdminOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  function load() {
    setError(null);
    adminService
      .orders({ status, search })
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [status]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Orders</h1>
      </div>

      <form className="admin-filters" onSubmit={handleSearchSubmit}>
        <input
          placeholder="Search by order id, name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-outline btn-sm">
          Search
        </button>
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !orders && <Loader label="Loading orders…" />}
      {!error && orders?.length === 0 && <EmptyState title="No orders found" />}

      {!error && orders?.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{o.orderId.slice(0, 8)}</td>
                  <td>{o.customer.name}</td>
                  <td>₹{o.total.toFixed(2)}</td>
                  <td>
                    <span className={`pill ${o.status === 'Cancelled' ? 'pill-inactive' : 'pill-active'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/admin/orders/${o.orderId}`} className="btn btn-ghost btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
