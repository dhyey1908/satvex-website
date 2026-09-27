import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

export function AdminCustomers() {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminService
      .customers()
      .then((data) => setCustomers(data.customers))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!customers) return <Loader label="Loading customers…" />;
  if (customers.length === 0) return <EmptyState title="No customers yet" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Customers</h1>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Registered</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.userId}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.phone || '—'}</td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>{c.orderCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
