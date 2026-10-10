import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search as SearchIcon, Eye, AlertTriangle } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
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

  const {
    page,
    setPage,
    totalPages,
    pageItems: pageOrders,
    total: totalOrders,
    rangeStart,
    rangeEnd,
  } = usePagination(orders, PAGE_SIZE);

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
                  <th>Payment</th>
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
                    <td>
                      {o.paymentMethod === 'Online' ? (
                        <span className={`pill ${o.paymentStatus === 'paid' ? 'pill-active' : 'pill-inactive'}`}>
                          {o.paymentStatus === 'paid'
                            ? 'Paid'
                            : o.paymentStatus === 'expired'
                            ? 'Expired'
                            : o.paymentStatus === 'awaiting_payment' && o.lastPaymentAttemptStatus === 'FAILED'
                            ? 'Failed'
                            : o.paymentStatus === 'awaiting_payment' && o.lastPaymentAttemptStatus === 'USER_DROPPED'
                            ? 'Dropped'
                            : o.paymentStatus === 'awaiting_payment' && o.lastPaymentAttemptStatus === 'PENDING'
                            ? 'Pending'
                            : 'Awaiting'}
                        </span>
                      ) : (
                        <span className="text-label-sm">COD</span>
                      )}
                      {o.needsReview && <AlertTriangle size={14} className="admin-needs-review-icon" title="Needs review" />}
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

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalOrders}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="orders"
          />
        </>
      )}
    </div>
  );
}
