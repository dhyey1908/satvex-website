import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search as SearchIcon, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const PAGE_SIZE = 20;

function toCsv(orders) {
  const header = ['Order ID', 'Customer', 'Email', 'Total', 'Status', 'Date'];
  const rows = orders.map((o) => [
    o.orderId,
    o.customer.name,
    o.customer.email || '',
    o.total.toFixed(2),
    o.status,
    new Date(o.createdAt).toISOString(),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function AdminOrders() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  function load() {
    setError(null);
    adminService
      .orders({ status, search })
      .then((data) => {
        setOrders(data.orders);
        setPage(1);
        setSelected([]);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [status]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    load();
  }

  const totalPages = orders ? Math.max(1, Math.ceil(orders.length / PAGE_SIZE)) : 1;
  const pageOrders = useMemo(() => {
    if (!orders) return [];
    const start = (page - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, page]);

  function toggleSelect(orderId) {
    setSelected((prev) => (prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]));
  }

  function toggleSelectAllOnPage() {
    const pageIds = pageOrders.map((o) => o.orderId);
    const allSelected = pageIds.every((id) => selected.includes(id));
    setSelected((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.length === 0) return;
    setBulkUpdating(true);
    try {
      await Promise.all(selected.map((id) => adminService.updateOrderStatus(id, bulkStatus)));
      showToast(`Updated ${selected.length} order(s) to ${bulkStatus}`, 'success');
      setBulkStatus('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkUpdating(false);
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(orders)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const allOnPageSelected = pageOrders.length > 0 && pageOrders.every((o) => selected.includes(o.orderId));

  return (
    <div>
      <div className="admin-page-header">
        <h1>Orders</h1>
        {orders?.length > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </button>
        )}
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
          <SearchIcon size={14} /> Search
        </button>
      </form>

      {selected.length > 0 && (
        <form className="admin-filters" onSubmit={(e) => e.preventDefault()}>
          <span className="text-label-sm" style={{ alignSelf: 'center' }}>
            {selected.length} selected
          </span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            <option value="">Set status to…</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!bulkStatus || bulkUpdating}
            onClick={applyBulkStatus}
          >
            {bulkUpdating ? 'Updating…' : 'Apply'}
          </button>
        </form>
      )}

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !orders && <Loader label="Loading orders…" />}
      {!error && orders?.length === 0 && <EmptyState title="No orders found" />}

      {!error && orders?.length > 0 && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} />
                  </th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((o) => (
                  <tr key={o.orderId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(o.orderId)}
                        onChange={() => toggleSelect(o.orderId)}
                      />
                    </td>
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
                        <Eye size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="admin-pagination">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-label-sm">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
