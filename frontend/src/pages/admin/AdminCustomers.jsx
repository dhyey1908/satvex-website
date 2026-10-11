import { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { formatDate } from '../../utils/date';
import './Admin.css';

const PAGE_SIZE = 20;

export function AdminCustomers() {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminService
      .customers()
      .then((data) => setCustomers(data.customers))
      .catch((err) => setError(err.message));
  }, []);

  const visible = useMemo(() => {
    if (!customers) return null;
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term)
    );
  }, [customers, search]);

  const { page, setPage, totalPages, pageItems: pageCustomers, total: totalVisible, rangeStart, rangeEnd } =
    usePagination(visible, PAGE_SIZE);

  if (error) return <ErrorState message={error} />;
  if (!customers) return <Loader label="Loading customers…" />;
  if (customers.length === 0) return <EmptyState title="No customers yet" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Customers</h1>
      </div>

      <form className="admin-filters" onSubmit={(e) => e.preventDefault()}>
        <input
          placeholder="Search by name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      {visible.length === 0 && <EmptyState title="No customers match your search" />}

      {visible.length > 0 && (
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
              {pageCustomers.map((c) => (
                <tr key={c.userId}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td>{c.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalVisible}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="customers"
          />
        </div>
      )}
    </div>
  );
}
