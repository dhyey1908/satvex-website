import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { AdminSearchField, SortableTh, ResetFiltersButton, DateFilter, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDateTime } from '../../utils/date';
import './Admin.css';

const BUCKET_LABELS = {
  retrying: 'Retrying',
  failed: 'Failed — Needs Action',
  no_job: 'Not Synced',
};
const BUCKET_PILL_CLASS = {
  retrying: 'pill-warning',
  failed: 'pill-danger',
  no_job: 'pill-danger',
};
const SHIPMENT_STATUS_LABELS = {
  not_created: 'Not Created',
  order_created: 'Order Created',
  awb_assigned: 'AWB Assigned',
  pickup_scheduled: 'Pickup Scheduled',
  label_generated: 'Label Ready',
  sync_failed: 'Sync Failed',
};
const PAGE_SIZE = 20;
const LIST_DEFAULTS = {
  sortBy: 'paidAt',
  sortDir: 'desc',
  filters: { bucket: '', shipmentStatus: '', courier: '', deliveryStatus: '', dateFrom: '', dateTo: '' },
};

export function AdminShipmentIssues() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const list = useAdminList({
    fetcher: adminService.shipmentSyncIssues,
    resultKey: 'issues',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: issues, data, filters, setFilter, facets } = list;
  const load = list.reload;
  const sortProps = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort };
  const [retryingId, setRetryingId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);

  async function handleRetryOne(orderId) {
    setRetryingId(orderId);
    try {
      await adminService.retryShipment(orderId);
      showToast('Shipment retry succeeded', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
      load(); // attempt count/last error changed even on failure
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRetryAll() {
    const ok = await confirm({
      title: 'Retry all failed shipments?',
      message: `This retries ${data.counts.total} order(s) one at a time against Shiprocket. It can take a while for a large list.`,
      confirmLabel: 'Retry All',
    });
    if (!ok) return;
    setRetryingAll(true);
    try {
      const result = await adminService.retryAllShipments();
      showToast(`Retried ${result.total}: ${result.succeeded} succeeded, ${result.failed} still failing`, result.failed > 0 ? 'warning' : 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetryingAll(false);
    }
  }

  if (list.error && !data) return <ErrorState message={list.error} onRetry={load} />;
  if (!data) return <Loader label="Loading shipment sync issues…" />;

  // Counts always describe every sync issue, whatever the filters on screen.
  const { counts } = data;
  const nothingAtAll = counts.total === 0;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Shipment Sync Issues</h1>
        {!nothingAtAll && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleRetryAll} disabled={retryingAll}>
            <RefreshCw size={14} /> {retryingAll ? 'Retrying…' : 'Retry All Failed'}
          </button>
        )}
      </div>

      {!nothingAtAll && (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
          {counts.total} order(s) paid/confirmed but not yet shipped to Shiprocket — {counts.retrying} still retrying
          automatically, {counts.failed} exhausted retries and need action, {counts.noJob} never got a sync job queued
          (e.g. Shiprocket was disabled when the order was paid).
        </p>
      )}

      {nothingAtAll && <EmptyState title="No shipment sync issues" message="Every paid order has synced to Shiprocket." />}

      {!nothingAtAll && (
        <div className="admin-filters">
          <AdminSearchField
            value={list.searchInput}
            onChange={list.setSearchInput}
            placeholder="Search by order id or customer…"
            label="Search shipment issues"
          />
          <select value={filters.bucket} onChange={(e) => setFilter('bucket', e.target.value)} aria-label="Retry status">
            <option value="">All retry states</option>
            {Object.entries(BUCKET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filters.shipmentStatus}
            onChange={(e) => setFilter('shipmentStatus', e.target.value)}
            aria-label="Shipment status"
          >
            <option value="">All shipment statuses</option>
            {Object.entries(SHIPMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {facets.couriers?.length > 0 && (
            <select value={filters.courier} onChange={(e) => setFilter('courier', e.target.value)} aria-label="Courier">
              <option value="">All couriers</option>
              {facets.couriers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {facets.deliveryStatuses?.length > 0 && (
            <select
              value={filters.deliveryStatus}
              onChange={(e) => setFilter('deliveryStatus', e.target.value)}
              aria-label="Delivery status"
            >
              <option value="">All delivery statuses</option>
              {facets.deliveryStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <DateFilter label="Paid from" value={filters.dateFrom} max={filters.dateTo} onChange={(v) => setFilter('dateFrom', v)} />
          <DateFilter label="to" value={filters.dateTo} min={filters.dateFrom} onChange={(v) => setFilter('dateTo', v)} />
          <ResetFiltersButton visible={list.hasActiveFilters} onClick={list.reset} />
        </div>
      )}

      {list.error && data && <ErrorState message={list.error} onRetry={load} />}

      {!nothingAtAll && issues?.length === 0 && (
        <EmptyState title="No issues match these filters" message="Try a different search or reset the filters." />
      )}

      {issues?.length > 0 && (
        <>
        <ResultCount pagination={list.pagination} loading={list.loading} label="orders" />
        <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
          <table className="admin-table admin-table-compact">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <SortableTh label="Amount" field="total" firstDir="desc" {...sortProps} />
                <SortableTh label="Paid" field="paidAt" firstDir="desc" {...sortProps} />
                <SortableTh label="Status" field="bucket" {...sortProps} />
                <SortableTh label="Attempts" field="attempts" firstDir="desc" {...sortProps} />
                <th>Courier</th>
                <th>Last Error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.orderId}>
                  <td>
                    <Link to={`/admin/orders/${i.orderId}`}>{i.orderId.slice(0, 8)}</Link>
                  </td>
                  <td>{i.customerName || '—'}</td>
                  <td>₹{Number(i.total || 0).toFixed(2)}</td>
                  <td>{i.paidAt ? formatDateTime(i.paidAt) : '—'}</td>
                  <td>
                    <span className={`pill ${BUCKET_PILL_CLASS[i.bucket]}`}>{BUCKET_LABELS[i.bucket]}</span>
                  </td>
                  <td>{i.attempts}</td>
                  <td>{i.courierName || '—'}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>{i.lastError || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRetryOne(i.orderId)}
                      disabled={retryingId === i.orderId || retryingAll}
                    >
                      {retryingId === i.orderId ? 'Retrying…' : 'Retry Shipment'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.paginationProps && <Pagination {...list.paginationProps} itemLabel="orders" />}
        </div>
        </>
      )}
    </div>
  );
}
