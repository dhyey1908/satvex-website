import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, AlertTriangle } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { AdminSearchField, SortableTh, ResetFiltersButton, DateFilter, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import { effectivePaymentStatus } from '../../utils/paymentStatus';
import { formatDate } from '../../utils/date';
import './Admin.css';

const ADMIN_PAYMENT_LIST_LABELS = {
  paid: 'Paid',
  expired: 'Expired',
  failed: 'Failed',
  dropped: 'Dropped',
  confirming: 'Pending',
  awaiting: 'Awaiting',
};

const SHIPMENT_STATUS_LABELS = {
  not_created: 'Not Created',
  order_created: 'Order Created',
  awb_assigned: 'AWB Assigned',
  pickup_scheduled: 'Pickup Scheduled',
  label_generated: 'Label Ready',
  // Set once a sync job exhausts all retries (see shipmentJobService/
  // shipmentSweep.js) — distinct from 'not_created' so a stuck PAID order
  // never reads the same as a brand-new unpaid one in this table.
  sync_failed: 'Sync Failed',
};

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const SHIPMENT_STATUSES = Object.keys(SHIPMENT_STATUS_LABELS);
const PAGE_SIZE = 20;

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: {
    status: '',
    paymentMethod: '',
    paymentStatus: '',
    shipmentStatus: '',
    courier: '',
    deliveryStatus: '',
    dateFrom: '',
    dateTo: '',
  },
};

function toCsv(orders) {
  const header = ['Order ID', 'Customer', 'Email', 'Total', 'Status', 'Date'];
  const rows = orders.map((o) => [
    o.orderId,
    o.customer?.name || '',
    o.customer?.email || '',
    Number(o.total || 0).toFixed(2),
    o.status || '',
    o.createdAt ? new Date(o.createdAt).toISOString() : '',
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function AdminOrders() {
  const { showToast } = useToast();
  const list = useAdminList({
    fetcher: adminService.orders,
    resultKey: 'orders',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: orders, filters, setFilter, facets } = list;
  const [selected, setSelected] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // A different page / filter shows different orders — a selection made on
  // the previous view shouldn't silently ride along into a bulk update.
  function resetSelection() {
    setSelected([]);
  }

  function toggleSelect(orderId) {
    setSelected((prev) => (prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]));
  }

  const pageOrders = orders || [];
  const allOnPageSelected = pageOrders.length > 0 && pageOrders.every((o) => selected.includes(o.orderId));

  function toggleSelectAllOnPage() {
    const pageIds = pageOrders.map((o) => o.orderId);
    setSelected((prev) =>
      allOnPageSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.length === 0) return;
    setBulkUpdating(true);
    try {
      await Promise.all(selected.map((id) => adminService.updateOrderStatus(id, bulkStatus)));
      showToast(`Updated ${selected.length} order(s) to ${bulkStatus}`, 'success');
      setBulkStatus('');
      resetSelection();
      list.reload();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkUpdating(false);
    }
  }

  // Exports EVERY order matching the current search/filters/sort, not just the
  // page on screen.
  async function exportCsv() {
    setExporting(true);
    try {
      const all = await list.fetchAll();
      const blob = new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  const sortProps = {
    sortBy: list.sortBy,
    sortDir: list.sortDir,
    onSort: (field, firstDir) => {
      list.toggleSort(field, firstDir);
      resetSelection();
    },
  };
  const initialLoad = !orders && list.loading;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Orders</h1>
        {list.pagination?.total > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={exporting}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      <div className="admin-filters">
        <AdminSearchField
          value={list.searchInput}
          onChange={(v) => {
            list.setSearchInput(v);
            resetSelection();
          }}
          placeholder="Search by order id, name, email, phone, AWB…"
          label="Search orders"
        />
        <select
          value={filters.status}
          onChange={(e) => { setFilter('status', e.target.value); resetSelection(); }}
          aria-label="Order status"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filters.paymentMethod}
          onChange={(e) => { setFilter('paymentMethod', e.target.value); resetSelection(); }}
          aria-label="Payment method"
        >
          <option value="">COD &amp; Prepaid</option>
          <option value="COD">COD</option>
          <option value="Online">Prepaid (Online)</option>
        </select>
        <select
          value={filters.paymentStatus}
          onChange={(e) => { setFilter('paymentStatus', e.target.value); resetSelection(); }}
          aria-label="Payment status"
        >
          <option value="">All Payment States</option>
          {Object.entries(ADMIN_PAYMENT_LIST_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={filters.shipmentStatus}
          onChange={(e) => { setFilter('shipmentStatus', e.target.value); resetSelection(); }}
          aria-label="Shipping status"
        >
          <option value="">All Shipping Statuses</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{SHIPMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {facets.couriers?.length > 0 && (
          <select
            value={filters.courier}
            onChange={(e) => { setFilter('courier', e.target.value); resetSelection(); }}
            aria-label="Courier"
          >
            <option value="">All Couriers</option>
            {facets.couriers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {facets.deliveryStatuses?.length > 0 && (
          <select
            value={filters.deliveryStatus}
            onChange={(e) => { setFilter('deliveryStatus', e.target.value); resetSelection(); }}
            aria-label="Delivery status"
          >
            <option value="">All Delivery Statuses</option>
            {facets.deliveryStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <DateFilter
          label="From"
          value={filters.dateFrom}
          max={filters.dateTo}
          onChange={(v) => { setFilter('dateFrom', v); resetSelection(); }}
        />
        <DateFilter
          label="To"
          value={filters.dateTo}
          min={filters.dateFrom}
          onChange={(v) => { setFilter('dateTo', v); resetSelection(); }}
        />
        <ResetFiltersButton
          visible={list.hasActiveFilters}
          onClick={() => {
            list.reset();
            resetSelection();
          }}
        />
      </div>

      {selected.length > 0 && (
        <form className="admin-filters" onSubmit={(e) => e.preventDefault()}>
          <span className="text-label-sm" style={{ alignSelf: 'center' }}>
            {selected.length} selected
          </span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="Bulk status">
            <option value="">Set status to…</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
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

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.error && initialLoad && <Loader label="Loading orders…" />}
      {!list.error && orders?.length === 0 && (
        <EmptyState
          title="No orders found"
          message={list.hasActiveFilters ? 'No orders match these filters. Try resetting them.' : undefined}
        />
      )}

      {!list.error && orders?.length > 0 && (
        <>
          <ResultCount pagination={list.pagination} loading={list.loading} label="orders" />
          <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
            <table className="admin-table admin-table-compact">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                      aria-label="Select all orders on this page"
                    />
                  </th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <SortableTh label="Total" field="total" firstDir="desc" {...sortProps} />
                  <SortableTh label="Status" field="status" {...sortProps} />
                  <SortableTh label="Method" field="paymentMethod" {...sortProps} />
                  <SortableTh label="Payment" field="paymentStatus" {...sortProps} />
                  <SortableTh label="Shipping" field="shipmentStatus" {...sortProps} />
                  <SortableTh label="Date" field="createdAt" firstDir="desc" {...sortProps} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(o.orderId)}
                        onChange={() => toggleSelect(o.orderId)}
                        aria-label={`Select order ${o.orderId.slice(0, 8)}`}
                      />
                    </td>
                    <td>{o.orderId.slice(0, 8)}</td>
                    <td>{o.customer?.name || '—'}</td>
                    <td>₹{Number(o.total || 0).toFixed(2)}</td>
                    <td>
                      <span className={`pill ${o.status === 'Cancelled' ? 'pill-inactive' : 'pill-active'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      <span className="text-label-sm">{o.paymentMethod === 'Online' ? 'Prepaid' : 'COD'}</span>
                    </td>
                    <td>
                      {o.paymentMethod === 'Online' ? (
                        <span className={`pill ${o.paymentStatus === 'paid' ? 'pill-active' : 'pill-inactive'}`}>
                          {ADMIN_PAYMENT_LIST_LABELS[effectivePaymentStatus(o)] || o.paymentStatus}
                        </span>
                      ) : (
                        <span className="text-label-sm">—</span>
                      )}
                      {o.needsReview && <AlertTriangle size={14} className="admin-needs-review-icon" title="Needs review" />}
                    </td>
                    <td>
                      <span
                        className={`pill ${o.shipmentStatus === 'sync_failed' ? 'pill-danger' : o.awbCode ? 'pill-active' : 'pill-inactive'}`}
                      >
                        {SHIPMENT_STATUS_LABELS[o.shipmentStatus] || o.shipmentStatus || 'Not Created'}
                      </span>
                    </td>
                    <td>{formatDate(o.createdAt)}</td>
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

          {list.paginationProps && (
            <Pagination
              {...list.paginationProps}
              onPageChange={(p) => {
                list.setPage(p);
                resetSelection();
              }}
              itemLabel="orders"
            />
          )}
        </>
      )}
    </div>
  );
}
