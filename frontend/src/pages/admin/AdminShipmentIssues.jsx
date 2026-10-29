import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, RefreshCw, Tag, Truck } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { LinkShipmentModal } from '../../components/LinkShipmentModal';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { useAdminList } from '../../hooks/useAdminList';
import { SHIPMENT_LABELS } from '../../utils/statusTones';
import { formatShortDateTime } from '../../utils/dateRange';
import { rupees } from '../../utils/csv';
import './Admin.css';
import './AdminLists.css';

const BUCKET_LABELS = { retrying: 'Retrying', failed: 'Failed — needs action', no_job: 'Not synced' };
const BUCKET_TONE = { retrying: 'amber', failed: 'red', no_job: 'red' };
const LIST_DEFAULTS = {
  sortBy: 'paidAt',
  sortDir: 'desc',
  filters: { bucket: '', shipmentStatus: '', courier: '', deliveryStatus: '', dateFrom: '', dateTo: '' },
};

export function AdminShipmentIssues() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const list = useAdminList({ fetcher: adminService.shipmentSyncIssues, resultKey: 'issues', defaults: LIST_DEFAULTS, pageSize: 25, urlSync: true });
  const { items: issues, data, filters, setFilter, facets } = list;
  const load = list.reload;
  const [retryingId, setRetryingId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);
  // The order whose "Shipped manually" dialog is open.
  const [linkingId, setLinkingId] = useState(null);

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
  const total = list.pagination?.total ?? 0;

  const columns = [
    { key: 'order', header: 'Order', className: 'ui-cell-primary', render: (i) => <Link className="ui-cell-main" to={`/admin/orders/${i.orderId}`}>#{i.orderId.slice(0, 8)}</Link> },
    { key: 'customer', header: 'Customer', render: (i) => i.customerName || <span className="ui-muted">—</span> },
    { key: 'amount', header: 'Amount', sortField: 'total', firstDir: 'desc', className: 'ui-num', render: (i) => <span className="ui-cell-main">{rupees(i.total)}</span> },
    { key: 'paid', header: 'Paid', sortField: 'paidAt', firstDir: 'desc', render: (i) => (i.paidAt ? formatShortDateTime(i.paidAt) : '—') },
    { key: 'status', header: 'Status', sortField: 'bucket', render: (i) => <StatusBadge tone={BUCKET_TONE[i.bucket]} label={BUCKET_LABELS[i.bucket]} /> },
    { key: 'attempts', header: 'Attempts', sortField: 'attempts', firstDir: 'desc', className: 'ui-num', render: (i) => i.attempts },
    { key: 'courier', header: 'Courier', render: (i) => i.courierName || <span className="ui-muted">—</span> },
    { key: 'error', header: 'Last error', className: 'ui-wrap', render: (i) => <span className="ui-cell-sub-clamp" style={{ margin: 0 }}>{i.lastError || '—'}</span> },
    {
      key: 'actions',
      header: '',
      className: 'ui-cell-actions',
      render: (i) => (
        <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => handleRetryOne(i.orderId)} disabled={retryingId === i.orderId || retryingAll}>
            {retryingId === i.orderId ? 'Retrying…' : 'Retry'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkingId(i.orderId)} disabled={retryingAll}>
            Shipped manually
          </button>
        </div>
      ),
    },
  ];

  const chips = [
    { key: 'bucket', label: 'Retry', icon: RefreshCw, options: Object.entries(BUCKET_LABELS).map(([value, label]) => ({ value, label, tone: BUCKET_TONE[value] })) },
    { key: 'shipmentStatus', label: 'Shipping', icon: Truck, options: Object.entries(SHIPMENT_LABELS).map(([value, label]) => ({ value, label })) },
  ];
  if (facets.couriers?.length) chips.push({ key: 'courier', label: 'Courier', icon: Tag, secondary: true, options: facets.couriers.map((c) => ({ value: c, label: c })) });
  if (facets.deliveryStatuses?.length) chips.push({ key: 'deliveryStatus', label: 'Delivery', icon: Truck, secondary: true, options: facets.deliveryStatuses.map((c) => ({ value: c, label: c })) });

  return (
    <div>
      <PageHeader
        title="Shipment sync issues"
        subtitle={nothingAtAll ? 'Nothing to fix' : countLabel(counts.total, 'order')}
        actions={
          !nothingAtAll && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleRetryAll} disabled={retryingAll}>
              <RefreshCw size={14} /> {retryingAll ? 'Retrying…' : 'Retry all failed'}
            </button>
          )
        }
      />

      {!nothingAtAll && (
        <p className="ui-muted" style={{ marginTop: 0, maxWidth: '52rem' }}>
          {counts.retrying} still retrying automatically, {counts.failed} used all retries and need action, {counts.noJob} never got a sync job (for example
          Shiprocket was off when the order was paid). Already booked one yourself in Shiprocket? Use <strong>Shipped manually</strong> so it stops showing here and is not booked twice.
        </p>
      )}

      {nothingAtAll ? (
        <TableEmpty icon={CheckCircle2} title="No shipment sync issues" message="Every paid order has synced to Shiprocket." />
      ) : (
        <>
          <FilterBar
            search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: 'Search order ID or customer…' }}
            chips={chips}
            values={filters}
            onChange={setFilter}
            date={{ label: 'Paid', from: filters.dateFrom, to: filters.dateTo, onChange: ({ from, to }) => { setFilter('dateFrom', from); setFilter('dateTo', to); } }}
            onClearAll={list.clearFilters}
            resultText={issues ? `Showing ${issues.length} of ${total} orders` : null}
            searchLabel="Search shipment issues"
          />
          {list.error && <ErrorState message={list.error} onRetry={load} />}
          <DataTable
            columns={columns}
            rows={issues}
            rowKey={(i) => i.orderId}
            loading={list.loading}
            sort={{ sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort }}
            caption="Shipment sync issues"
            empty={<TableEmpty title="No issues match these filters" message="Try a different search or clear the filters." filtered onClear={list.clearFilters} />}
          />
          <TableFooter paginationProps={list.paginationProps} pageSize={list.pageSize} onPageSize={list.setPageSize} itemLabel="orders" />
        </>
      )}

      <LinkShipmentModal open={Boolean(linkingId)} onClose={() => setLinkingId(null)} orderId={linkingId} onLinked={load} />
    </div>
  );
}
